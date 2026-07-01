const crypto = require("node:crypto")

const DEFAULT_STYLE_KEY = "comparison"
const DEFAULT_WEIGHT_DIGITS = 6
const STYLE_KEYS = [
  "brand_loyal",
  "comparison",
  "fast_decision",
  "impulsive",
  "price_sensitive",
  "review_oriented",
  "shipping_sensitive",
]

const STYLE_RULES = [
  { key: "review_oriented", patterns: [/리뷰/g, /후기/g, /평점/g, /검증/g, /추천/g, /입소문/g, /평가/g] },
  { key: "price_sensitive", patterns: [/가성비/g, /가격/g, /할인/g, /쿠폰/g, /예산/g, /저렴/g, /비싸/g, /세일/g, /절약/g, /배송비/g] },
  { key: "shipping_sensitive", patterns: [/배송/g, /택배/g, /도착/g, /수령/g, /당일/g, /빠른 배송/g] },
  { key: "brand_loyal", patterns: [/브랜드/g, /단골/g, /애용/g, /익숙/g, /충성/g, /선호/g] },
  { key: "comparison", patterns: [/비교/g, /검토/g, /꼼꼼/g, /따져/g, /조건/g, /품질/g, /정보/g, /여러/g] },
  { key: "fast_decision", patterns: [/신속/g, /결단/g, /결정/g, /즉결/g, /바로 구매/g, /망설/g] },
  { key: "impulsive", patterns: [/충동/g, /트렌드/g, /직감/g, /즉시/g, /바로/g, /감성/g, /눈에 띄/g] },
]

function roundMetric(value, digits = DEFAULT_WEIGHT_DIGITS) {
  if (!Number.isFinite(value)) return 0
  return Number(value.toFixed(digits))
}

function safeString(value) {
  if (value == null) return ""
  return String(value).trim()
}

function compactWhitespace(value) {
  return safeString(value).replace(/\s+/g, " ")
}

function cleanText(value) {
  const text = compactWhitespace(value)
  return text || null
}

function lowerText(value) {
  return compactWhitespace(value).toLowerCase()
}

function normalizeAgeGroup(age) {
  const numericAge = Number(age)
  if (!Number.isFinite(numericAge) || numericAge <= 0) return "unknown"
  if (numericAge < 30) return "20s"
  if (numericAge < 40) return "30s"
  if (numericAge < 50) return "40s"
  if (numericAge < 60) return "50s"
  return "60plus"
}

function normalizeOccupationGroup(occupationText, context = {}) {
  const occupation = lowerText(occupationText)
  const age = Number(context.age)
  const educationLevel = safeString(context.educationLevel)

  if (!occupation || occupation === "해당없음") {
    if (Number.isFinite(age) && age >= 60) return "retired"
    if (educationLevel.includes("대학교") || educationLevel.includes("고등학교") || educationLevel.includes("학생")) return "student"
    return "other"
  }

  if (/학생|대학원생|취업준비생|수험생/.test(occupation)) return "student"
  if (/은퇴|퇴직|retired|연금/.test(occupation)) return "retired"
  if (/주부|가사|가정관리|육아|간병|요양보호|돌봄/.test(occupation)) return "caregiver"
  if (/자영업|소상공|점주|가게|매장 운영|상점 경영|사장|운영자|부동산 중개사/.test(occupation)) return "self_employed"
  if (/사무원|행정|경리|총무|비서|회계|인사|서기|office|clerk/.test(occupation)) return "office_worker"
  if (/전문가|연구원|개발자|엔지니어|심사|분석가|변호사|회계사|의사|약사|교수|교사|컨설턴트/.test(occupation)) return "professional"
  if (/조리사|미용|판매|상담|서비스|영업원|간호조무|바리스타|호텔|승무|접객/.test(occupation)) return "service_worker"
  if (/경비|하역|적재|단순 종사|배달|운전|생산|제조|건설|용접|청소|가공원|현장/.test(occupation)) return "laborer"
  if (/무직/.test(occupation)) {
    if (Number.isFinite(age) && age >= 60) return "retired"
    if (Number.isFinite(age) && age < 30) return "student"
    return "other"
  }
  return "other"
}

function countPatternHits(text, patterns) {
  let score = 0
  for (const pattern of patterns) {
    const matches = text.match(pattern)
    if (matches) score += matches.length
  }
  return score
}

