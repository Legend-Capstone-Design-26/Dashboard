const test = require("node:test")
const assert = require("node:assert/strict")

const {
  normalizeAgeGroup,
  normalizeOccupationGroup,
  inferStyleKeyFromRow,
  buildGroupId,
  normalizeRowToSegmentIdentity,
  selectSpreadRowIndexes,
  normalizeCompactMember,
  buildSegmentCounts,
  buildCoverageDiagnostics,
  buildPopulationSegmentCounts,
  updatePopulationSegmentCounts,
  finalizePopulationSegmentsArtifact,
  compareCohortMembersToPopulationSegments,
  buildCohortIdentity,
} = require("../personas/cohort-builder")

test("helper normalization stays deterministic across age, occupation, and style inference", () => {
  assert.equal(normalizeAgeGroup(26), "20s")
  assert.equal(normalizeAgeGroup(64), "60plus")
  assert.equal(normalizeOccupationGroup("무직", { age: 22, educationLevel: "4년제 대학교" }), "student")
  assert.equal(normalizeOccupationGroup("무직", { age: 71, educationLevel: "초등학교" }), "retired")
  assert.equal(normalizeOccupationGroup("회계 사무원", { age: 43 }), "office_worker")
  assert.equal(normalizeOccupationGroup("하역 및 적재 관련 단순 종사원", { age: 74 }), "laborer")
  assert.equal(buildGroupId("20s", "student", "impulsive"), "20s__student__impulsive")

  const reviewRow = {
    persona: "리뷰와 후기를 꼼꼼하게 확인한 뒤 구매를 결정합니다.",
    professional_persona: "평점과 검증 정보를 중요하게 봅니다.",
    age: 37,
    occupation: "회계 사무원",
  }
  assert.equal(inferStyleKeyFromRow(reviewRow), "review_oriented")
  assert.equal(inferStyleKeyFromRow(reviewRow), "review_oriented")
})

test("selectSpreadRowIndexes returns deterministic evenly spaced indexes", () => {
  assert.deepEqual(selectSpreadRowIndexes(12, 4), [0, 3, 6, 9])
  assert.deepEqual(selectSpreadRowIndexes(5, 10), [0, 1, 2, 3, 4])
  assert.deepEqual(selectSpreadRowIndexes(0, 10), [])
})

test("normalizeCompactMember produces compact cohort member shape", () => {
  const member = normalizeCompactMember({
    row_idx: 17,
    row: {
      uuid: "abc123",
      persona: "가격과 배송비를 비교하며 후기도 함께 살펴보는 소비자입니다.",
      age: 41,
      sex: "여자",
      province: "서울",
      occupation: "회계 사무원",
      education_level: "4년제 대학교",
      professional_persona: "예산과 조건을 꼼꼼히 비교합니다.",
      hobbies_and_interests: "배송이 빠른 곳을 선호합니다.",
    },
  }, {
    sampleSize: 10000,
    requestedPopulationSize: 7000000,
  })

  assert.deepEqual(Object.keys(member).sort(), [
    "age",
    "age_group",
    "group_id",
    "occupation",
    "occupation_group",
    "persona_summary",
    "province",
    "row_idx",
    "sex",
    "style_key",
    "uuid",
    "weight",
  ])
  assert.equal(member.uuid, "abc123")
  assert.equal(member.row_idx, 17)
  assert.equal(member.age_group, "40s")
  assert.equal(member.occupation_group, "office_worker")
  assert.equal(member.group_id, `${member.age_group}__${member.occupation_group}__${member.style_key}`)
  assert.equal(member.weight, 700)
  assert.equal(typeof member.persona_summary, "string")
  assert.equal("professional_persona" in member, false)
})

