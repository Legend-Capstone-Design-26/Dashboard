const { createFileEventStore } = require("../stores/event-store");
const { readEventsJsonl } = require("../../analytics/events");
const { STEPS, inferStepFromPath, normalizeAnalyticsPath } = require("../../analytics/funnel");

function createEventsService({ eventsFile, eventStore }) {
  const resolvedEventStore = eventStore || createFileEventStore({ eventsFile });

  async function getEventSummary({ siteId, page, fromTs, toTs, limitEvents }) {
    const requestedPage = page ? normalizeAnalyticsPath(page) : null;
    const events = eventsFile
      ? await readEventsJsonl(eventsFile, {
          siteId,
          fromTs,
          toTs,
          limit: typeof limitEvents === "number" ? limitEvents : 100000,
        })
      : resolvedEventStore.readAll().filter((e) => e.site_id === siteId);
    const filtered = requestedPage
      ? events.filter((e) => normalizeAnalyticsPath(e.path || "/").startsWith(requestedPage))
      : events;

    const pageViews = new Map();
    const elementClicks = new Map();
    const sessionTimeline = new Map();
    const pageEntries = new Map();
    const pageExits = new Map();
    const sessionSteps = new Map();
    let lastEventTs = 0;
    let checkoutComplete = 0;
    let checkoutPageViews = 0;
    let productPageViews = 0;
    let cartPageViews = 0;

    for (const e of filtered) {
      const normalizedPath = normalizeAnalyticsPath(e.path || "/");
      lastEventTs = Math.max(lastEventTs, Number(e.ts) || Number(e.received_at) || 0);

      if (e.event_name === "page_view") {
        pageViews.set(normalizedPath, (pageViews.get(normalizedPath) || 0) + 1);
        if (normalizedPath === "/checkout") checkoutPageViews += 1;
        if (normalizedPath === "/product/:id" || normalizedPath === "/product") productPageViews += 1;
        if (normalizedPath === "/cart") cartPageViews += 1;
      }
      if (e.event_name === "click") {
        const elementId = e.props?.element_id || "(unknown)";
        elementClicks.set(elementId, (elementClicks.get(elementId) || 0) + 1);
      }
      if (e.event_name === "checkout_complete") checkoutComplete += 1;

      const sid = e.session_id || "no_session";
      if (!sessionTimeline.has(sid)) sessionTimeline.set(sid, []);
      sessionTimeline.get(sid).push({ ts: e.ts || e.received_at || 0, path: normalizedPath });

      const step = inferStepFromPath(normalizedPath);
      if (!sessionSteps.has(sid)) sessionSteps.set(sid, new Set());
      sessionSteps.get(sid).add(step);
    }

    const transitionCount = new Map();
    for (const list of sessionTimeline.values()) {
      list.sort((a, b) => a.ts - b.ts);
      if (list[0]?.path) {
        pageEntries.set(list[0].path, (pageEntries.get(list[0].path) || 0) + 1);
      }
      if (list[list.length - 1]?.path) {
        pageExits.set(list[list.length - 1].path, (pageExits.get(list[list.length - 1].path) || 0) + 1);
      }
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

    const topExitPages = Array.from(pageExits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, exit_count]) => {
        const views = pageViews.get(path) || 0;
        return {
          path,
          exit_count,
          page_views: views,
          exit_rate: views > 0 ? exit_count / views : 0,
        };
      });

    const topEntryPages = Array.from(pageEntries.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, entry_count]) => ({ path, entry_count }));

    const flow = Array.from(transitionCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([edge, count]) => {
        const [from, to] = edge.split("=>");
        return { from, to, count };
      });

    const funnelSteps = STEPS.map((step) => ({
      step,
      sessions: Array.from(sessionSteps.values()).filter((steps) => steps.has(step)).length,
    }));

    return {
      ok: true,
      site_id: siteId,
      source: "events_jsonl",
      from_ts: typeof fromTs === "number" ? fromTs : null,
      to_ts: typeof toTs === "number" ? toTs : null,
      total_events: filtered.length,
      total_sessions: sessionTimeline.size,
      last_event_ts: lastEventTs || null,
      top_pages: topPages,
      top_entry_pages: topEntryPages,
      top_exit_pages: topExitPages,
      top_elements: topElements,
      page_flow: flow,
      funnel: {
        product_page_view: productPageViews,
        cart_page_view: cartPageViews,
        checkout_page_view: checkoutPageViews,
        checkout_complete: checkoutComplete,
        checkout_completion_rate: checkoutPageViews > 0 ? checkoutComplete / checkoutPageViews : 0,
        steps: funnelSteps,
      },
    };
  }

  return { getEventSummary };
}

module.exports = { createEventsService };
