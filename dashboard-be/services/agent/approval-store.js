const { ensureJsonFile, readJson, writeJson } = require("../data-store");

function createFileApprovalStore({ approvalsFile }) {
  ensureJsonFile(approvalsFile, { approvals: [] });

  function load() {
    return readJson(approvalsFile, { approvals: [] }) || { approvals: [] };
  }

  function save(db) {
    writeJson(approvalsFile, db);
    return db;
  }

  function list({ siteId } = {}) {
    return load().approvals
      .filter((approval) => !siteId || approval.site_id === siteId)
      .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }

  function getById(siteId, approvalId) {
    return load().approvals.find((approval) => approval.site_id === siteId && approval.id === approvalId) || null;
  }

  function create(approval) {
    const db = load();
    db.approvals.push(approval);
    save(db);
    return approval;
  }

  function update(siteId, approvalId, updater) {
    const db = load();
    const index = db.approvals.findIndex((approval) => approval.site_id === siteId && approval.id === approvalId);
    if (index < 0) return null;
    const current = db.approvals[index];
    const next = typeof updater === "function" ? updater(current) : current;
    db.approvals[index] = { ...next, updated_at: Date.now() };
    save(db);
    return db.approvals[index];
  }

  return { list, getById, create, update };
}

module.exports = { createFileApprovalStore };