test("population segment helpers aggregate counts without storing raw rows", () => {
  const firstRows = [
    { row_idx: 0, row: { age: 31, occupation: "회계 사무원", education_level: "4년제 대학교", professional_persona: "평점과 후기를 꼼꼼히 검토합니다.", persona: "후기와 비교를 꼼꼼히 검토합니다." } },
    { row_idx: 1, row: { age: 31, occupation: "회계 사무원", education_level: "4년제 대학교", professional_persona: "평점과 후기를 꼼꼼히 검토합니다.", persona: "후기와 비교를 꼼꼼히 검토합니다." } },
  ]
  const secondRows = [
    { row_idx: 2, row: { age: 24, occupation: "무직", education_level: "4년제 대학교", persona: "트렌드와 감성에 끌려 바로 구매합니다." } },
    { row_idx: 3, row: { age: 61, occupation: "무직", education_level: "초등학교", persona: "익숙한 브랜드를 선호합니다." } },
  ]

  const segmentIdentity = normalizeRowToSegmentIdentity(firstRows[0])
  const built = buildPopulationSegmentCounts(firstRows)
  const updated = updatePopulationSegmentCounts(built, secondRows)
  const artifact = finalizePopulationSegmentsArtifact({
    dataset: "nvidia/Nemotron-Personas-Korea",
    config: "default",
    split: "train",
    generatedAt: "2026-06-26T00:00:00.000Z",
    scannedRowCount: 4,
    observedNumRowsTotal: 1000000,
    scanComplete: false,
    pageLength: 100,
    nextOffset: 400,
    segmentCounts: updated,
    features: [{ name: "uuid", type: { dtype: "string" } }],
  })

  assert.deepEqual(segmentIdentity, {
    age_group: "30s",
    occupation_group: "office_worker",
    style_key: "comparison",
    group_id: "30s__office_worker__comparison",
  })
  assert.equal(updated.get("30s__office_worker__comparison").population_count, 2)
  assert.equal(updated.get("20s__student__impulsive").population_count, 1)
  assert.equal(updated.get("60plus__retired__brand_loyal").population_count, 1)
  assert.equal(artifact.artifact_type, "population-segments")
  assert.equal(artifact.metadata.scanned_row_count, 4)
  assert.equal(artifact.metadata.scan_complete, false)
  assert.equal(artifact.segments[0].population_weight, 0.5)
  assert.equal(artifact.segments.reduce((sum, segment) => sum + segment.population_count, 0), 4)
})

test("cohort vs population diagnostics compute weighted coverage and loss", () => {
  const members = [
    normalizeCompactMember({ row_idx: 10, row: { uuid: "m1", age: 31, occupation: "회계 사무원", education_level: "4년제 대학교", professional_persona: "평점과 후기를 꼼꼼히 검토합니다.", persona: "후기와 비교를 꼼꼼히 검토합니다." } }, { sampleSize: 4, requestedPopulationSize: 7000000 }),
    normalizeCompactMember({ row_idx: 11, row: { uuid: "m2", age: 31, occupation: "회계 사무원", education_level: "4년제 대학교", professional_persona: "평점과 후기를 꼼꼼히 검토합니다.", persona: "후기와 비교를 꼼꼼히 검토합니다." } }, { sampleSize: 4, requestedPopulationSize: 7000000 }),
    normalizeCompactMember({ row_idx: 12, row: { uuid: "m3", age: 24, occupation: "무직", education_level: "4년제 대학교", persona: "트렌드와 감성에 끌려 바로 구매합니다." } }, { sampleSize: 4, requestedPopulationSize: 7000000 }),
    normalizeCompactMember({ row_idx: 13, row: { uuid: "m4", age: 24, occupation: "무직", education_level: "4년제 대학교", persona: "트렌드와 감성에 끌려 바로 구매합니다." } }, { sampleSize: 4, requestedPopulationSize: 7000000 }),
  ]
  const populationProfile = {
    metadata: { scan_complete: true },
    segments: [
      { group_id: "30s__office_worker__comparison", age_group: "30s", occupation_group: "office_worker", style_key: "comparison", population_count: 500, population_weight: 0.5 },
      { group_id: "20s__student__impulsive", age_group: "20s", occupation_group: "student", style_key: "impulsive", population_count: 300, population_weight: 0.3 },
      { group_id: "60plus__retired__brand_loyal", age_group: "60plus", occupation_group: "retired", style_key: "brand_loyal", population_count: 200, population_weight: 0.2 },
    ],
  }

  const diagnostics = compareCohortMembersToPopulationSegments(members, populationProfile)

  assert.equal(diagnostics.population_weight_coverage, 0.8)
  assert.equal(diagnostics.coverage_loss, 0.2)
  assert.equal(diagnostics.distribution_loss_total_variation, 0.2)
  assert.equal(diagnostics.missing_segment_count, 1)
  assert.equal(diagnostics.missing_segments[0].group_id, "60plus__retired__brand_loyal")
  assert.equal(diagnostics.overcovered_segment_count, 1)
  assert.equal(diagnostics.overcovered_segments[0].group_id, "20s__student__impulsive")
  assert.equal(diagnostics.sample_segment_count, 2)
  assert.equal(diagnostics.population_segment_count, 3)
  assert.equal(diagnostics.weighting_efficiency < 1, true)
})