function inferStyleKeyFromRow(row = {}, context = {}) {
  const text = lowerText([
    row.persona,
    row.professional_persona,
    row.sports_persona,
    row.arts_persona,
    row.travel_persona,
    row.culinary_persona,
    row.family_persona,
    row.cultural_background,
    row.skills_and_expertise,
    row.hobbies_and_interests,
    row.career_goals_and_ambitions,
  ].filter(Boolean).join(" "))

  let bestKey = DEFAULT_STYLE_KEY
  let bestScore = 0
  for (const rule of STYLE_RULES) {
    const score = countPatternHits(text, rule.patterns)
    if (score > bestScore) {
      bestKey = rule.key
      bestScore = score
    }
  }
  if (bestScore > 0) return bestKey

  const age = Number(context.age ?? row.age)
  const occupationGroup = context.occupationGroup || normalizeOccupationGroup(row.occupation, { age, educationLevel: row.education_level })
  if (Number.isFinite(age) && age < 30) return "impulsive"
  if (occupationGroup === "professional" || occupationGroup === "office_worker") return "comparison"
  if (occupationGroup === "self_employed") return "fast_decision"
  if (Number.isFinite(age) && age >= 60) return "brand_loyal"
  return DEFAULT_STYLE_KEY
}

function buildGroupId(ageGroup, occupationGroup, styleKey) {
  return [ageGroup || "unknown", occupationGroup || "unknown", styleKey || "unknown"].join("__")
}

function normalizeRowToSegmentIdentity(rowObject) {
  const source = rowObject && typeof rowObject === "object" && rowObject.row ? rowObject.row : rowObject || {}
  const age = Number(source.age)
  const normalizedAge = Number.isFinite(age) ? Math.trunc(age) : null
  const ageGroup = normalizeAgeGroup(normalizedAge)
  const occupation = cleanText(source.occupation)
  const occupationGroup = normalizeOccupationGroup(occupation, {
    age: normalizedAge,
    educationLevel: source.education_level,
  })
  const inferredStyleKey = inferStyleKeyFromRow(source, { age: normalizedAge, occupationGroup })
  const styleKey = STYLE_KEYS.includes(inferredStyleKey) ? inferredStyleKey : DEFAULT_STYLE_KEY
  return {
    age_group: ageGroup,
    occupation_group: occupationGroup,
    style_key: styleKey,
    group_id: buildGroupId(ageGroup, occupationGroup, styleKey),
  }
}

function selectSpreadRowIndexes(totalRows, sampleSize) {
  const total = Math.max(0, Math.trunc(Number(totalRows) || 0))
  const requested = Math.max(0, Math.trunc(Number(sampleSize) || 0))
  const count = Math.min(total, requested)
  if (count === 0) return []
  const indexes = []
  for (let index = 0; index < count; index += 1) {
    indexes.push(Math.min(total - 1, Math.floor((index * total) / count)))
  }
  return indexes
}

function summarizePersona(row = {}) {
  const text = cleanText(row.persona || row.professional_persona || row.family_persona || "")
  if (!text) return null
  return text.length <= 180 ? text : `${text.slice(0, 177)}...`
}

function normalizeCompactMember(rowObject, options = {}) {
  const source = rowObject && typeof rowObject === "object" && rowObject.row ? rowObject.row : rowObject || {}
  const rowIdx = Number(rowObject && rowObject.row_idx != null ? rowObject.row_idx : source.row_idx)
  const age = Number(source.age)
  const sampleSize = Math.max(1, Math.trunc(Number(options.sampleSize) || 0))
  const requestedPopulationSize = Math.max(1, Math.trunc(Number(options.requestedPopulationSize) || 0))
  const normalizedAge = Number.isFinite(age) ? Math.trunc(age) : null
  const occupation = cleanText(source.occupation)
  const segmentIdentity = normalizeRowToSegmentIdentity(source)
  return {
    uuid: cleanText(source.uuid) || (Number.isFinite(rowIdx) ? `row-${rowIdx}` : null),
    row_idx: Number.isFinite(rowIdx) ? Math.trunc(rowIdx) : null,
    age: normalizedAge,
    sex: cleanText(source.sex),
    province: cleanText(source.province),
    occupation,
    age_group: segmentIdentity.age_group,
    occupation_group: segmentIdentity.occupation_group,
    style_key: segmentIdentity.style_key,
    group_id: segmentIdentity.group_id,
    weight: roundMetric(requestedPopulationSize / sampleSize),
    persona_summary: summarizePersona(source),
  }
}

