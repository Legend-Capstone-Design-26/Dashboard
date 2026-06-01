// insights/dummyGenerator.js

const LABEL_PLAYBOOK = {
  checkout_abandoner: {
    title: "결제 완료 직전 이탈이 반복됩니다",
    where: "결제 진입 이후 완료 직전 구간",
    possible_causes: [
      "결제 직전 비용 정보나 혜택 정보가 충분히 설득되지 않음",
      "입력 폼이나 결제 CTA 주변에서 망설임이 발생함",
      "결제 단계가 길거나 다음 행동이 확신을 주지 못함"
    ],
    validation_methods: [
      "결제 진입 세션의 평균 체류 시간과 이탈 시점을 비교",
      "pay 버튼 클릭 이후 후속 이벤트 유무를 확인",
      "결제 단계 진입 대비 완료 전환율을 실험군별로 비교"
    ],
    experiment: {
      hypothesis: "결제 단계의 신뢰 정보와 진행 안내를 강화하면 완료율이 오른다",
      change: "결제 CTA 근처에 혜택 요약, 결제 보장, 다음 단계 안내를 추가",
      primary_metric: "checkout_complete / sessions"
    }
  },
  ux_friction_dropper: {
    title: "오류나 반복 클릭으로 인한 마찰이 보입니다",
    where: "오류 또는 반복 클릭이 발생한 마찰 구간",
    possible_causes: [
      "UI 반응 지연이나 오류 메시지 노출 부족",
      "CTA 상태 변화가 약해서 사용자가 재시도함",
      "필수 정보 누락으로 다음 행동을 확신하지 못함"
    ],
    validation_methods: [
      "error 이벤트와 rage_click 이벤트가 집중된 path를 확인",
      "대표 세션에서 마지막 5개 이벤트를 검토",
      "마찰이 있던 세션과 정상 완료 세션의 차이를 비교"
    ],
    experiment: {
      hypothesis: "오류 피드백과 로딩 상태를 더 명확히 하면 마찰 이탈이 줄어든다",
      change: "에러 메시지, 버튼 disabled 상태, 진행 중 표시를 강화",
      primary_metric: "error_count / sessions"
    }
  },
  price_sensitive_dropper: {
    title: "가격 정보 확인 뒤 구매 흐름이 약해집니다",
    where: "가격, 쿠폰, 배송비 정보 탐색 구간",
    possible_causes: [
      "최종 비용 구조가 늦게 드러나 신뢰가 떨어짐",
      "쿠폰 및 배송비 정보가 분산되어 비교 비용이 큼",
      "할인 체감이 약해 구매 명분이 부족함"
    ],
    validation_methods: [
      "가격 관련 클릭 이후 결제 진입률을 비교",
      "배송비와 쿠폰 UI 노출 위치별 클릭률을 확인",
      "프로모션 메시지 노출 전후 전환율을 실험"
    ],
    experiment: {
      hypothesis: "총 결제 금액과 할인 근거를 더 빨리 보여주면 가격 이탈이 줄어든다",
      change: "상세 페이지 상단에 쿠폰, 배송비, 최종 결제 예상가를 요약 표시",
      primary_metric: "checkout_entered / sessions"
    }
  },
  over_explorer: {
    title: "탐색은 길지만 결제로 수렴하지 않습니다",
    where: "탐색이 길어지지만 결제로 수렴하지 않는 구간",
    possible_causes: [
      "상품 비교 정보는 많지만 선택을 도와주는 장치가 부족함",
      "다음 단계 CTA보다 탐색 요소가 더 강하게 노출됨",
      "사용자가 결정을 미루는 동안 가치 제안이 약해짐"
    ],
    validation_methods: [
      "페이지 깊이와 페이지뷰 수가 높은 세션의 CTA 클릭률을 확인",
      "추천 영역, 정렬, 필터 사용 뒤 결제 진입 여부를 분석",
      "상세 페이지에서 핵심 비교 정보의 노출 순서를 실험"
    ],
    experiment: {
      hypothesis: "의사결정 보조 UI를 추가하면 과도한 탐색 세션이 결제로 전환된다",
      change: "상세 페이지에 베스트 옵션 배지, 비교 요약, 빠른 구매 CTA를 배치",
      primary_metric: "checkout_entered / sessions"
    }
  },
  window_shopper: {
    title: "초기 탐색 직후 빠르게 이탈합니다",
    where: "초기 탐색 직후 빠르게 이탈하는 구간",
    possible_causes: [
      "첫 화면에서 가치 제안이 즉시 전달되지 않음",
      "초기 CTA가 약하거나 진입 동기가 부족함",
      "랜딩 경험이 방문 목적과 맞지 않음"
    ],
    validation_methods: [
      "첫 페이지 뷰 이후 10초 이내 행동 분포를 확인",
      "랜딩 화면의 주요 CTA 클릭률을 비교",
      "유입 채널별 초기 이탈률을 분리 분석"
    ],
    experiment: {
      hypothesis: "첫 화면의 메시지와 CTA를 선명하게 하면 초기 이탈이 줄어든다",
      change: "랜딩 상단의 헤드라인, 신뢰 요소, 첫 CTA를 재구성",
      primary_metric: "page_view_to_click_rate"
    }
  }
};

