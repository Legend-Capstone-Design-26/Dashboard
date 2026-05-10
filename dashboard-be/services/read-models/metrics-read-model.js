function createMetricsReadModel({ eventStore, experimentStore }) {
  function normalizeActorType(actorType) {
    return actorType === "synthetic_agent" ? "synthetic_agent" : "real_user";
  }

  function getEventTs(event) {
    if (typeof event?.ts === "number") return event.ts;
    if (typeof event?.received_at === "number") return event.received_at;
    return null;
  }

  function resolveClickLabel(props) {
    if (!props || typeof props !== "object") return "(no_element_id)";
    return props.track_id
      || props.data_track_id
      || props.aria_label
      || props.button_text
      || props.text_content
      || props.element_id
      || props.tag_name
      || "(no_element_id)";
  }

  function getExperimentMetrics({ siteId, key, fromTs, toTs, actorType, personaId }) {
    const exp = experimentStore.getByKey(siteId, key);
    if (!exp) {
      return { ok: false, reason: "experiment not found" };
    }

    const goals = Array.isArray(exp.goals) && exp.goals.length ? exp.goals : ["checkout_complete"];
    const events = [];

    for (const e of eventStore.readAll()) {
      if (e.site_id !== siteId) continue;
      const ts = getEventTs(e);
      if ((typeof fromTs === "number" || typeof toTs === "number") && typeof ts !== "number") continue;
      if (typeof fromTs === "number" && ts < fromTs) continue;
      if (typeof toTs === "number" && ts > toTs) continue;
      const exps = Array.isArray(e.experiments) ? e.experiments : [];
      const hit = exps.find((item) => item && item.key === key);
      if (!hit) continue;

      const normalizedActorType = normalizeActorType(e.actor_type);
      if (actorType && normalizedActorType !== actorType) continue;
      if (personaId && String(e.persona_id || "") !== personaId) continue;

      events.push({
        event_name: e.event_name,
        anon_user_id: e.anon_user_id,
        session_id: e.session_id,
        path: e.path,
        props: e.props || {},
        exp_variant: hit.variant || "A",
        ts,
        actor_type: normalizedActorType,
        persona_id: typeof e.persona_id === "string" ? e.persona_id : null,
      });
    }

    const init = () => ({
      users: new Set(),
      sessions: new Set(),
      page_views: 0,
      clicks: 0,
      conversions: 0,
      sessionStats: new Map(),
      clickElements: new Map(),
      durationTotalMs: 0,
      depthTotal: 0,
    });

    const byVariant = { A: init(), B: init() };

    for (const e of events) {
      const bucket = e.exp_variant === "B" ? byVariant.B : byVariant.A;
      if (e.anon_user_id) bucket.users.add(e.anon_user_id);
      if (e.session_id) bucket.sessions.add(e.session_id);

      const sid = e.session_id || "no_session";
      if (!bucket.sessionStats.has(sid)) {
        bucket.sessionStats.set(sid, {
          pageViews: 0,
          totalEvents: 0,
          firstTs: e.ts,
          lastTs: e.ts,
          dwellMs: 0,
          paths: new Set(),
        });
      }
      const stats = bucket.sessionStats.get(sid);
      stats.totalEvents += 1;
      if (typeof e.ts === "number") {
        if (typeof stats.firstTs !== "number" || e.ts < stats.firstTs) stats.firstTs = e.ts;
        if (typeof stats.lastTs !== "number" || e.ts > stats.lastTs) stats.lastTs = e.ts;
      }
      if (e.path) stats.paths.add(e.path);

      if (e.event_name === "page_view") {
        bucket.page_views += 1;
        stats.pageViews += 1;
      }
      if (e.event_name === "click") {
        bucket.clicks += 1;
        const elementId = resolveClickLabel(e.props);
        bucket.clickElements.set(elementId, (bucket.clickElements.get(elementId) || 0) + 1);
      }
      if (goals.includes(e.event_name)) bucket.conversions += 1;
      if (e.event_name === "dwell_time") {
        const dwellMs = Number(e.props?.dwell_ms || 0);
        if (Number.isFinite(dwellMs) && dwellMs > 0) stats.dwellMs += dwellMs;
      }
    }

    function finalize(bucket) {
      const sessions = bucket.sessions.size;
      let bounces = 0;
      let durationTotalMs = 0;
      let depthTotal = 0;
      for (const stats of bucket.sessionStats.values()) {
        if (stats.pageViews === 1 && stats.totalEvents === 1) bounces += 1;
        const fallbackDuration = (typeof stats.lastTs === "number" && typeof stats.firstTs === "number") ? Math.max(0, stats.lastTs - stats.firstTs) : 0;
        durationTotalMs += stats.dwellMs > 0 ? stats.dwellMs : fallbackDuration;
        depthTotal += stats.paths.size || stats.pageViews || 0;
      }
      return {
        users: bucket.users.size,
        sessions,
        page_views: bucket.page_views,
        clicks: bucket.clicks,
        conversions: bucket.conversions,
        cvr: sessions > 0 ? bucket.conversions / sessions : null,
        ctr: bucket.page_views > 0 ? bucket.clicks / bucket.page_views : null,
        bounce_rate: sessions > 0 ? bounces / sessions : null,
        avg_duration_ms: sessions > 0 ? durationTotalMs / sessions : null,
        avg_depth: sessions > 0 ? depthTotal / sessions : null,
        top_clicked_elements: Array.from(bucket.clickElements.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([element_id, count]) => ({ element_id, element_label: element_id, count })),
      };
    }

    return {
      ok: true,
      site_id: siteId,
      key,
      actor_type: actorType || null,
      persona_id: personaId || null,
      goals,
      experiment: {
        id: exp.id,
        status: exp.status,
        url_prefix: exp.url_prefix,
        version: exp.version,
        published_at: exp.published_at,
        updated_at: exp.updated_at,
        archived_at: exp.archived_at || null,
        traffic: exp.traffic || null,
        variants: exp.variants || { A: [], B: [] },
      },
      A: finalize(byVariant.A),
      B: finalize(byVariant.B),
      totals: { events: events.length },
    };
  }

  return {
    getExperimentMetrics,
  };
}

module.exports = { createMetricsReadModel };
