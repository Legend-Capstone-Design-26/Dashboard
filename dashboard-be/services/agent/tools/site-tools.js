function createSiteTools({ siteRegistryStore }) {
  function getPreviewTargets({ siteId }) {
    const site = siteRegistryStore.getRawById(siteId);
    const targets = Array.isArray(site?.preview_targets) ? site.preview_targets : [];
    return {
      site: site ? { site_id: site.site_id, name: site.name || site.site_id, base_url: site.base_url || null } : null,
      preview_targets: targets.map((target) => ({
        id: target.id || null,
        label: target.label || target.name || target.path || "target",
        path: target.path || null,
        url: target.url || null,
      })),
    };
  }

  return { getPreviewTargets };
}

module.exports = { createSiteTools };