function avg(values) {
  const nums = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function priorityFromShare(share, label) {
  if (label === "ux_friction_dropper" && share >= 0.1) return "high";
  if (share >= 0.3) return "high";
  if (share >= 0.15) return "medium";
  return "low";
}

function isAuthPath(path) {
  return path === "/login" || path === "/logout" || path.startsWith("/login/") || path.startsWith("/logout/");
}

function evidenceLevel(representatives) {
  const count = Array.isArray(representatives) ? representatives.length : 0;
  const evidenceCount = (representatives || []).reduce((sum, item) => sum + (Array.isArray(item?.evidence) ? item.evidence.length : 0), 0);
  if (count >= 3 && evidenceCount >= 3) return "strong";
  if (count >= 1 || evidenceCount >= 1) return "moderate";
  return "weak";
}

function buildEvidence(representatives, labelBucket) {
  const paths = Array.from(new Set(
    (representatives || [])
      .flatMap((item) => (Array.isArray(item?.summary?.unique_paths) ? item.summary.unique_paths : []))
      .filter((path) => typeof path === "string" && path && !isAuthPath(path))
  )).slice(0, 3);
  const steps = Array.from(new Set(
    (representatives || [])
      .map((item) => (typeof item?.summary?.max_step === "string" ? item.summary.max_step : ""))
      .filter(Boolean)
  )).slice(0, 2);

  const evidence = [];
  if (paths.length) evidence.push(`대표 세션에서 ${paths.join(", ")} 경로가 반복되었습니다.`);
  if (steps.length) evidence.push(`대표 세션의 주요 도달 단계는 ${steps.join(", ")}입니다.`);
  evidence.push(`해당 유형은 ${labelBucket.sessions || 0}개 세션, 전체의 ${Math.round((labelBucket.share || 0) * 100)}%를 차지합니다.`);
  return evidence;
}

function priorityReason(priority, labelBucket, primaryMetric) {
  const sharePct = Math.round((labelBucket.share || 0) * 100);
  if (priority === "high") return `전체 세션의 ${sharePct}%를 차지하고 ${primaryMetric}에 직접 영향을 줄 수 있어 우선순위가 높습니다.`;
  if (priority === "medium") return `반복 신호가 확인되지만 영향 범위를 추가 검증해야 하므로 중간 우선순위입니다.`;
  return `현재 근거가 제한적이어서 추적 대상으로 두고 추가 데이터를 확인하는 것이 적절합니다.`;
}

function buildWhere(label, representatives) {
  const playbook = LABEL_PLAYBOOK[label] || LABEL_PLAYBOOK.window_shopper;
  const avgDuration = Math.round(avg(representatives.map((item) => item?.summary?.duration_ms || 0)) / 1000);
  const avgDepth = avg(representatives.map((item) => item?.summary?.depth || 0)).toFixed(1);
  const pathSummary = Array.from(new Set(
    representatives
      .flatMap((item) => (Array.isArray(item?.summary?.unique_paths) ? item.summary.unique_paths : []))
      .filter((path) => typeof path === "string" && path && !isAuthPath(path))
  )).slice(0, 4).join(", ");
  if (pathSummary) {
    return `${pathSummary} 중심 구간에서 반복 신호가 보입니다. 대표 세션 기준 평균 체류 ${avgDuration}초, 평균 탐색 깊이 ${avgDepth} 수준입니다.`;
  }
  return `${playbook.where}에서 반복 신호가 보입니다. 대표 세션 기준 평균 체류 ${avgDuration}초, 평균 탐색 깊이 ${avgDepth} 수준입니다.`;
}

function generateDummyInsights(input) {
  const site_id = input?.site_id || "";
  const generated_at = Date.now();
  const labels = Array.isArray(input?.labels) ? input.labels : [];

  const insights = labels.map((labelBucket) => {
    const playbook = LABEL_PLAYBOOK[labelBucket.label] || LABEL_PLAYBOOK.window_shopper;
    const representatives = Array.isArray(labelBucket.representatives) ? labelBucket.representatives : [];
    const priority = priorityFromShare(labelBucket.share || 0, labelBucket.label);
    const primaryMetric = playbook.experiment.primary_metric;
    return {
      label: labelBucket.label,
      title: playbook.title,
      where: buildWhere(labelBucket.label, representatives),
      priority_reason: priorityReason(priority, labelBucket, primaryMetric),
      impact: {
        affected_sessions: labelBucket.sessions || 0,
        share: labelBucket.share || 0,
        primary_metric: primaryMetric
      },
      evidence: buildEvidence(representatives, labelBucket),
      possible_causes: playbook.possible_causes.slice(),
      validation_methods: playbook.validation_methods.slice(),
      recommended_actions: [playbook.experiment.change].concat(playbook.validation_methods.slice(0, 1)),
      recommended_experiments: [Object.assign({}, playbook.experiment)],
      priority,
      evidence_level: evidenceLevel(representatives)
    };
  });

  const top = insights.find((item) => item.priority === "high") || insights[0] || null;
  return {
    site_id,
    generated_at,
    summary: {
      headline: top ? `${top.title} 항목을 먼저 확인하는 것이 좋습니다.` : "아직 우선순위를 정할 인사이트가 부족합니다.",
      top_priority_reason: top?.priority_reason || "분석 가능한 대표 세션이 더 필요합니다."
    },
    insights
  };
}

module.exports = {
  generateDummyInsights
};
