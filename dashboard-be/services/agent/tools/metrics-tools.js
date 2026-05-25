function pct(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "데이터 없음";
}

function pickLeader(metrics) {
  const a = typeof metrics?.A?.cvr === "number" ? metrics.A.cvr : null;
  const b = typeof metrics?.B?.cvr === "number" ? metrics.B.cvr : null;
  if (a == null && b == null) return { leader: "none", reason: "전환율을 비교할 만큼 데이터가 아직 부족합니다." };
  if (b != null && (a == null || b > a)) return { leader: "B", reason: "Variant B의 전환율이 더 높습니다." };
  if (a != null && (b == null || a > b)) return { leader: "A", reason: "Variant A의 전환율이 더 높습니다." };
  return { leader: "tie", reason: "Variant A와 B의 전환율이 비슷합니다." };
}

function createMetricsTools({ metricsReadModel, experimentStore }) {
  function resolveExperimentKey({ siteId, key, selectedExperimentKey }) {
    const explicit = String(key || selectedExperimentKey || "").trim();
    if (explicit) return explicit;
    const experiments = experimentStore.list(siteId);
    return (experiments.find((experiment) => experiment.status === "running") || experiments[0] || {}).key || null;
  }

  function summarizeExperimentMetrics({ siteId, key, selectedExperimentKey }) {
    const resolvedKey = resolveExperimentKey({ siteId, key, selectedExperimentKey });
    const caution = "현재는 통계적 유의성 검정 없이 관찰 지표 기준으로만 판단합니다.";
    if (!resolvedKey) {
      return {
        ok: false,
        reason: "missing_experiment_key",
        message: "요약할 실험을 찾지 못했습니다. 실험을 먼저 선택해 주세요.",
      };
    }

    const metrics = metricsReadModel.getExperimentMetrics({ siteId, key: resolvedKey });
    if (!metrics?.ok) {
      return {
        ok: false,
        reason: metrics?.reason || "metrics_failed",
        message: "선택한 실험의 metrics를 불러오지 못했습니다.",
      };
    }

    const sessions = (Number(metrics.A?.sessions) || 0) + (Number(metrics.B?.sessions) || 0);
    const leader = pickLeader(metrics);
    const message = sessions > 0
      ? `${resolvedKey} 실험은 현재 A 전환율 ${pct(metrics.A?.cvr)}, B 전환율 ${pct(metrics.B?.cvr)}입니다. ${leader.reason} ${caution}`
      : `선택한 실험의 수집 데이터가 아직 부족합니다. ${caution}`;

    return {
      ok: true,
      metrics,
      message,
      summary: {
        leader: leader.leader,
        reason: sessions > 0 ? leader.reason : "선택한 실험의 수집 데이터가 아직 부족합니다.",
        caution,
      },
    };
  }

  return {
    summarizeExperimentMetrics,
  };
}

module.exports = {
  createMetricsTools,
};