function cloneSegmentCountMap(segmentCounts) {
  const map = new Map()
  if (segmentCounts instanceof Map) {
    for (const [groupId, segment] of segmentCounts.entries()) {
      map.set(groupId, {
        group_id: groupId,
        age_group: segment?.age_group || "unknown",
        occupation_group: segment?.occupation_group || "unknown",
        style_key: segment?.style_key || "unknown",
        population_count: Math.max(0, Math.trunc(Number(segment?.population_count) || 0)),
      })
    }
    return map
  }

  if (segmentCounts && typeof segmentCounts === "object") {
    for (const [groupId, segment] of Object.entries(segmentCounts)) {
      map.set(groupId, {
        group_id: groupId,
        age_group: segment?.age_group || "unknown",
        occupation_group: segment?.occupation_group || "unknown",
        style_key: segment?.style_key || "unknown",
        population_count: Math.max(0, Math.trunc(Number(segment?.population_count) || 0)),
      })
    }
  }

  return map
}

function updatePopulationSegmentCounts(segmentCounts, rows) {
  const map = cloneSegmentCountMap(segmentCounts)
  const list = Array.isArray(rows) ? rows : []
  for (const rowObject of list) {
    const segment = normalizeRowToSegmentIdentity(rowObject)
    const current = map.get(segment.group_id) || { ...segment, population_count: 0 }
    current.population_count += 1
    map.set(segment.group_id, current)
  }
  return map
}

function buildPopulationSegmentCounts(rows) {
  return updatePopulationSegmentCounts(new Map(), rows)
}

function summarizePopulationSegmentFeatures(features) {
  return Array.isArray(features)
    ? features.map((feature) => ({
      name: feature?.name || null,
      dtype: feature?.type?.dtype || feature?.type?._type || feature?.dtype || null,
    }))
    : []
}

function finalizePopulationSegmentsArtifact({
  dataset,
  config,
  split,
  generatedAt,
  scannedRowCount,
  observedNumRowsTotal,
  scanComplete,
  pageLength,
  nextOffset,
  segmentCounts,
  features,
}) {
  const scannedTotal = Math.max(0, Math.trunc(Number(scannedRowCount) || 0))
  const segments = Array.from(cloneSegmentCountMap(segmentCounts).values())
    .map((segment) => ({
      group_id: segment.group_id,
      age_group: segment.age_group || "unknown",
      occupation_group: segment.occupation_group || "unknown",
      style_key: segment.style_key || "unknown",
      population_count: Math.max(0, Math.trunc(Number(segment.population_count) || 0)),
    }))
    .filter((segment) => segment.population_count > 0)
    .sort((left, right) => right.population_count - left.population_count || left.group_id.localeCompare(right.group_id))
    .map((segment) => ({
      ...segment,
      population_weight: scannedTotal > 0 ? roundMetric(segment.population_count / scannedTotal) : 0,
    }))

  return {
    artifact_type: "population-segments",
    metadata: {
      dataset: dataset || null,
      config: config || null,
      split: split || null,
      generated_at: generatedAt || new Date().toISOString(),
      scanned_row_count: scannedTotal,
      observed_num_rows_total: Math.max(0, Math.trunc(Number(observedNumRowsTotal) || 0)),
      scan_complete: Boolean(scanComplete),
      next_offset: Math.max(0, Math.trunc(Number(nextOffset) || 0)),
      page_length: Math.max(1, Math.trunc(Number(pageLength) || 0)),
      features: summarizePopulationSegmentFeatures(features),
    },
    segments,
  }
}

