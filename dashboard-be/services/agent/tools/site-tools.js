function normalizeTarget(target, index) {
  return {
    id: target?.id || `target-${index + 1}`,
    label: target?.label || target?.path || target?.url_prefix || `대상 ${index + 1}`,
    path: target?.path || target?.url_prefix || "/",
    url_prefix: target?.url_prefix || target?.path || "/",
    experiment_key: target?.experiment_key || null,
  };
}

function createSiteTools({ siteRegistryStore }) {
  function getPreviewTargets({ siteId }) {
    const rawSite = siteRegistryStore?.getRawById ? siteRegistryStore.getRawById(siteId) : null;
    const targets = Array.isArray(rawSite?.preview_targets)
      ? rawSite.preview_targets
      : Array.isArray(rawSite?.inferred_preview_targets)
        ? rawSite.inferred_preview_targets
        : [];
    const preview_targets = targets.map(normalizeTarget);
    return {
      ok: true,
      preview_targets,
      message: preview_targets.length
        ? `${siteId} 사이트에는 ${preview_targets.length}개의 미리보기 대상 페이지가 설정되어 있습니다.`
        : `${siteId} 사이트에 설정된 미리보기 대상 페이지가 없습니다.`,
    };
  }

  return {
    getPreviewTargets,
  };
}

module.exports = {
  createSiteTools,
};
