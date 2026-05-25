function normalizeTarget(target, index) {
  return {
    id: target?.id || `target-${index + 1}`,
    label: target?.label || target?.name || target?.path || target?.url_prefix || `대상 ${index + 1}`,
    path: target?.path || target?.url_prefix || "/",
    url_prefix: target?.url_prefix || target?.path || "/",
    url: target?.url || null,
    experiment_key: target?.experiment_key || null,
    default: target?.default === true,
  };
}

function slugPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "home";
}

function createSiteTools({ siteRegistryStore, experimentStore }) {
  function listTargets(siteId) {
    const rawSite = siteRegistryStore?.getRawById ? siteRegistryStore.getRawById(siteId) : null;
    const targets = Array.isArray(rawSite?.preview_targets)
      ? rawSite.preview_targets
      : Array.isArray(rawSite?.inferred_preview_targets)
        ? rawSite.inferred_preview_targets
        : [];
    return targets.map(normalizeTarget);
  }

  function getPreviewTargets({ siteId }) {
    const preview_targets = listTargets(siteId);
    return {
      ok: true,
      preview_targets,
      message: preview_targets.length
        ? `${siteId} 사이트에는 ${preview_targets.length}개의 미리보기 대상 페이지가 설정되어 있습니다.`
        : `${siteId} 사이트에 설정된 미리보기 대상 페이지가 없습니다.`,
    };
  }

  function resolveTargetPage({ siteId, message }) {
    const text = String(message || "").toLowerCase();
    const targets = listTargets(siteId);
    const fallback = targets.find((target) => target.default) || targets[0] || { path: "/", url_prefix: "/", id: "home", label: "홈" };
    const rules = [
      { type: "checkout", words: ["결제", "checkout"], paths: ["/checkout", "checkout"] },
      { type: "cart", words: ["장바구니", "cart"], paths: ["/cart", "cart"] },
      { type: "product", words: ["상품", "product", "구매 버튼"], paths: ["/product", "product"] },
      { type: "collection", words: ["컬렉션", "목록", "collection"], paths: ["/collection", "collection"] },
    ];

    for (const rule of rules) {
      if (!rule.words.some((word) => text.includes(word))) continue;
      const target = targets.find((item) => {
        const haystack = `${item.id || ""} ${item.label || ""} ${item.path || ""} ${item.url_prefix || ""}`.toLowerCase();
        return rule.paths.some((path) => haystack.includes(path));
      }) || { path: `/${rule.type}`, url_prefix: `/${rule.type}`, id: rule.type, label: rule.type };
      return { targetPage: target.url_prefix || target.path || "/", targetType: rule.type, target };
    }

    return { targetPage: fallback.url_prefix || fallback.path || "/", targetType: fallback.id || "default", target: fallback };
  }

  function resolveExperimentKey({ siteId, targetPage, purpose }) {
    const page = slugPart(targetPage);
    const purposePart = slugPart(purpose || "cta");
    const experiments = experimentStore.list(siteId);
    const keys = new Set(experiments.map((experiment) => experiment.key));
    // This v suffix belongs to the experiment key namespace, not experiment.version.
    let versionSuffix = 1;
    let key = `exp_${page}_${purposePart}_v${versionSuffix}`;
    while (keys.has(key)) {
      versionSuffix += 1;
      key = `exp_${page}_${purposePart}_v${versionSuffix}`;
    }
    return { key, versionSuffix };
  }

  return {
    getPreviewTargets,
    resolveTargetPage,
    resolveExperimentKey,
  };
}

module.exports = {
  createSiteTools,
  normalizeTarget,
};