function compareCohortMembersToPopulationSegments(members, populationProfile) {
  const list = Array.isArray(members) ? members.filter(Boolean) : []
  const sampleSize = list.length
  const populationSegments = Array.isArray(populationProfile?.segments) ? populationProfile.segments.filter(Boolean) : []
  const populationById = new Map()
  let populationWeightTotal = 0

  for (const segment of populationSegments) {
    const populationCount = Math.max(0, Math.trunc(Number(segment.population_count) || 0))
    const populationWeight = Math.max(0, Number(segment.population_weight) || 0)
    const normalized = {
      group_id: segment.group_id || buildGroupId(segment.age_group, segment.occupation_group, segment.style_key),
      age_group: segment.age_group || "unknown",
      occupation_group: segment.occupation_group || "unknown",
      style_key: segment.style_key || "unknown",
      population_count: populationCount,
      population_weight: populationWeight,
    }
    populationById.set(normalized.group_id, normalized)
    populationWeightTotal += populationWeight
  }

  const sampleCounts = countBy(list, (member) => member.group_id || "unknown__unknown__unknown")
  const allGroupIds = new Set([...populationById.keys(), ...sampleCounts.keys()])
  const segmentComparisons = Array.from(allGroupIds).map((groupId) => {
    const population = populationById.get(groupId) || {
      group_id: groupId,
      age_group: String(groupId).split("__")[0] || "unknown",
      occupation_group: String(groupId).split("__")[1] || "unknown",
      style_key: String(groupId).split("__")[2] || "unknown",
      population_count: 0,
      population_weight: 0,
    }
    const sampleCount = Number(sampleCounts.get(groupId)) || 0
    const normalizedPopulationWeight = populationWeightTotal > 0
      ? Math.max(0, population.population_weight) / populationWeightTotal
      : 0
    const sampleWeight = sampleSize > 0 ? sampleCount / sampleSize : 0
    const weightError = sampleWeight - normalizedPopulationWeight
    const representationRate = normalizedPopulationWeight > 0
      ? sampleWeight / normalizedPopulationWeight
      : sampleWeight > 0 ? 1 : 0
    const analysisWeight = sampleCount > 0 && sampleWeight > 0 && normalizedPopulationWeight > 0
      ? normalizedPopulationWeight / sampleWeight
      : 0
    return {
      group_id: groupId,
      age_group: population.age_group,
      occupation_group: population.occupation_group,
      style_key: population.style_key,
      population_count: population.population_count,
      population_weight: roundMetric(normalizedPopulationWeight),
      sample_count: sampleCount,
      sample_weight: roundMetric(sampleWeight),
      representation_rate: roundMetric(representationRate),
      weight_error: roundMetric(weightError),
      analysis_weight: roundMetric(analysisWeight),
    }
  }).sort((left, right) => right.population_weight - left.population_weight || left.group_id.localeCompare(right.group_id))

  const targetSegments = segmentComparisons.filter((segment) => segment.population_weight > 0)
  const missingSegments = targetSegments
    .filter((segment) => segment.sample_count === 0)
    .map((segment) => ({
      group_id: segment.group_id,
      age_group: segment.age_group,
      occupation_group: segment.occupation_group,
      style_key: segment.style_key,
      population_count: segment.population_count,
      population_weight: segment.population_weight,
    }))
  const undercoveredSegments = targetSegments
    .filter((segment) => segment.sample_count > 0 && segment.sample_weight < segment.population_weight)
    .map((segment) => ({
      group_id: segment.group_id,
      age_group: segment.age_group,
      occupation_group: segment.occupation_group,
      style_key: segment.style_key,
      population_count: segment.population_count,
      population_weight: segment.population_weight,
      sample_count: segment.sample_count,
      sample_weight: segment.sample_weight,
      representation_rate: segment.representation_rate,
      weight_error: segment.weight_error,
    }))
  const overcoveredSegments = segmentComparisons
    .filter((segment) => segment.sample_count > 0 && segment.sample_weight > segment.population_weight)
    .map((segment) => ({
      group_id: segment.group_id,
      age_group: segment.age_group,
      occupation_group: segment.occupation_group,
      style_key: segment.style_key,
      population_count: segment.population_count,
      population_weight: segment.population_weight,
      sample_count: segment.sample_count,
      sample_weight: segment.sample_weight,
      representation_rate: segment.representation_rate,
      weight_error: segment.weight_error,
    }))

  const populationWeightCoverage = targetSegments.reduce((sum, segment) => sum + (segment.sample_count > 0 ? segment.population_weight : 0), 0)
  const distributionLossTotalVariation = 0.5 * segmentComparisons.reduce((sum, segment) => sum + Math.abs(segment.sample_weight - segment.population_weight), 0)
  const weightedAbsoluteError = targetSegments.reduce((sum, segment) => sum + (Math.abs(segment.sample_weight - segment.population_weight) * segment.population_weight), 0)
  const weightedSquaredError = targetSegments.reduce((sum, segment) => sum + (((segment.sample_weight - segment.population_weight) ** 2) * segment.population_weight), 0)
  const maxAbsWeightError = segmentComparisons.reduce((max, segment) => Math.max(max, Math.abs(segment.sample_weight - segment.population_weight)), 0)
  const coveredSegments = targetSegments.filter((segment) => segment.sample_count > 0)
  const analysisWeightSum = coveredSegments.reduce((sum, segment) => sum + (segment.sample_count * segment.analysis_weight), 0)
  const analysisWeightSquaredSum = coveredSegments.reduce((sum, segment) => sum + (segment.sample_count * (segment.analysis_weight ** 2)), 0)
  const effectiveSampleSize = analysisWeightSquaredSum > 0 ? (analysisWeightSum ** 2) / analysisWeightSquaredSum : 0
  const weightingEfficiency = sampleSize > 0 ? effectiveSampleSize / sampleSize : 0

  return {
    population_weight_coverage: roundMetric(populationWeightCoverage),
    coverage_loss: roundMetric(Math.max(0, 1 - populationWeightCoverage)),
    distribution_loss_total_variation: roundMetric(distributionLossTotalVariation),
    missing_segments: missingSegments,
    undercovered_segments: undercoveredSegments,
    overcovered_segments: overcoveredSegments,
    max_abs_weight_error: roundMetric(maxAbsWeightError),
    weight_mae: roundMetric(weightedAbsoluteError),
    weight_rmse: roundMetric(Math.sqrt(weightedSquaredError)),
    effective_sample_size: roundMetric(effectiveSampleSize),
    weighting_efficiency: roundMetric(weightingEfficiency),
    sample_segment_count: sampleCounts.size,
    population_segment_count: targetSegments.length,
    coverage_rate: roundMetric(populationWeightCoverage),
    covered_population_weight: roundMetric(populationWeightCoverage),
    target_population_weight: roundMetric(targetSegments.reduce((sum, segment) => sum + segment.population_weight, 0)),
    missing_population_weight: roundMetric(Math.max(0, 1 - populationWeightCoverage)),
    covered_segment_count: coveredSegments.length,
    target_segment_count: targetSegments.length,
    missing_segment_count: missingSegments.length,
    undercovered_segment_count: undercoveredSegments.length,
    overcovered_segment_count: overcoveredSegments.length,
  }
}

