# Dashboard 운영자 UX·기능 분석 보고서

> **작성일**: 2026-05-29  
> **분석 범위**: `dashboard-fe` (node_modules 제외), `dashboard-be` API·데이터 흐름 참조  
> **대상 페르소나**: 웹 분석 도구(GA 등)는 써 봤지만 SDK·실험 키 용어는 모르는 **쇼핑몰 운영 담당**  
> **제품 목표**: 해당 사용자가 쉽게 이해하고, **우리 사이트의 개선 포인트**를 빠르게 깨달을 수 있는가  
> **실측 조건**: `admin` / `admin123!` → 사이트 **Legend Ecommerce** (`legend-ecommerce`) → 대시보드 (실험 관리·Visual Editor 미조작)

---

## 목차

1. [요약](#1-요약)
2. [분석 방법](#2-분석-방법)
3. [페르소나·평가 기준](#3-페르소나평가-기준)
4. [실측 데이터 스냅샷 (Legend Ecommerce)](#4-실측-데이터-스냅샷-legend-ecommerce)
5. [UI 배치·정보 순서 평가](#5-ui-배치정보-순서-평가)
6. [UX Writing 평가](#6-ux-writing-평가)
7. [용어 난이도 분석 (세션·CTA·지표 등)](#7-용어-난이도-분석-세션cta지표-등)
8. [기능 인벤토리](#8-기능-인벤토리)
9. [기능별: 제공해야 할 것 · 현재 상태 · 탑재 이유](#9-기능별-제공해야-할-것--현재-상태--탑재-이유)
10. [기능–목적 매트릭스](#10-기능목적-매트릭스)
11. [제품 논리 (관찰→진단→실행→검증)](#11-제품-논리-관찰진단실행검증)
12. [우선 개선 제안](#12-우선-개선-제안)
13. [참고 문헌·자료](#13-참고-문헌자료)
14. [부록: Agent 활용 가이드](#14-부록-agent-활용-가이드)

---

## 1. 요약

### 한 줄 결론

**개선 포인트를 “깨닫는” 핵심 UI(요약·이동 흐름·먼저 볼 포인트)는 상단에 잘 모여 있어 부분적으로 목적에 부합한다.**  
다만 **전문 용어·URL·실험 영역이 길게 끼어 있고**, 가장 읽기 쉬운 **AI 인사이트가 화면 아래**에 있어, 비전문 운영자는 **“무엇부터 손봐야 하는지”까지 도달하기 전에 이탈**할 가능성이 크다.

### 종합 점수 (5점 만점, 페르소나·목적 기준)

| 항목 | 점수 | 코멘트 |
|------|------|--------|
| 첫 화면 중요 정보 노출 | 3.5 | 요약+흐름은 좋음, SDK·실험 프레이밍이 분산 |
| 개선 포인트 → 행동 연결 | 3.0 | 권장 액션은 있으나 URL·지표 키가 장벽 |
| UX Writing (비전문자) | 3.0 | 유형·흐름 한글화 우수, SDK/URL/실험 용어 약함 |
| 정보 계층·스크롤 순서 | 2.5 | 인사이트·실험 블록 순서가 목적과 불일치 |
| 로그인 진입 경험 | 2.5 | `site_id`·인프라 힌트 |
| **기능 세트 설계 (제품 논리)** | **4.0** | 퍼널+유형+실험 폐루프는 업계·연구와 정합 |
| **운영자용 정보 설계** | **2.8** | 엔진은 충실, 계층·언어·퍼널×유형 결합 미흡 |

### 기능 세트에 대한 판단

기능 구성은 **「이탈 발견 → 유형 맥락 → 개선·실험 → 재측정」** 제품으로 **연구·시장과 정합**된다.  
다만 **운영자 1차 목표(개선 포인트)** 에 맞게 **진단 블록을 앞으로, 실험·기술 블록을 뒤로**, **용어를 쇼핑몰 말로** 통일하지 않으면 “탑재 이유”가 UI에서 드러나지 않는다.

---

## 2. 분석 방법

| 방법 | 내용 |
|------|------|
| **소스 리뷰** | `dashboard-fe/public` HTML·JS·CSS, `FUNCTION.md`, `DESIGN.md`, `QA_CHECKLIST.md`, `BACKLOG.md` |
| **브라우저 실측** | Playwright MCP — 로그인 → `legend-ecommerce` 대시보드, 데이터 로드 후 스냅샷·스크린샷 |
| **문헌·업계 자료** | NN/G, 퍼널·A/B·세그먼트·대시보드 계층·Plain language·arXiv Plume/SimAB 등 (§13 참고) |
| **제외** | `node_modules`, Visual Editor 조작, 실험 관리 UI 조작 |

---

## 3. 페르소나·평가 기준

### 페르소나

- **역할**: 쇼핑몰 운영·기획 담당  
- **경험**: GA·마케팅 대시보드 등 **웹 분석 도구 사용 경험** 있음  
- **약점**: SDK, experiment key, Variant, selector, path mapping 등 **제품·개발 용어**에 익숙하지 않음  

### 성공 기준 (이번 평가)

1. 로그인 후 **어느 몰·어느 기간** 데이터인지 바로 알 수 있는가  
2. **5~10초 안** “오늘 뭐가 문제인지” 감이 오는가  
3. **어느 페이지(단계)에서** 고객이 많이 나가는지 이해하는가  
4. **무엇을 먼저 점검·개선**할지 다음 행동이 떠오르는가  
5. (부가) 실험·에디터는 **나중 단계**로 자연스럽게 이어지는가  

### 대시보드 설계 원칙 (프로젝트 `FUNCTION.md` + 업계)

- **계층**: 중요 정보는 좌상단·상단 (`FUNCTION.md`)  
- **단순성**: 한 화면에 과도한 지표·용어 금지  
- **근접성**: 연관 정보(유형 분포 + 개선 포인트) 인접 배치  
- **일관성**: 톤·용어 통일  

---

## 4. 실측 데이터 스냅샷 (Legend Ecommerce)

**기간**: 최근 7일 (2026.5.23 ~ 2026.5.29)

| 영역 | 관측 내용 |
|------|-----------|
| **수집 상태** | `미수신` · 마지막 이벤트 약 4일 전 |
| **요약** | 방문(세션) 59 · 이벤트 158 · 주 유형 **가볍게 둘러보기(62.71%)** · **우선 확인 2건** |
| **이동 흐름** | 홈 59 → 상품 목록 43 → **상품 상세(이탈 54.84%)** → **장바구니(50%)** → 결제 7 → 구매 완료 4 |
| **먼저 볼 포인트** | URL 경로(`/`, `/collection` 등) + 체류·탐색 깊이 + 원인·권장 액션 3건 |
| **AI UX 인사이트** | “상품 상세·장바구니 이탈” 요약, CTA 점검 권장, 실험 가설 3건 (페이지 하단) |

**운영자 관점 핵심 메시지 (데이터가 전달한 것)**  
→ **상품 상세·장바구니에서 많이 떨어진다**, **둘러보기만 하고 구매로 안 간 비중이 크다**.

---

## 5. UI 배치·정보 순서 평가

### DOM·스크롤 순서 (`dashboard.html` 기준)

```
기간 설정 → 요약 3카드 → 사용자 이동 흐름 → 기간별 추이
→ (유형별 비중 | 먼저 볼 만한 포인트)
→ A/B 실험 관리  ← 길고 기술적
→ 유형별 지표 표
→ 최근 세션 (접힘)
→ AI UX 인사이트  ← 서술형 해석이 가장 읽기 쉬움
→ 연동 상세 (접힘)
```

### 잘 된 점

| 항목 | 근거 |
|------|------|
| **요약 3카드 최상단** | KPI 존 원칙 — [Desisle SaaS Dashboard Guidelines](https://www.desisle.com/resources/saas-dashboard-design-guidelines) |
| **「오늘 먼저 확인할 문제」accent 카드** | 개선 목적과 정합 |
| **이동 흐름이 요약 직후** | 퍼널 drop-off 시각화 — [UXCam](https://uxcam.com/blog/conversion-funnel-analysis/) |
| **「높은 이탈」 배지** | 선처리(attention) — [NN/G Dashboards](https://www.nngroup.com/articles/dashboards-preattentive/) |
| **유형별 비중 + 먼저 볼 포인트 2열** | Gestalt 근접성 — `FUNCTION.md` |
| **세션 로그·연동 상세 접힘** | 2차 정보 disclosure 적절 |

### 문제점

| 심각도 | 이슈 | 영향 |
|--------|------|------|
| **높음** | **실험 관리 블록이 인사이트·유형 표보다 위** | “개선”보다 “실험 도구” 인상 |
| **높음** | **AI UX 인사이트가 페이지 하단** | 가장 읽기 쉬운 서술을 스크롤 후에야 접근 |
| **중간** | 부제 **「실험 운영과 성과, 고객 행동 요약」** | 첫인상이 실험 중심 |
| **중간** | 기간 카드 최상단 **SDK 상태** | “연동 문제” vs “몰 UX 문제” 혼동 |
| **중간** | 상단 **「화면 편집기」 Primary** | 분석 전 편집 CTA 노출 |
| **낮음** | 사이드바 **실험 관리 > AI 인사이트** 순서 | 탐색 시 실험 프레임 강조 |

### `dashboard.html` 섹션 ID 참고

| 순서 | 섹션 | ID |
|------|------|-----|
| 0 | 기간 설정 | `periodCard` |
| 1 | 요약 카드 | `summaryRow` |
| 2 | 사용자 이동 흐름 | `journeyCard` |
| 3 | 기간별 추이 | `trendPanel` |
| 4 | 유형별 비중 + 먼저 볼 포인트 | `chartSidePanel` |
| 5 | A/B 실험 관리 | `experimentPanel` |
| 6 | 유형별 지표 | `labelsCard` |
| 7 | 최근 세션 | `sessionsCard` |
| 8 | AI UX 인사이트 | `insightsCard` |

---

## 6. UX Writing 평가

### 양호 (운영자 친화)

- 고객 유형 한글화: `LABEL_KO`, `LABEL_DESC` (`dashboard.js`)  
  - 예: 가볍게 둘러보기, 결제 전 이탈, 불편 겪고 이탈  
- 이동 흐름 단계명: 홈 / 상품 목록 / 상품 상세 / 장바구니 / 결제  
- 인사이트 본문: “상품 상세 단계에서 이탈이 높다”, “CTA·정보 밀도 점검”  
- 빈 상태: “이벤트가 쌓이면 여기에 그려집니다”  

### 문제 (이해·신뢰 저하)

| 등급 | 위치 | 문구/표현 | 페르소나 반응 예상 |
|------|------|-----------|-------------------|
| **높음** | `login.html` | `site_id`, `dashboard/editor` | 내부 식별자·개발 경로 노출 |
| **높음** | 먼저 볼 포인트 제목 | `/, /collection, /detail, /cart 중심 구간…` | URL이 제목 — 화면명이 아님 |
| **높음** | AI 인사이트 | `page_view_to_click_rate`, `checkout_entered / sessions` | 지표 키 그대로 노출 |
| **중간** | 기간 카드 | SDK, 이벤트, 미수신 | 수집 용어 — 매출·이탈 언어 아님 |
| **중간** | 실험 패널 | 사이트 ID, 실험 코드, Variant A/B | 실험·개발 프레임 |
| **중간** | 사이드바 | Dashboard, UX Analytics, 실험실 ↗ | 한·영 혼재 |
| **중간** | 여러 곳 | CTA (무설명) | “버튼?” 수준 추측 |
| **낮음** | 로그인 힌트 | 환경 변수로 시드 | 인프라 문구 |
| **낮음** | 톤 | “없어요” vs “집계합니다” | 치명적이지 않으나 불일치 |

### 로그인 카피 예시 (`login.html`)

```html
<p class="loginLead">허용된 계정으로 로그인하면 접근 가능한 <span class="mono">site_id</span>만 dashboard/editor에서 볼 수 있습니다.</p>
```

**제안 방향**: 「담당 쇼핑몰만 볼 수 있습니다」 — editor 언급은 로그인 후 안내.

---

## 7. 용어 난이도 분석 (세션·CTA·지표 등)

### 결론

**`지표`, `CTA`, `세션`, `체류` 등은 이 페르소나에게 부담이 될 수 있다.**  
특히 **CTA·지표(일반)·이벤트**는 GA만으로는 한 번 더 해석이 필요한 경우가 많다.  
**이탈·전환**은 상대적으로 덜하지만, **단계명(상품 상세, 장바구니)과 붙이면** 훨씬 쉬워진다.

### 난이도 표 (페르소나 기준)

| 난이도 | 용어 | 비고 |
|--------|------|------|
| **낮음** | 이탈, 전환, 클릭, 방문자 | 쇼핑몰·마케팅에서도 흔함 |
| **중간** | 세션, 체류 시간, 이벤트, 지표 | “방문 1번” vs “세션”, 이벤트 정의 모호 |
| **높음** | CTA, 퍼널, Variant, SDK | 영문 약어·제품/개발 말 |

### 왜 어렵게 느껴지는가

1. **추상어가 먼저** — “세션 59” < “방문 59번”  
2. **한 화면에 용어 종류 혼재** — 한글 유형명 + 분석어 + URL + CTA  
3. **라벨만 있고 정의 없음** — 예: 방문 깊이 = 몇 화면까지 봤는지?  

### 권장 대체 표현 (1차 UI용)

| 현재 | 운영자 친화 대안 | 보조 설명(툴팁 한 줄) |
|------|------------------|----------------------|
| 세션 수 | 방문 수 | 한 번 들어온 방문 기록 |
| 이벤트 수 | 행동 기록 수 | 클릭·화면 이동 등 |
| 체류 / 평균 체류 | 머문 시간 | 그 방문에서 사이트에 머문 시간 |
| 방문 깊이 | 본 화면 수 | 결제 전까지 본 화면 수 |
| 이탈률 | 여기서 나간 비율 | 이 단계에서 구매 흐름을 끊은 비율 |
| CTA | 구매·다음 단계 버튼 | 결제하기, 담기 등 |
| 지표 (메뉴) | 숫자 요약 / 유형별 숫자 | |
| 유형별 지표 | 고객 유형별 숫자 | |
| 세션 로그 | 방문 기록 | |

### 정보 층 설계 권장

| 층 | 내용 | 예 |
|----|------|-----|
| **1층** | 쇼핑몰 말 | 상품 상세에서 많이 나감 |
| **2층** | 숫자 | 59번 방문, 절반 가까이 이탈 |
| **3층 (접기)** | 분석 용어 | 세션, 이벤트, 체류 |

현재 UI는 1층과 3층이 **같은 높이에 나란히** 있는 편.

---

## 8. 기능 인벤토리

### 화면·모듈

| 화면 | 경로 | 주요 파일 |
|------|------|-----------|
| 로그인 | `/login` | `login.html`, `login.js` |
| 대시보드 | `/dashboard` | `dashboard.html`, `dashboard.js`, `dashboard.css` |
| 실험 에디터 | `/editor` | `editor.html`, `editor.js` |
| 페르소나 실험실 | `/persona-lab` | `persona-lab.html`, `persona-lab.js` |
| AI 도우미 | 대시보드 FAB | `analytics-chat.js` |

### 대시보드 주요 기능 블록

| 블록 | 제공 의도 |
|------|-----------|
| 기간 설정 | 조회 기간 맥락 |
| SDK/수집 상태 | 데이터 신뢰도 |
| 요약 KPI 3종 | 오늘의 숫자·주 유형·우선 이슈 수 |
| 사용자 이동 흐름 | 퍼널 단계별 이탈 |
| 경로 설정 다이얼로그 | 사이트별 URL→단계 매핑 |
| 기간별 추이 | 세션·이벤트 시계열 |
| 유형별 비중 | 행동 유형 분포 |
| 먼저 볼 만한 포인트 | 우선순위·액션 |
| A/B 실험 관리 | 실험 목록·요약·결과 모달 |
| 유형별 지표 표 | 유형별 상세 수치 |
| 최근 세션 | 드릴다운 |
| AI UX 인사이트 | 전체 요약·문제·액션·실험 제안 |
| AI 도우미 | 자연어 질의 |
| 사용자 관리 (admin) | 계정·사이트 권한 |
| 연동 상세 | 미리보기 링크 등 |

### 백엔드·분석 (기능 근거)

| 영역 | 관련 모듈/API |
|------|----------------|
| 이벤트 수집 | `POST /collect`, SDK |
| 퍼널 | `analytics/funnel.js`, `GET /api/events/summary` |
| 세션·라벨 | `sessionSummary.js`, `labeler.js`, `pipeline.js` |
| 인사이트 | `GET /api/insights` |
| 실험 | `experiments-service.js`, `GET/PATCH /api/experiments` |
| 메트릭 | `GET /api/metrics` |

### 알려진 제품 갭 (`BACKLOG.md`)

| ID | 내용 |
|----|------|
| **B-002** | 퍼널 × 세션 라벨 교차 시각화 없음 — 데이터는 있으나 UI 미연결 |
| **B-003** | rule-based 라벨 → 클러스터+LLM 라벨링 (장기) |
| **B-001** | 퍼널 단계 하드코딩·소스 이원화 |

---

## 9. 기능별: 제공해야 할 것 · 현재 상태 · 탑재 이유

### A. 인증·권한

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 안전한 로그인, 허용 몰만 조회 | 세션 쿠키, `requireSiteAccess`, admin 사용자 관리 | 기능 **양호** / 카피 **미흡** | B2B 멀티테넌트 전제 |

### B. 사이트 선택·기간

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 몰·기간 맥락 | Legend Ecommerce, 최근 7일 등 | **양호** | 모든 비교의 전제 |
| 비전문자 표기 | `name (site_id)` 병기 | **개선 여지** | 운영자에게 ID는 노이즈 |

### C. 데이터·연동 상태

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 숫자 신뢰 가능 여부 | 미수신, 마지막 이벤트 시각 | 내용 **필요** / 표현·위치 **약함** | 수집 끊기면 퍼널·인사이트 무의미 |

### D. 요약 KPI 3카드

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 5초 내 상태·문제 감 | 세션 59, 주 유형, 우선 2건 | **양호** (위치) | [대시보드 상단 KPI 존](https://www.desisle.com/resources/saas-dashboard-design-guidelines) |
| 해석 문장 | 3번 카드 힌트에 URL·분석어 | **부분** | [Plume: insight 텍스트 역할](https://arxiv.org/html/2503.07512) |

### E. 사용자 이동 흐름 (퍼널)

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 단계별 이탈 | 상품 상세·장바구니 높은 이탈 표시 | **강점** | [퍼널 분석 표준](https://uxcam.com/blog/conversion-funnel-analysis/) |
| 사이트별 경로 | `pathMappingsDialog` | 기능 **있음** | URL 구조 상이 (`QA_CHECKLIST` §4) |
| 유형×단계 | **UI 없음** (B-002) | **핵심 갭** | [NN/G: persona segment](https://www.nngroup.com/articles/analytics-persona-segment/) |

### F. 기간별 추이

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 추이·이상 | 7일 그래프 | **양호** | 문제 시점 vs 구조적 문제 구분 |
| 용어 | 이벤트 수 | **중간** | 보조 지표 |

### G. 유형별 비중·표

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 행동 유형 분포 | 5종 한글+설명 | **강점** | [행동 세그먼트](https://www.epsilon.com/emea/insights/blog/guide-to-segmenting-customer-behaviour-emea) |
| 유형별 수치 | 표 제공 | 기능 **양호** / 용어 **어려움** | 체류·방문 깊이 — 한 줄 해석 보강 필요 |
| 퍼널 연결 | 없음 | **갭** | |

### H. 먼저 볼 포인트 + AI 인사이트

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 우선순위·원인·액션 | 긴급 배지, causes, validation | 구조 **우수** | Plume problem/action 역할 |
| 읽기 흐름 | URL 제목, 인사이트 하단 | **약함** | [정보 계층 상단 배치](https://www.yellowfinbi.com/blog/key-dashboard-design-principles-analytics-best-practice) |
| 실험 제안 | 지표 키 노출 | **전문가용** | [Wharton A/B Testing](https://ai-analytics.wharton.upenn.edu/wp-content/uploads/2023/08/The-Art-Science-of-AB-Testing-for-Business-Decisions.pdf) — 비전문자는 가설 문장 우선 |

### I. AI 도우미

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 맥락 질의 | FAB, 실험·초안 연동 | 방향 **좋음** | Plain-language 보조 |
| 1차 UX | A/B 퀵액션, experiment key | **2차 사용자** | 메인은 고정 카드·흐름 |

### J. A/B 실험 관리

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 목록·상태·Variant·메트릭 | QA §3 충실 | 기능 **양호** | [Microsoft ExP 4요소](https://www.researchgate.net/publication/324889185_The_Anatomy_of_a_Large-Scale_Online_Experimentation_Platform) |
| 운영자 UI | exp_* 키, Variant | **약함** | 검증 단계 — 1차 화면 주인공 아님 |
| 화면 위치 | 대시보드 중간 대형 블록 | **순서 과다** | |

### K. 화면 편집기

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| B안 제작·적용 | 선택 모드, draft, real-apply | **핵심** | [Adobe A/B](https://business.adobe.com/blog/basics/learn-about-a-b-testing) 실행 경로 |
| 운영자 진입 | 키·selector·CSS | **장벽** | 분석 담당 ≠ 몰 운영 |

### L. 페르소나 실험실

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 저트래픽 사전 검증 | synthetic overlay | **니치** | [SimAB](https://www.arxiv.org/pdf/2603.01024) |
| 메인 페르소나 | 영문·Synthetic 톤 | **약함** | 부가 기능 |

### M. 세션 로그·연동 상세

| 제공해야 할 것 | 현재 | 적합성 | 탑재 이유 |
|----------------|------|--------|-----------|
| 드릴다운 | 접힌 details | **양호** | 정량+정성 ([Zigpoll](https://www.zigpoll.com/content/what-methods-do-user-experience-researchers-use-to-identify-touchpoints-where-potential-customers-drop-off-during-the-conversion-funnel)) |

---

## 10. 기능–목적 매트릭스

**목적**: 운영자가 **개선 포인트**를 깨닫는 것

| 기능 | 탑재 이유 | 제공 충실도 | 비고 |
|------|-----------|-------------|------|
| 이동 흐름 | ★★★★★ | ★★★★☆ | 유형×단계 없음 |
| 요약 KPI | ★★★★☆ | ★★★☆☆ | 용어·힌트 |
| 먼저 볼 포인트 / AI 인사이트 | ★★★★★ | ★★★☆☆ | 위치·문장 |
| 유형별 비중·표 | ★★★★☆ | ★★★★☆ | 한글 유형명 |
| 기간·추이 | ★★★☆☆ | ★★★★☆ | 보조 |
| 경로 설정 | ★★★★☆ | ★★★☆☆ | 정확도 전제 |
| 실험 관리 | ★★★★☆ (검증) | ★★★★☆ | 1차 비중 과다 |
| 편집기 | ★★★★☆ (실행) | ★★★☆☆ | 역할 분리 |
| 페르소나 Lab | ★★☆☆☆ | ★★☆☆☆ | 부가 |
| AI 챗 | ★★★☆☆ | ★★★☆☆ | 보조 |
| 인증·권한 | ★★★★★ | ★★★★☆ | 카피 |

---

## 11. 제품 논리 (관찰→진단→실행→검증)

```
SDK 수집
    ↓
[관찰] 퍼널 · 유형 · 추이     ← where (이탈 구간)
    ↓
[진단] 우선 포인트 · AI 요약   ← who / why / what to do
    ↓
[실행] 에디터 · 실험 적용      ← change
    ↓
[검증] 메트릭 · A/B 결과      ← did it work?
    ↓
(반복)
```

**페르소나 Lab**: 검증 전 **사전 스크리닝** (SimAB류)  
**AI 챗**: 해석 부담 **보조**

**현재 UI와의 괴리**: 논리상 진단이 관찰 직후여야 하나, DOM상 **실험 관리가 진단 블록 사이에 끼어 있음**.

---

## 12. 우선 개선 제안

### P0 — 운영자 1차 목표 (개선 포인트 발견)

1. **블록 순서**: `AI UX 인사이트` + `먼저 볼 만한 포인트`를 **이동 흐름 직후**로; **실험 관리**는 접기·하단·별도 탭.  
2. **1차 UI 용어**: 세션→방문, 이벤트→행동 기록, CTA→구매·다음 단계 버튼, 지표→숫자 요약.  
3. **먼저 볼 포인트 제목**: URL → 화면명 (`sites.json` `preview_targets.label`).  
4. **로그인**: `site_id` 제거 → 「담당 쇼핑몰」.  
5. **상단 부제**: 「이탈이 큰 구간과 우선 확인할 개선 포인트」 방향.

### P1 — 인사이트 품질

6. **B-002**: 퍼널 단계별 유형 분포 (stacked bar / 드릴다운).  
7. AI 실험 제안에서 **지표 키 숨김**, 한글 지표명.  
8. SDK 상태를 **접힌 연동 상태**로, 1층 카피 완화.

### P2 — 제품 완성도

9. `UX_WRITING_CHECKLIST.md` 운영 (화면별 Pass/Fail).  
10. 페르소나 Lab·에디터는 **역할·진입 경로** 명확화 (운영 vs 실험 담당).

### 이상적인 1차 화면 블록 순서 (제안)

| 순서 | 블록 | 1층 메시지 예 |
|------|------|----------------|
| 1 | 기간 + 몰 | 최근 7일 · Legend Ecommerce |
| 2 | 오늘의 한 줄 | 상품 상세·장바구니에서 구매 전 이탈이 큼 |
| 3 | 요약 3카드 | 방문 수 / 주요 고객 유형 / 우선 확인 N건 |
| 4 | 이동 흐름 | 단계별 나간 비율 |
| 5 | 먼저 볼 포인트 + AI 요약 | 원인·할 일 |
| 6 | 유형 분포·표 | |
| 7 | 추이 차트 | |
| 8 | (접기) 실험·방문 기록·연동 | |

---

## 13. 참고 문헌·자료

### 학술·연구

| 자료 | URL | 인용 요지 |
|------|-----|-----------|
| Plume: Scaffolding Text Composition in Dashboards | https://arxiv.org/html/2503.07512 | 대시보드 텍스트 역할(요약·인사이트·설명) 구조화 |
| SimAB: Persona-Conditioned A/B Simulation | https://www.arxiv.org/pdf/2603.01024 | 저트래픽·사전 설계 검증 |
| The Anatomy of a Large-Scale Online Experimentation Platform (Microsoft ExP) | https://www.researchgate.net/publication/324889185 | 포털·실행·로그·분석 4요소 |
| Extensible Experimentation Platform (EPEF) | https://www.researchgate.net/publication/388630852 | 분석 확장·의사결정 가속 |
| The Art & Science of A/B Testing (Wharton) | https://ai-analytics.wharton.upenn.edu/wp-content/uploads/2023/08/The-Art-Science-of-AB-Testing-for-Business-Decisions.pdf | 비즈니스 의사결정·표본·실무 트레이드오프 |

### UX·업계 가이드

| 자료 | URL | 인용 요지 |
|------|-----|-----------|
| NN/G UX Writing Study Guide | https://www.nngroup.com/articles/ux-writing-study-guide/ | Plain language, 스캔 가능 구조 |
| NN/G Dashboards: Preattentive | https://www.nngroup.com/articles/dashboards-preattentive/ | 한눈에, 선처리 시각 속성 |
| NN/G Analytics + Persona Segment | https://www.nngroup.com/articles/analytics-persona-segment/ | 세그먼트로 패턴 드러냄 |
| Yellowfin Dashboard Design Principles | https://www.yellowfinbi.com/blog/key-dashboard-design-principles-analytics-best-practice | 계층·상단 KPI |
| Desisle SaaS Dashboard Guidelines | https://www.desisle.com/resources/saas-dashboard-design-guidelines | Zone 1~4, F-pattern |
| UXCam Conversion Funnel Analysis | https://uxcam.com/blog/conversion-funnel-analysis/ | 단계별 drop-off |
| Adobe A/B Testing Basics | https://business.adobe.com/blog/basics/learn-about-a-b-testing | 가설 검증 |
| Epsilon Behavioural Segmentation | https://www.epsilon.com/emea/insights/blog/guide-to-segmenting-customer-behaviour-emea | 행동 기반 세그먼트 |
| CMSWire Personas + Analytics | https://www.cmswire.com/customer-experience/personas-and-analytics-unlocking-what-motivates-your-customers/ | 행동 인사이트와 성과 |

### 프로젝트 내부

| 파일 | 용도 |
|------|------|
| `FUNCTION.md` | 대시보드 디자인 원칙 (계층·단순·일관·근접) |
| `DESIGN.md` | 비주얼 시스템 |
| `QA_CHECKLIST.md` | 기능 검증 목록 |
| `BACKLOG.md` | B-002 퍼널×라벨 등 갭 |

---

## 14. 부록: Agent 활용 가이드

### Cursor Agent + Playwright로 할 수 있는 것

| 영역 | 방식 |
|------|------|
| 기능 탐색 | 로그인 → 화면 이동 → 클릭·폼 |
| UX Writing 감사 | HTML/JS 전수 + 실화면 스냅샷 |
| UI 배치 | 스크린샷·접근성 스냅샷·`boxes` |
| 체계 QA | `QA_CHECKLIST.md` 순차 실행 |

### 전제 조건

- `npm run dev` → `http://localhost:3001`  
- 로그인 계정 (환경변수 bootstrap)  
- 평가 기준: `FUNCTION.md`, 페르소나 정의, 본 문서  

### 한계

- 주관적 브랜드 톤·실운영자 인터뷰 대체 불가  
- 픽셀 회귀는 전용 도구가 유리  
- 깊은 WCAG 감사는 axe 등 보완  

### 재실행 요청 예시

> `QA_CHECKLIST.md` 1~3장을 Playwright로 수행하고 Pass/Fail 표 작성  
> `OPERATOR_UX_PRODUCT_ANALYSIS.md` 기준으로 dashboard.html 문구 교체 후보표 작성  

---

## 문서 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-29 | 초판 — 대화 기반 통합 (Agent 평가 가능성, Legend Ecommerce 실측, UX Writing·용어·기능·문헌 분석) |

---

*본 문서는 코드 변경 없이 분석·권고만 담습니다. 구현 우선순위 확정 시 `BACKLOG.md` 또는 별도 이슈와 연동하는 것을 권장합니다.*
