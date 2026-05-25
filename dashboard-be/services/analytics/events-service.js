const { createFileEventStore } = require("../stores/event-store");
const { inferStepFromEvent, inferStepFromPath } = require("../../analytics/funnel");

function createEventsService({ eventsFile, eventStore }) {
  const resolvedEventStore = eventStore || createFileEventStore({ eventsFile });

  const JOURNEY_STEPS = [
    { key: "home", label: "홈" },
    { key: "browse", label: "상품 목록" },
    { key: "product", label: "상품 상세" },
    { key: "cart", label: "장바구니" },
    { key: "checkout", label: "결제" },
    { key: "purchase", label: "구매 완료" },
  ];

  function getEventTs(event) {
    if (typeof event?.ts === "number") return event.ts;
    if (typeof event?.received_at === "number") return event.received_at;
    return null;
  }

  function inferJourneyStep(pathname, eventName, pathMappings) {
    const path = String(pathname || "");
    if (eventName === "checkout_complete") return "purchase";

    const mappings = (pathMappings && typeof pathMappings === "object") ? pathMappings : DEFAULT_PATH_MAPPINGS;

    for (const step of JOURNEY_STEPS) {
      const prefixes = Array.isArray(mappings[step.key]) ? mappings[step.key] : (DEFAULT_PATH_MAPPINGS[step.key] || []);
      for (const prefix of prefixes) {
        const p = String(prefix || "").trim();
        if (!p) continue;
        if (p === "/" ? path === "/" : path.startsWith(p)) return step.key;
      }
    }
    return null;
  }

  function createTrendBuckets(events, fromTs, toTs) {
    const now = Date.now();
    const start = typeof fromTs === "number" ? fromTs : Math.min(...events.map((e) => getEventTs(e)).filter((ts) => typeof ts === "number"));
    const end = typeof toTs === "number" ? toTs : Math.max(...events.map((e) => getEventTs(e)).filter((ts) => typeof ts === "number"), now);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

    const span = end - start;
    const bucketMs = span <= 24 * 60 * 60 * 1000
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    const bucketMap = new Map();

    for (let ts = start; ts <= end; ts += bucketMs) {
      const key = Math.floor(ts / bucketMs) * bucketMs;
      if (!bucketMap.has(key)) bucketMap.set(key, { ts: key, event_count: 0, sessions: new Set() });
    }

    for (const event of events) {
      const ts = getEventTs(event);
      if (typeof ts !== "number") continue;
      const key = Math.floor(ts / bucketMs) * bucketMs;
      if (!bucketMap.has(key)) bucketMap.set(key, { ts: key, event_count: 0, sessions: new Set() });
      const bucket = bucketMap.get(key);
      bucket.event_count += 1;
      if (event.session_id) bucket.sessions.add(event.session_id);
    }

    return Array.from(bucketMap.values())
      .sort((a, b) => a.ts - b.ts)
      .map((bucket) => ({
        ts: bucket.ts,
        session_count: bucket.sessions.size,
        event_count: bucket.event_count,
      }));
  }

  function buildJourneySummary(sessionTimeline, pathMappings) {
    const stepStats = JOURNEY_STEPS.map((step, index) => ({
      key: step.key,
      label: step.label,
      step_index: index,
      entered_sessions: 0,
      next_step_sessions: 0,
      next_step_rate: null,
      drop_rate: null,
      high_drop: false,
    }));

    let sessionCount = 0;

    for (const list of sessionTimeline.values()) {
      const pageViews = list
        .slice()
        .sort((a, b) => a.ts - b.ts)
        .filter((item) => item.event_name === "page_view" || item.event_name === "checkout_complete")
        .map((item) => {
          const step = inferStepFromEvent({ event_name: item.event_name, path: item.path }, pathMappings);
          // funnel.js는 "payment"를 쓰지만 JOURNEY_STEPS는 "purchase"를 사용
          return step === "payment" ? "purchase" : step;
        })
        .filter(Boolean);

      const uniqueSteps = [];
      for (const step of pageViews) {
        if (uniqueSteps[uniqueSteps.length - 1] !== step) uniqueSteps.push(step);
      }
      if (!uniqueSteps.length) continue;
      sessionCount += 1;

      JOURNEY_STEPS.forEach((step, index) => {
        const currentIndex = uniqueSteps.indexOf(step.key);
        if (currentIndex === -1) return;
        stepStats[index].entered_sessions += 1;
        if (index < JOURNEY_STEPS.length - 1) {
          const nextKey = JOURNEY_STEPS[index + 1].key;
          const nextIndex = uniqueSteps.indexOf(nextKey);
          if (nextIndex > currentIndex) stepStats[index].next_step_sessions += 1;
        }
      });
    }

    stepStats.forEach((step, index) => {
      if (index === JOURNEY_STEPS.length - 1) {
        step.next_step_rate = null;
        step.drop_rate = step.entered_sessions > 0 ? 0 : null;
        return;
      }
      if (step.entered_sessions === 0) {
        step.next_step_rate = null;
        step.drop_rate = null;
        return;
      }
      step.next_step_rate = step.next_step_sessions / step.entered_sessions;
      step.drop_rate = 1 - step.next_step_rate;
      step.high_drop = step.drop_rate >= 0.5;
    });

    return {
      ok: sessionCount > 0,
      total_sessions: sessionCount,
      steps: stepStats,
    };
  }

  function buildSdkStatus(siteEvents) {
    const timestamps = siteEvents.map((event) => getEventTs(event)).filter((ts) => typeof ts === "number");
    if (!timestamps.length) {
      return {
        status: "unknown",
        label: "수신 정보 없음",
        last_event_ts: null,
        recent_events_5m: 0,
      };
    }

    const now = Date.now();
    const lastEventTs = Math.max(...timestamps);
    const recentEvents5m = timestamps.filter((ts) => ts >= now - (5 * 60 * 1000)).length;
    const diffMs = now - lastEventTs;

    if (diffMs <= 5 * 60 * 1000) {
      return { status: "normal", label: "정상", last_event_ts: lastEventTs, recent_events_5m: recentEvents5m };
    }
    if (diffMs <= 30 * 60 * 1000) {
      return { status: "caution", label: "주의", last_event_ts: lastEventTs, recent_events_5m: recentEvents5m };
    }
    return { status: "missing", label: "미수신", last_event_ts: lastEventTs, recent_events_5m: recentEvents5m };
  }

  function getEventSummary({ siteId, page, fromTs, toTs, pathMappings }) {
    const allSiteEvents = resolvedEventStore.readAll().filter((e) => {
      if (e.site_id !== siteId) return false;
      const ts = getEventTs(e);
      if ((typeof fromTs === "number" || typeof toTs === "number") && typeof ts !== "number") return false;
      if (typeof fromTs === "number" && ts < fromTs) return false;
      if (typeof toTs === "number" && ts > toTs) return false;
      return true;
    });
    const siteEvents = resolvedEventStore.readAll().filter((e) => e.site_id === siteId);
    const filtered = page ? allSiteEvents.filter((e) => (e.path || "").startsWith(page)) : allSiteEvents;

    const pageViews = new Map();
    const elementClicks = new Map();
    const sessionTimeline = new Map();
    let checkoutComplete = 0;
    let checkoutPageViews = 0;
    let detailPageViews = 0;

    for (const e of filtered) {
      if (e.event_name === "page_view") {
        pageViews.set(e.path || "/", (pageViews.get(e.path || "/") || 0) + 1);
        const step = inferStepFromPath(e.path, pathMappings);
        if (step === "checkout") checkoutPageViews += 1;
        if (step === "product") detailPageViews += 1;
      }
      if (e.event_name === "click") {
        const elementId = e.props?.element_id || "(unknown)";
        elementClicks.set(elementId, (elementClicks.get(elementId) || 0) + 1);
      }
      if (e.event_name === "checkout_complete") checkoutComplete += 1;

      const sid = e.session_id || "no_session";
      if (!sessionTimeline.has(sid)) sessionTimeline.set(sid, []);
      sessionTimeline.get(sid).push({ ts: e.ts || e.received_at || 0, path: e.path || "/", event_name: e.event_name });
    }

    const transitionCount = new Map();
    for (const list of sessionTimeline.values()) {
      list.sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < list.length; i += 1) {
        const prev = list[i - 1].path;
        const next = list[i].path;
        if (prev === next) continue;
        const key = `${prev}=>${next}`;
        transitionCount.set(key, (transitionCount.get(key) || 0) + 1);
      }
    }

    const topPages = Array.from(pageViews.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    const topElements = Array.from(elementClicks.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([element_id, count]) => ({ element_id, count }));

    const flow = Array.from(transitionCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([edge, count]) => {
        const [from, to] = edge.split("=>");
        return { from, to, count };
      });

    return {
      ok: true,
      site_id: siteId,
      from_ts: fromTs,
      to_ts: toTs,
      total_events: filtered.length,
      top_pages: topPages,
      top_elements: topElements,
      page_flow: flow,
      trend: createTrendBuckets(filtered, fromTs, toTs),
      journey: buildJourneySummary(sessionTimeline, pathMappings),
      sdk_status: buildSdkStatus(siteEvents),
      funnel: {
        detail_page_view: detailPageViews,
        checkout_page_view: checkoutPageViews,
        checkout_complete: checkoutComplete,
        checkout_completion_rate: checkoutPageViews > 0 ? checkoutComplete / checkoutPageViews : 0,
      },
    };
  }

  return { getEventSummary };
}

module.exports = { createEventsService };