function countBy(items, keyBuilder) {
  const map = new Map()
  for (const item of items) {
    const key = keyBuilder(item)
    if (!map.has(key)) map.set(key, 0)
    map.set(key, map.get(key) + 1)
  }
  return map
}

function toDistribution(map, labelBuilder, totalMembers) {
  return Array.from(map.entries())
    .map(([key, count]) => ({ ...labelBuilder(key), count, share: totalMembers > 0 ? roundMetric(count / totalMembers) : 0 }))
    .sort((left, right) => right.count - left.count || JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

function buildSegmentCounts(members) {
  const list = Array.isArray(members) ? members.filter(Boolean) : []
  const totalMembers = list.length
  return {
    total_members: totalMembers,
    by_group: toDistribution(countBy(list, (member) => member.group_id || "unknown__unknown__unknown"), (key) => {
      const [ageGroup, occupationGroup, styleKey] = String(key).split("__")
      return {
        group_id: key,
        age_group: ageGroup || "unknown",
        occupation_group: occupationGroup || "unknown",
        style_key: styleKey || "unknown",
      }
    }, totalMembers),
    by_age_group: toDistribution(countBy(list, (member) => member.age_group || "unknown"), (key) => ({ age_group: key }), totalMembers),
    by_occupation_group: toDistribution(countBy(list, (member) => member.occupation_group || "unknown"), (key) => ({ occupation_group: key }), totalMembers),
    by_style_key: toDistribution(countBy(list, (member) => member.style_key || "unknown"), (key) => ({ style_key: key }), totalMembers),
    by_province: toDistribution(countBy(list, (member) => member.province || "unknown"), (key) => ({ province: key }), totalMembers),
    by_sex: toDistribution(countBy(list, (member) => member.sex || "unknown"), (key) => ({ sex: key }), totalMembers),
  }
}

function buildCoverageDiagnostics(members, options = {}) {
  const list = Array.isArray(members) ? members.filter(Boolean) : []
  const totalMembers = list.length
  const uuidCounts = countBy(list, (member) => member.uuid || "")
  const rowIdxCounts = countBy(list, (member) => String(member.row_idx))
  const uniqueGroups = new Set(list.map((member) => member.group_id).filter(Boolean))
  const uniqueProvinces = new Set(list.map((member) => member.province).filter(Boolean))
  const uniqueSexes = new Set(list.map((member) => member.sex).filter(Boolean))
  const ageGroups = new Set(list.map((member) => member.age_group).filter(Boolean))
  const occupationGroups = new Set(list.map((member) => member.occupation_group).filter(Boolean))
  const styleKeys = new Set(list.map((member) => member.style_key).filter(Boolean))
  const duplicateUuidCount = Array.from(uuidCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  const duplicateRowIdxCount = Array.from(rowIdxCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  const completeCount = list.filter((member) => member.uuid && member.group_id && member.age_group && member.occupation_group && member.style_key).length
  const unknownAgeCount = list.filter((member) => member.age_group === "unknown").length
  const unknownOccupationCount = list.filter((member) => member.occupation_group === "unknown").length
  const unknownStyleCount = list.filter((member) => member.style_key === "unknown").length
  const rowIndexes = list.map((member) => member.row_idx).filter(Number.isFinite).sort((left, right) => left - right)
  const observedNumRowsTotal = Math.max(0, Math.trunc(Number(options.observedNumRowsTotal) || 0))
  return {
    total_members: totalMembers,
    complete_member_count: completeCount,
    completeness_rate: totalMembers > 0 ? roundMetric(completeCount / totalMembers) : 0,
    unique_group_count: uniqueGroups.size,
    unique_province_count: uniqueProvinces.size,
    unique_sex_count: uniqueSexes.size,
    age_group_count: ageGroups.size,
    occupation_group_count: occupationGroups.size,
    style_key_count: styleKeys.size,
    duplicate_uuid_count: duplicateUuidCount,
    duplicate_row_idx_count: duplicateRowIdxCount,
    unknown_age_group_count: unknownAgeCount,
    unknown_occupation_group_count: unknownOccupationCount,
    unknown_style_key_count: unknownStyleCount,
    min_row_idx: rowIndexes.length ? rowIndexes[0] : null,
    max_row_idx: rowIndexes.length ? rowIndexes[rowIndexes.length - 1] : null,
    observed_row_coverage_rate: observedNumRowsTotal > 0 ? roundMetric(rowIndexes.length / observedNumRowsTotal) : null,
    observed_row_span_rate: observedNumRowsTotal > 0 && rowIndexes.length ? roundMetric((rowIndexes[rowIndexes.length - 1] - rowIndexes[0] + 1) / observedNumRowsTotal) : null,
  }
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex")
}

function buildCohortIdentity({
  dataset,
  config,
  split,
  requestedPopulationSize,
  observedNumRowsTotal,
  parquetFiles,
  features,
  generatedAt,
  selectionRule,
  members,
}) {
  const signature = JSON.stringify({
    dataset,
    config,
    split,
    requestedPopulationSize,
    observedNumRowsTotal,
    selectionRule,
    members: (members || []).map((member) => [member.uuid, member.row_idx, member.group_id, member.weight]),
  })
  const cohortHash = hashValue(signature)
  return {
    cohort_id: `nemotron-korea-fixed-${Array.isArray(members) ? members.length : 0}-${cohortHash.slice(0, 12)}`,
    metadata: {
      dataset,
      config,
      split,
      requested_population_size: requestedPopulationSize,
      observed_num_rows_total: observedNumRowsTotal,
      parquet_files: Array.isArray(parquetFiles) ? parquetFiles.slice() : [],
      features: Array.isArray(features) ? features.slice() : [],
      generated_at: generatedAt,
      selection_rule: selectionRule,
      cohort_hash: cohortHash,
    },
  }
}

module.exports = {
  normalizeAgeGroup,
  normalizeOccupationGroup,
  inferStyleKeyFromRow,
  buildGroupId,
  normalizeRowToSegmentIdentity,
  selectSpreadRowIndexes,
  normalizeCompactMember,
  buildSegmentCounts,
  buildCoverageDiagnostics,
  updatePopulationSegmentCounts,
  buildPopulationSegmentCounts,
  finalizePopulationSegmentsArtifact,
  compareCohortMembersToPopulationSegments,
  buildCohortIdentity,
}