test("segment counts and coverage diagnostics stay internally consistent", () => {
  const members = [
    normalizeCompactMember({ row_idx: 0, row: { uuid: "u1", age: 26, sex: "남자", province: "서울", occupation: "무직", education_level: "4년제 대학교", persona: "트렌드와 감성에 끌려 바로 구매합니다." } }, { sampleSize: 4, requestedPopulationSize: 7000000 }),
    normalizeCompactMember({ row_idx: 10, row: { uuid: "u2", age: 67, sex: "여자", province: "서울", occupation: "무직", education_level: "초등학교", persona: "익숙한 브랜드와 단골 매장을 선호합니다." } }, { sampleSize: 4, requestedPopulationSize: 7000000 }),
    normalizeCompactMember({ row_idx: 20, row: { uuid: "u3", age: 44, sex: "여자", province: "부산", occupation: "회계 사무원", education_level: "4년제 대학교", persona: "후기와 비교 정보를 꼼꼼히 검토합니다." } }, { sampleSize: 4, requestedPopulationSize: 7000000 }),
    normalizeCompactMember({ row_idx: 20, row: { uuid: "u3", age: 44, sex: "여자", province: "부산", occupation: "회계 사무원", education_level: "4년제 대학교", persona: "후기와 비교 정보를 꼼꼼히 검토합니다." } }, { sampleSize: 4, requestedPopulationSize: 7000000 }),
  ]

  const segmentCounts = buildSegmentCounts(members)
  const coverage = buildCoverageDiagnostics(members, { observedNumRowsTotal: 100 })
  const identity = buildCohortIdentity({
    dataset: "nvidia/Nemotron-Personas-Korea",
    config: "default",
    split: "train",
    requestedPopulationSize: 7000000,
    observedNumRowsTotal: 100,
    parquetFiles: ["a.parquet"],
    features: [{ name: "uuid", dtype: "string" }],
    generatedAt: "2026-01-01T00:00:00.000Z",
    selectionRule: "test rule",
    members,
  })

  assert.equal(segmentCounts.total_members, 4)
  assert.equal(segmentCounts.by_group.reduce((sum, item) => sum + item.count, 0), 4)
  assert.equal(segmentCounts.by_age_group.reduce((sum, item) => sum + item.count, 0), 4)
  assert.equal(coverage.total_members, 4)
  assert.equal(coverage.duplicate_uuid_count, 1)
  assert.equal(coverage.duplicate_row_idx_count, 1)
  assert.equal(coverage.completeness_rate, 1)
  assert.equal(coverage.observed_row_coverage_rate, 0.04)
  assert.equal(typeof identity.cohort_id, "string")
  assert.equal(identity.metadata.cohort_hash.length, 64)
  assert.equal(identity.metadata.dataset, "nvidia/Nemotron-Personas-Korea")
})
