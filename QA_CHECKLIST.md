# Dashboard QA 체크리스트

> 작성일: 2026-05-25  
> 대상: `dashboard-be` + `dashboard-fe`  
> 테스트 방법: 자동(Auto) = `npm test`, 수동(Manual) = 브라우저 또는 API 직접 호출

---

## 작성 방법

각 항목을 테스트한 후 결과를 아래 형식으로 기록합니다.

- **결과**: `✅ Pass` / `❌ Fail` / `⚠️ Partial` / `⏭️ Skip`
- **심각도** (Fail인 경우): `Critical` / `Major` / `Minor`
- **비고**: 실제 동작, 오류 메시지, 재현 방법 등

---

## 1. 인증 / 세션

> **관련 파일**
> - `dashboard-fe/public/login.js` — 로그인 UI
> - `dashboard-be/server.js` — 로그인 라우터, 세션 미들웨어
> - `dashboard-be/data/users.json` — 사용자 계정 데이터
> - `dashboard-be/services/runtime/infra-config.js` — 세션 시크릿 등 인프라 설정

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 1-1 | 올바른 계정으로 로그인 | ✅ 정상 | ① `localhost:3001/login` 접속 → ② 환경변수로 설정한 admin 계정 입력 → ③ DevTools > Application > Cookies에서 `ux_dashboard_session` 쿠키 생성 확인 | 쿠키 발급 + `/dashboard` 리다이렉트 | | |
| 1-2 | 잘못된 비밀번호로 로그인 | ✅ 정상 | ① `localhost:3001/login` 접속 → ② 틀린 비밀번호 입력 → ③ 화면에 오류 메시지 확인, Cookies 탭에서 쿠키 미생성 확인 | 로그인 실패 메시지, 세션 쿠키 없음 | | |
| 1-3 | 로그인 없이 `/dashboard` 직접 접근 | ✅ 정상 | ① 로그아웃 상태에서 주소창에 `localhost:3001/dashboard` 직접 입력 → ② URL 변화 확인 | `/login?next=%2Fdashboard`로 리다이렉트 | | |
| 1-4 | 로그인 없이 `/editor` 직접 접근 | ✅ 정상 | ① 로그아웃 상태에서 주소창에 `localhost:3001/editor` 직접 입력 → ② URL 변화 확인 | `/login?next=%2Feditor`로 리다이렉트 | | |
| 1-5 | 세션 만료 후 API 호출 | ✅ 정상 (TTL=8h, 만료 시 401) | ① 로그인 후 DevTools > Application > Cookies → `ux_dashboard_session` 수동 삭제 → ② `GET localhost:3001/api/auth/me` 호출 (DevTools Network 탭) → ③ 응답 코드 확인 | 401 응답 | | |
| 1-6 | 로그아웃 후 세션 쿠키 제거 확인 | ✅ 정상 | ① 로그인 후 로그아웃 버튼 클릭 → ② DevTools > Application > Cookies에서 `ux_dashboard_session` 항목 제거 확인 → ③ `localhost:3001/dashboard` 재접속 시 `/login` 리다이렉트 확인 | 쿠키 삭제, 이후 인증 실패 | | |
| 1-7 | `HttpOnly` 쿠키 JS 접근 불가 | ✅ 정상 (코드에서 HttpOnly 플래그 확인) | ① 로그인 후 DevTools > Console 탭 → ② `document.cookie` 입력 후 엔터 → ③ 출력 결과에서 `ux_dashboard_session` 미포함 확인 | 세션 쿠키 JS 미노출 | | |

---

## 2. 사용자 권한 / site_id 접근 제어

> **관련 파일**
> - `dashboard-be/server.js` — 권한 체크 미들웨어, 사용자 관리 API
> - `dashboard-be/services/stores/site-registry-store.js` — 사이트 목록 저장/조회
> - `dashboard-be/data/users.json` — 사용자 계정
> - `dashboard-be/data/user_site_access.json` — 사용자별 허용 site_id 목록
> - `dashboard-be/data/sites.json` — 등록된 사이트 목록

> **site_id 개념**: 고객사(사이트)를 구분하는 식별자 (예: `"ab-sample"`, `"legend-ecommerce"`).  
> 각 사용자는 허용된 site_id 목록만 볼 수 있으며, 퍼널 경로 매핑(어떤 URL이 어느 단계인지)은 site별 `pathMappings`에서 따로 설정합니다.

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 2-1 | admin 계정 로그인 시 사용자 관리 UI 표시 | 👤 FE 렌더링 직접 확인 필요 | ① admin 계정으로 로그인 → ② 대시보드 화면에서 사용자 관리 메뉴/버튼 노출 여부 확인 | 사용자 관리 UI 표시됨 | | |
| 2-2 | 일반 사용자 로그인 시 사용자 관리 UI 미표시 | 👤 FE 렌더링 직접 확인 필요 | ① admin으로 일반 사용자 계정 생성 → ② 해당 계정으로 재로그인 → ③ 사용자 관리 메뉴/버튼 미노출 확인 | 사용자 관리 UI 숨김 | | |
| 2-3 | 일반 사용자가 사용자 생성 API 직접 호출 | ✅ 정상 (`requireAdmin` 403 확인) | ① 일반 사용자로 로그인 → ② DevTools > Network → `POST localhost:3001/api/users` 수동 요청 (`{"username":"x","password":"y"}`) → ③ 응답 코드 확인 | 403 Forbidden | | |
| 2-4 | 허용된 site_id의 데이터 조회 | ✅ 정상 (`requireSiteAccess` 허용 목록 체크 확인) | ① 로그인 후 `GET localhost:3001/api/sites/{허용된_site_id}/experiments` 호출 → ② 200 응답 및 데이터 확인 | 200 + 실험 목록 반환 | | |
| 2-5 | 허용되지 않은 site_id 데이터 조회 시도 | ✅ 정상 (`requireSiteAccess` 403 확인) | ① 로그인 후 `GET localhost:3001/api/sites/{미허용_site_id}/experiments` 호출 → ② 응답 코드 확인 | 403 Forbidden | | |
| 2-6 | admin이 신규 사용자 생성 후 site_id 지정 | 👤 전체 흐름 직접 확인 필요 | ① admin으로 로그인 → ② 사용자 관리 UI에서 신규 계정 생성 및 특정 site_id 지정 → ③ 신규 계정으로 재로그인 → ④ 지정된 site_id 데이터 접근 가능, 다른 site_id 접근 시 403 확인 | 지정 site_id만 접근 가능 | | |
| 2-7 | 미허용 site_id를 파라미터로 전달해 우회 시도 | ✅ 정상 (덮어쓰기 아닌 403 반환 확인) | ① 일반 사용자 로그인 → ② `GET localhost:3001/api/sites/{미허용_site_id}/experiments` 호출 → ③ 응답 확인 | 403 반환 (서버가 허용 목록 외 site_id 거부) | | |

---

## 3. 실험(A/B Test) 관리

> **관련 파일**
> - `dashboard-be/services/analytics/experiments-service.js` — 실험 생성/조회/draft 저장 로직
> - `dashboard-be/services/analytics/experiment-status.js` — 상태 정규화 및 전이 허용 규칙
> - `dashboard-be/services/stores/experiment-store.js` — 실험 데이터 파일 저장/조회
> - `dashboard-be/data/experiments.json` — 실험 데이터

> **API 엔드포인트**
> - 목록 조회: `GET /api/experiments?site_id={site_id}`
> - draft 생성: `POST /api/experiments/draft` (body: `{ key, url_prefix, site_id }`)
> - 상태 변경: `PATCH /api/experiments/{id}` (body: `{ site_id, status }`)

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 3-1 | 실험 목록 조회 | ✅ 정상 | ① 로그인 → ② `GET localhost:3001/api/experiments?site_id={site_id}` 호출 → ③ 응답 확인 | `{ ok:true, experiments:[...] }` 반환 | | |
| 3-2 | 실험 draft 생성 | ✅ 정상 | ① `POST localhost:3001/api/experiments/draft` 바디: `{"key":"test-exp","url_prefix":"/","site_id":"{site_id}"}` → ② 응답에서 `status`, `published_at` 확인 | `status:"draft"`, `published_at:null` | | |
| 3-3 | 동일 key로 재draft (live 실험 없을 때) | ✅ 정상 | ① 3-2와 동일한 key로 draft 재요청 → ② 응답의 `version` 값 확인 | 이전 version보다 1 증가 | | |
| 3-4 | 동일 key로 재draft (running 실험 있을 때) | ✅ 정상 | ① 실험을 running 상태로 전이 → ② 동일 key로 draft 재요청 → ③ 응답의 `key`, `parent_key` 확인 | `key`가 `{원본key}__draft_{ts}` 형태, `parent_key` 설정됨 | | |
| 3-5 | `draft` → `running` 전이 | ✅ 정상 | ① draft 상태 실험의 id 확인 → ② `PATCH /api/experiments/{id}` 바디: `{"site_id":"...","status":"running"}` → ③ 응답의 `status`, `published_at` 확인 | `status:"running"`, `published_at` 타임스탬프 설정 | | |
| 3-6 | `running` → `paused` 전이 | ✅ 정상 | ① running 상태 실험에 `PATCH` 요청, `status:"paused"` → ② 응답 확인 | `status:"paused"` | | |
| 3-7 | `paused` → `running` 전이 | ✅ 정상 | ① paused 상태 실험에 `PATCH` 요청, `status:"running"` → ② 응답 확인 | `status:"running"` | | |
| 3-8 | `paused` → `archived` 전이 | ✅ 정상 | ① paused 상태 실험에 `PATCH` 요청, `status:"archived"` → ② 응답 확인 | `status:"archived"`, `archived_at` 타임스탬프 설정 | | |
| 3-9 | `archived` → 다른 상태 전이 시도 | ✅ 정상 | ① archived 상태 실험에 `PATCH` 요청, `status:"running"` → ② 응답 코드 및 메시지 확인 | 400 + `"invalid transition: archived -> running"` | | |
| 3-10 | `running` → `archived` 직접 전이 시도 | ✅ 정상 | ① running 상태 실험에 `PATCH` 요청, `status:"archived"` → ② 응답 확인 | 400 + `"invalid transition: running -> archived"` | | |
| 3-11 | 존재하지 않는 id로 상태 변경 시도 | ✅ 정상 | ① `PATCH /api/experiments/nonexistent-id` 요청 → ② 응답 확인 | 404 Not Found | | |
| 3-12 | 잘못된 status 값으로 요청 | ✅ 정상 | ① `PATCH /api/experiments/{id}` 바디: `{"status":"invalid"}` → ② 응답 확인 | 400 + `"invalid experiment status"` | | |
| 3-13 | 실험 status 정규화 (자동화) | 🧪 Auto | `cd dashboard-be && npm test` 실행 → `experiment-status.test.js` 결과 확인 | All pass | | |

---

## 4. 퍼널 분석

> **관련 파일**
> - `dashboard-be/analytics/funnel.js` — 퍼널 단계 정의, path/event → step 추론
> - `dashboard-be/analytics/sessionSummary.js` — 세션 단위 행동 지표 집계 (rage click, back_count 등)
> - `dashboard-be/analytics/sessionize.js` — 이벤트 목록을 user+session 단위로 그룹핑
> - `dashboard-be/analytics/labeler.js` — 세션에 행동 패턴 라벨 부착 (5종 라벨)
> - `dashboard-be/analytics/pipeline.js` — 위 모듈들을 연결하는 분석 파이프라인 조립
> - `dashboard-be/analytics/events.js` — JSONL 이벤트 파일 읽기 및 정규화

> **퍼널 단계**: `home → browse → product → cart → checkout → payment`  
> 이벤트의 event_name 또는 path를 기준으로 단계를 추론하며, 사이트별 `pathMappings`로 커스터마이징 가능합니다.

### 4-1. 경로(Path) → 퍼널 단계 매핑

> 테스트 파일 없음 — Node.js 스크립트로 직접 실행해서 확인  
> `node -e "const {inferStepFromPath}=require('./analytics/funnel'); console.log(inferStepFromPath('/cart'))"`  
> (`dashboard-be` 폴더 안에서 실행)

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 4-1-1 | `/` → `home` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromPath('/'))"` | `"home"` | | |
| 4-1-2 | `/home` → `home` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromPath('/home'))"` | `"home"` | | |
| 4-1-3 | `/product/123` → `product` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromPath('/product/123'))"` | `"product"` | | |
| 4-1-4 | `/cart` → `cart` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromPath('/cart'))"` | `"cart"` | | |
| 4-1-5 | `/checkout` → `checkout` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromPath('/checkout'))"` | `"checkout"` | | |
| 4-1-6 | `/order-complete` → `payment` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromPath('/order-complete'))"` | `"payment"` | | |
| 4-1-7 | 미지정 경로 → `browse` 기본값 | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromPath('/unknown-page'))"` | `"browse"` | | |
| 4-1-8 | 커스텀 pathMappings 적용 | ⚠️ sites.json에 필드 없어 현재 항상 DEFAULT 사용 | ① `PATCH /api/sites/{site_id}/journey-path-mappings` 로 `{"checkout":["/pay"]}` 설정 → ② `GET /api/events/summary?site_id={site_id}` 호출 → ③ `/pay` 방문 이벤트가 journey.checkout 단계로 집계되는지 확인 | checkout 단계 세션 수 증가 | | |

### 4-2. 이벤트 → 퍼널 단계 추론

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 4-2-1 | `checkout_complete` 이벤트 → `payment` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromEvent({event_name:'checkout_complete',path:'/other'}))"` | `"payment"` | | |
| 4-2-2 | `checkout_start` 이벤트 → `checkout` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromEvent({event_name:'checkout_start',path:'/'}))"` | `"checkout"` | | |
| 4-2-3 | `add_to_cart` 이벤트 → `cart` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromEvent({event_name:'add_to_cart',path:'/'}))"` | `"cart"` | | |
| 4-2-4 | `page_view` 이벤트는 path 기준 추론 | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromEvent({event_name:'page_view',path:'/product/1'}))"` | `"product"` | | |
| 4-2-5 | `element_id`에 `"checkout"` 포함 클릭 → `checkout` | ✅ 정상 | `node -e "console.log(require('./analytics/funnel').inferStepFromEvent({event_name:'click',path:'/',props:{element_id:'checkout_btn'}}))"` | `"checkout"` | | |

### 4-3. 세션 요약 (sessionSummary)

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 4-3-1 | 정상 세션 요약 생성 | ✅ 정상 | `cd dashboard-be && npm test` → `session-summary.test.js` 결과 확인 | All pass | | |
| 4-3-2 | `max_step` 진행 방향만 업데이트 | ✅ 정상 | `npm test` → `session-state.test.js` 결과 확인 | All pass | | |
| 4-3-3 | Rage click 감지 (2초 내 동일 element 3회↑) | ✅ 정상 | `npm test` → `session-summary.test.js` 결과 확인 | All pass | | |
| 4-3-4 | Rage click 중복 제거 | ✅ 정상 | `npm test` → `session-summary.test.js` 결과 확인 | All pass | | |
| 4-3-5 | `checkout_entered` 플래그 | ✅ 정상 | `npm test` → `session-summary.test.js` 결과 확인 | All pass | | |
| 4-3-6 | `checkout_complete` 플래그 유지 | ✅ 정상 | `npm test` → `session-summary.test.js` 결과 확인 | All pass | | |
| 4-3-7 | 빈 이벤트 세션 → null 반환 | ✅ 정상 | `node -e "console.log(require('./analytics/sessionSummary').summarizeSession({events:[]}))"` | `null` | | |
| 4-3-8 | `back_count` 계산 (A→B→A 패턴) | 👤 직접 확인 필요 | ① `eval/sample-events.jsonl`에 같은 path를 왕복하는 이벤트가 있는지 확인 → ② `GET /api/sessions?site_id={site_id}` 응답에서 `back_count` 값이 0 이상인 세션 확인 | 왕복 경로 횟수가 `back_count`에 반영 | | |
| 4-3-9 | `dwell_time` 이벤트 누적 합산 | 👤 직접 확인 필요 | ① `GET /api/sessions?site_id={site_id}` 응답에서 `dwell_total_ms > 0`인 세션 확인 → ② 해당 세션의 `dwell_time` 이벤트 합계와 일치하는지 확인 | `dwell_ms` 합계 = `dwell_total_ms` | | |

### 4-4. 세션 라벨링 (labeler)

> 5개 라벨: `ux_friction_dropper` > `checkout_abandoner` > `price_sensitive_dropper` > `over_explorer` > `window_shopper` (우선순위 순)  
> `labeler.test.js`가 over_explorer, window_shopper, 픽스처 기반 라벨을 커버합니다.

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 4-4-1 | `error_count >= 1` → `ux_friction_dropper` | ✅ 정상 | `node -e "const {labelSessionSummary}=require('./analytics/labeler'); console.log(labelSessionSummary({error_count:1,clicks:0,rage_clicks_count:0}).label)"` | `"ux_friction_dropper"` | | |
| 4-4-2 | `rage_clicks_count >= 1` → `ux_friction_dropper` | ✅ 정상 | `node -e "const {labelSessionSummary}=require('./analytics/labeler'); console.log(labelSessionSummary({rage_clicks_count:1,error_count:0,clicks:0}).label)"` | `"ux_friction_dropper"` | | |
| 4-4-3 | checkout 진입 후 미완료 → `checkout_abandoner` | ✅ 정상 | `node -e "const {labelSessionSummary}=require('./analytics/labeler'); console.log(labelSessionSummary({checkout_entered:true,checkout_complete:false,error_count:0,rage_clicks_count:0}).label)"` | `"checkout_abandoner"` | | |
| 4-4-4 | `price_interaction_count >= 2` + 미구매 → `price_sensitive_dropper` | ✅ 정상 | `node -e "const {labelSessionSummary}=require('./analytics/labeler'); console.log(labelSessionSummary({price_interaction_count:2,checkout_complete:false,error_count:0,rage_clicks_count:0,checkout_entered:false}).label)"` | `"price_sensitive_dropper"` | | |
| 4-4-5 | 장시간 탐색 + checkout 미진입 → `over_explorer` | 🧪 Auto | `npm test` → `labeler.test.js` 결과 확인 | All pass | | |
| 4-4-6 | 짧은 방문 + 행동 없음 → `window_shopper` | 🧪 Auto | `npm test` → `labeler.test.js` 결과 확인 | All pass | | |
| 4-4-7 | 복수 라벨 충족 시 우선순위 높은 라벨 선택 | ✅ 정상 | `node -e "const {labelSessionSummary}=require('./analytics/labeler'); console.log(labelSessionSummary({error_count:1,checkout_entered:true,checkout_complete:false,rage_clicks_count:0}).label)"` | `"ux_friction_dropper"` (checkout_abandoner보다 우선) | | |
| 4-4-8 | 규칙 미충족 시 `window_shopper` 기본 라벨 | 🧪 Auto | `npm test` → `labeler.test.js` 결과 확인 | All pass | | |

### 4-5. 파이프라인 (pipeline)

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 4-5-1 | JSONL → 세션 그룹핑 | 🧪 Auto | `npm test` → `labeler.test.js` (fixture 기반 전체 파이프라인 실행) 결과 확인 | All pass | | |
| 4-5-2 | TTL 30분 gap 초과 시 새 세션 분리 | 👤 직접 확인 필요 | ① `eval/sample-events.jsonl`에서 같은 `anon_user_id`로 30분 넘게 간격 벌어진 이벤트 쌍 확인 → ② `GET /api/sessions?site_id=ab-sample` 응답에서 해당 유저가 2개 세션으로 분리됐는지 확인 | 별도 `session_id`로 분리됨 | | |
| 4-5-3 | auth 전용 세션 인사이트 제외 | ✅ 정상 | `node -e "const {isInsightEligibleSummary}=require('./analytics/pipeline'); console.log(isInsightEligibleSummary({unique_paths:['/login'],page_views:1,clicks:0,depth:1,duration_ms:500}))"` | `false` | | |
| 4-5-4 | 신호 없는 세션 인사이트 제외 | ✅ 정상 | `node -e "const {isInsightEligibleSummary}=require('./analytics/pipeline'); console.log(isInsightEligibleSummary({unique_paths:[],page_views:0,clicks:0,depth:0,duration_ms:0}))"` | `false` | | |
| 4-5-5 | 고품질 세션 높은 대표 점수 | ✅ 정상 | `node -e "const {representativeScore}=require('./analytics/pipeline'); const high={summary:{error_count:1,page_views:3},label:{confidence:0.9,evidence:['a','b','c']}}; const low={summary:{},label:{confidence:0.1,evidence:[]}}; console.log(representativeScore(high) > representativeScore(low))"` | `true` | | |
| 4-5-6 | auth-only 세션 감점 | ✅ 정상 | `node -e "const {representativeScore}=require('./analytics/pipeline'); console.log(representativeScore({summary:{unique_paths:['/login']},label:{confidence:0.9,evidence:[]}}))"` | 음수 또는 0에 가까운 점수 | | |
| 4-5-7 | 라벨별 대표 세션 상위 N개 선택 | 👤 직접 확인 필요 | ① `GET /api/insights/labeled-sessions?site_id={site_id}` 호출 → ② 각 라벨당 대표 세션이 최대 3개인지 확인 | 라벨당 최대 3개 | | |
| 4-5-8 | `buildInsightsInput` 출력 구조 | 👤 직접 확인 필요 | ① `GET /api/insights?site_id={site_id}` 호출 → ② 응답에서 `site_id`, `generated_at`, `labels[]` 필드 존재 확인 | 필드 모두 포함 | | |

---

## 5. 대시보드 집계 데이터 (이벤트 요약)

> **관련 파일**
> - `dashboard-be/services/analytics/events-service.js` — `getEventSummary()` 구현 전체
> - `dashboard-be/routes/chat-routes.js` — `GET /api/events/summary` 엔드포인트
> - `dashboard-be/services/stores/event-store.js` — 이벤트 원본 데이터 조회
> - `dashboard-be/services/stores/site-registry-store.js` — `journey_path_mappings` 조회
> - `dashboard-be/analytics/funnel.js` — `inferStepFromPath()` (퍼널 단계 추론)

### 5-1. 상위 페이지 / 상위 클릭 요소

> API: `GET /api/events/summary?site_id={site_id}`  
> 응답 필드: `top_pages[]`, `top_elements[]`

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 5-1-1 | 상위 방문 페이지 목록 조회 | ✅ 정상 | ① 로그인 → ② `GET localhost:3001/api/events/summary?site_id={site_id}` → ③ 응답의 `top_pages` 배열 확인 | `top_pages` — `{path, count}` 형태, `count` 내림차순, 최대 10개 | | |
| 5-1-2 | 상위 클릭 요소 목록 조회 | ✅ 정상 | ① 위와 동일 API → ② 응답의 `top_elements` 배열 확인 | `top_elements` — `{element_id, count}` 형태, `count` 내림차순, 최대 10개 | | |
| 5-1-3 | `page` 파라미터로 특정 경로 필터링 | ✅ 정상 | ① `GET .../summary?site_id={site_id}&page=/product` → ② `top_pages`에 `/product`로 시작하지 않는 경로 미포함 확인 | `/product`로 시작하는 이벤트만 집계 | | |
| 5-1-4 | `from_ts` / `to_ts` 시간 범위 필터링 | ✅ 정상 | ① 현재 시각에서 1시간 전을 `from_ts`로 설정해 요청 → ② 1시간 이전 이벤트의 경로가 `top_pages`에 미포함 확인 | 범위 밖 이벤트 제외 | | |

### 5-2. 페이지 이동 흐름 (page_flow)

> 응답 필드: `page_flow[]` — 세션 내 연속 경로 전환을 `{from, to, count}` 형태로 빈도 순 정렬

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 5-2-1 | A→B 전환 횟수 집계 | ✅ 정상 | ① `GET .../summary?site_id={site_id}` → ② 응답 `page_flow` 배열 확인 → ③ `count` 내림차순인지 확인 | `page_flow` — `{from, to, count}` 형태, 최대 15개 | | |
| 5-2-2 | 동일 경로 연속 이동은 전환으로 미집계 | ✅ 정상 | ① `page_flow` 배열에서 `from === to`인 항목 없는지 확인 | `from === to`인 항목 없음 | | |

### 5-3. 시간대별 추이 (trend)

> 응답 필드: `trend[]` — `{ts, session_count, event_count}` 형태의 타임버킷 배열

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 5-3-1 | 24시간 이내 데이터 — 1시간 단위 버킷 | ✅ 정상 | ① `from_ts`를 현재 기준 24시간 이내로 설정해 요청 → ② `trend` 배열의 인접 `ts` 차이 확인 | 인접 버킷 간 `ts` 차이 = 3,600,000ms (1h) | | |
| 5-3-2 | 24시간 초과 데이터 — 1일 단위 버킷 | ✅ 정상 | ① `from_ts`를 현재 기준 48시간 이전으로 설정해 요청 → ② 인접 `ts` 차이 확인 | 인접 버킷 간 `ts` 차이 = 86,400,000ms (24h) | | |
| 5-3-3 | 버킷별 `session_count`, `event_count` 정확성 | ✅ 정상 | ① `trend` 배열에서 임의 버킷의 `event_count` 합계가 `total_events`와 일치하는지 확인 | 모든 버킷의 `event_count` 합 = `total_events` | | |

### 5-4. 퍼널 차트 (journey)

> 응답 필드: `journey` — `{ok, total_sessions, steps[]}` 형태  
> 각 step: `{key, label, step_index, entered_sessions, next_step_sessions, next_step_rate, drop_rate, high_drop}`

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 5-4-1 | 퍼널 단계별 진입 세션 수 집계 | ✅ 정상 | ① `GET .../summary?site_id={site_id}` → ② `journey.steps` 배열에서 `entered_sessions` 값 확인 | 각 step의 `entered_sessions`가 해당 단계를 방문한 세션 수와 일치 | | |
| 5-4-2 | 단계 간 이탈률(`drop_rate`) 계산 | ✅ 정상 | ① `journey.steps` 배열에서 임의 step 선택 → ② `drop_rate + next_step_rate ≈ 1` 확인 | `drop_rate = 1 - next_step_sessions / entered_sessions` | | |
| 5-4-3 | 이탈률 50% 이상 시 `high_drop: true` | ✅ 정상 | ① `drop_rate >= 0.5`인 step에서 `high_drop` 값 확인 | `high_drop: true` | | |
| 5-4-4 | `journey_path_mappings` 설정 시 커스텀 경로 반영 | ⚠️ sites.json에 필드 없어 현재 DEFAULT 사용 | ① `PATCH /api/sites/{site_id}/journey-path-mappings` 바디: `{"checkout":["/pay"]}` 전송 → ② `/pay` 방문 이벤트가 있는 데이터로 `GET .../summary` 호출 → ③ `journey.steps`의 checkout `entered_sessions` 변화 확인 | checkout 단계 `entered_sessions` 증가 | | |
| 5-4-5 | `journey_path_mappings` 미설정 시 기본 경로 사용 | ✅ 정상 | ① sites.json에 `journey_path_mappings` 없이 API 호출 → ② `/checkout` 방문 이벤트가 journey checkout 단계로 집계되는지 확인 | `/checkout` → checkout, `/cart` → cart 등 DEFAULT 기준 집계 | | |
| 5-4-6 | 이벤트 없는 경우 `journey.ok: false` | ✅ 정상 | ① 이벤트가 없는 site_id로 `GET .../summary` 호출 → ② `journey.ok` 값 확인 | `journey.ok: false` | | |

### 5-5. 전환율 집계 (funnel)

> 응답 필드: `funnel` — `{detail_page_view, checkout_page_view, checkout_complete, checkout_completion_rate}`  
> ✅ 10-10 하드코딩 버그 수정 완료 — `inferStepFromPath(e.path, pathMappings)` 기준 집계

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 5-5-1 | 상품 상세 페이지 뷰 집계 (`detail_page_view`) | ✅ 정상 (수정 완료) | ① `GET .../summary?site_id={site_id}` → ② `funnel.detail_page_view` 값이 `product` 단계 방문 수와 일치하는지 확인 | `pathMappings`의 `product` 경로 기준 집계 | | |
| 5-5-2 | 결제 페이지 뷰 집계 (`checkout_page_view`) | ✅ 정상 (수정 완료) | ① 동일 API → ② `funnel.checkout_page_view`가 `checkout` 단계 방문 수와 일치하는지 확인 | `pathMappings`의 `checkout` 경로 기준 집계 | | |
| 5-5-3 | 구매 완료 수 집계 (`checkout_complete`) | ✅ 정상 | ① `checkout_complete` 이벤트가 있는 데이터로 API 호출 → ② `funnel.checkout_complete` 값 확인 | `checkout_complete` 이벤트 발생 횟수 | | |
| 5-5-4 | 결제 전환율 계산 (`checkout_completion_rate`) | ✅ 정상 | ① `funnel.checkout_completion_rate = checkout_complete / checkout_page_view` 계산식 확인 → ② `checkout_page_view = 0`이면 `0` 반환 확인 | `checkout_complete / checkout_page_view`, 분모 0이면 `0` 반환 | | |

### 5-6. SDK 수신 상태 (sdk_status)

> 응답 필드: `sdk_status` — `{status, label, last_event_ts, recent_events_5m}`  
> **주의**: `sdk_status`는 `allSiteEvents`(시간 필터 없음) 기준으로 계산 — 시간 필터 파라미터와 무관

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 5-6-1 | 최근 5분 내 이벤트 있으면 `status: "normal"` | ✅ 정상 | ① SDK가 정상 동작 중인 상태에서 `GET .../summary` → ② `sdk_status.status` 확인 | `{ status: "normal", label: "정상" }` | | |
| 5-6-2 | 최근 5~30분 이벤트 있으면 `status: "caution"` | ✅ 정상 | ① 마지막 이벤트 발생 후 5~30분 경과 상태에서 확인 (또는 `last_event_ts` 비교) → ② `sdk_status.status` 확인 | `{ status: "caution", label: "주의" }` | | |
| 5-6-3 | 30분 초과 미수신 시 `status: "missing"` | ✅ 정상 | ① 마지막 이벤트 발생 후 30분 초과 상태에서 확인 → ② `sdk_status.status` 확인 | `{ status: "missing", label: "미수신" }` | | |
| 5-6-4 | 이벤트가 아예 없으면 `status: "unknown"` | ✅ 정상 | ① 이벤트 없는 site_id로 `GET .../summary` → ② `sdk_status.status` 확인 | `{ status: "unknown", label: "수신 정보 없음" }` | | |

---

## 6. 메트릭 / 실험 성과 측정

> **관련 파일**
> - `dashboard-be/services/analytics/metrics-service.js` — 실험 key별 메트릭 조회
> - `dashboard-be/services/analytics/session-state.js` — 세션 상태 머지, variant 할당 추출
> - `dashboard-be/services/stores/redis-metrics-store.js` — Redis 기반 메트릭 저장/조회
> - `dashboard-be/services/stores/event-store.js` — 이벤트 JSONL 저장/조회
> - `dashboard-be/services/stores/experiment-store.js` — 실험 데이터 연동

> **API**: `GET /api/sites/{site_id}/metrics?experiment_key={key}`

| # | 테스트 케이스 | 코드 검증 | 테스트 절차 | 기대 결과 | 결과 | 심각도 |
|---|---|---|---|---|---|---|
| 6-1 | 실험 key별 A/B 메트릭 조회 | 👤 직접 확인 필요 | ① 로그인 → ② `GET localhost:3001/api/sites/{site_id}/metrics?experiment_key={key}` 호출 → ③ `variants` 배열에서 A/B variant별 CVR, 세션수 확인 | A/B variant별 `{variant, sessions, conversions, cvr}` 반환 | | |
| 6-2 | 이벤트 없는 실험의 메트릭 조회 | 👤 직접 확인 필요 | ① 이벤트가 없는 experiment_key로 API 호출 → ② 응답이 에러 없이 반환되는지, 숫자 값이 0인지 확인 | 빈 데이터 또는 `sessions:0, conversions:0, cvr:0` 정상 응답 | | |
| 6-3 | variant 할당 추출 (`extractVariantAssignments`) | 🧪 Auto | `npm test` → `session-state.test.js` 결과 확인 | All pass | | |
| 6-4 | 이벤트 summary 조회 (page 필터 포함) | ✅ 정상 (5-1-3 참조) | ① `GET .../summary?site_id={site_id}&page=/product` 호출 → ② `/product`로 시작하는 이벤트만 집계되는지 확인 | 필터 조건에 맞는 이벤트만 집계 | | |

---

## 6. 인사이트 생성 (LLM 연동)

> **관련 파일**
> - `dashboard-be/insights/openaiProvider.js` — OpenAI API 호출 (chat/completions)
> - `dashboard-be/insights/contracts.js` — InsightInput / InsightOutput 타입 정의
> - `dashboard-be/analytics/pipeline.js` — `buildInsightsInput()` 으로 LLM 입력값 생성
> - `dashboard-be/server.js` — 인사이트 생성 API 엔드포인트

| # | 테스트 케이스 | 방법 | 기대 결과 | 결과 | 심각도 | 비고 |
|---|---|---|---|---|---|---|
| 6-1 | `UX_INSIGHTS_API_KEY` 없이 인사이트 생성 시도 | Manual | 명확한 에러 메시지 반환 (`missing UX_INSIGHTS_API_KEY`) | | | |
| 6-2 | API key 정상 설정 후 인사이트 생성 | Manual | `insights[]` 배열 포함한 InsightOutput 구조 반환 | | | |
| 6-3 | LLM 응답이 비어 있는 경우 처리 | Manual | 에러 핸들링 (빈 content 감지) | | | |
| 6-4 | 인사이트 출력 구조 검증 | Manual | `label`, `where`, `possible_causes`, `recommended_experiments`, `priority` 필드 포함 | | | |
| 6-5 | `recommended_experiments` → 실험 draft 연동 | Manual | 인사이트에서 생성된 실험 제안이 draft로 저장 가능 | | | |

---

## 7. 챗봇 — Analytics Copilot

> **관련 파일**
> - `dashboard-be/services/chat/chat-orchestrator.js` — 챗봇 흐름 제어, tool 호출, intent 감지
> - `dashboard-be/services/chat/context-builder.js` — 메시지/컨텍스트 파싱
> - `dashboard-be/services/chat/prompts.js` — analytics/commerce 시스템 프롬프트
> - `dashboard-be/services/chat/tool-registry.js` — 챗봇에서 호출 가능한 tool 목록 등록
> - `dashboard-be/services/llm/index.js` — LLM 클라이언트 진입점
> - `dashboard-be/services/llm/responses-client.js` — 실제 LLM 호출 클라이언트
> - `dashboard-be/services/llm/mock-client.js` — LLM 없는 환경용 mock 클라이언트
> - `dashboard-be/services/analytics/conversation-analytics-service.js` — 대화 이벤트 로깅

| # | 테스트 케이스 | 방법 | 기대 결과 | 결과 | 심각도 | 비고 |
|---|---|---|---|---|---|---|
| 7-1 | 일반 분석 질문 전송 | Manual | 실험 수, CVR, 이슈 요약 포함한 답변 반환 | | | |
| 7-2 | "실험 제안해줘" 메시지 전송 | Manual | `experiment_draft` 액션 포함, 초안 생성 | | | |
| 7-3 | "실험 제안하고 저장해줘" 메시지 전송 | Manual | `saved_experiment_draft` 액션 포함, DB에 실제 저장 | | | |
| 7-4 | 저장 없이 제안만 요청 | Manual | draft 생성되지만 DB 미저장, JSON 액션으로만 반환 | | | |
| 7-5 | `messages` 빈 배열로 API 호출 | Manual | `{ ok: false, reason: "messages_required" }` 반환 | | | |
| 7-6 | 지원하지 않는 `agent` 값으로 호출 | Manual | `{ ok: false, reason: "unsupported_agent" }` 반환 | | | |
| 7-7 | LLM 없는 환경 (mock 모드) 동작 | Manual | mock fallback으로 draft answer 그대로 반환 | | | |
| 7-8 | 대화 이벤트 로깅 확인 | Manual | chat events 파일에 user/assistant 이벤트 각각 기록 | | | |
| 7-9 | 허용되지 않은 tool 호출 시도 | Auto | `tool_not_allowed:` 에러 발생 | | | |

---

## 8. 이벤트 파이프라인 (Kafka / Redis)

> **관련 파일**
> - `dashboard-be/workers/event-consumer.js` — Kafka 메시지 소비 worker
> - `dashboard-be/services/stores/event-store.js` — 이벤트 JSONL 파일 저장
> - `dashboard-be/services/stores/consumed-event-store.js` — 중복 소비 방지 (이미 처리된 이벤트 추적)
> - `dashboard-be/services/stores/redis-session-store.js` — Redis 세션 상태 저장/조회
> - `dashboard-be/services/stores/redis-metrics-store.js` — Redis 메트릭 저장/조회
> - `dashboard-be/services/runtime/kafka.js` — Kafka 연결 설정
> - `dashboard-be/services/runtime/redis.js` — Redis 연결 설정
> - `dashboard-be/docker-compose.yml` — 로컬 Kafka/Redis 인프라 실행

| # | 테스트 케이스 | 방법 | 기대 결과 | 결과 | 심각도 | 비고 |
|---|---|---|---|---|---|---|
| 8-1 | Redis 연결 성공 확인 | Auto | infra-config 테스트 통과 | | | |
| 8-2 | Kafka 연결 및 이벤트 수신 | Manual | event-consumer worker가 메시지 정상 소비 | | | |
| 8-3 | 이벤트 수신 후 event-store 저장 확인 | Manual | JSONL 파일에 이벤트 append | | | |
| 8-4 | 중복 이벤트 처리 (consumed-event-store) | Auto | consumed-event-store 테스트 통과 | | | |
| 8-5 | 세션 상태 Redis 저장/조회 | Auto | redis-session-store 테스트 통과 | | | |
| 8-6 | 메트릭 Redis 저장/조회 | Auto | redis-metrics-store 테스트 통과 | | | |
| 8-7 | 인프라 없는 환경에서 graceful 처리 | Manual | 서버 크래시 없이 에러 로그만 출력 | | | |

---

## 9. 자동화 테스트 (`npm test`)

> **`npm test`가 하는 일**: `node --test` 명령으로 Node.js 내장 테스트 러너를 실행합니다.  
> `dashboard-be/test/` 폴더 안의 `*.test.js` 파일을 자동으로 찾아 실행하며, 각 파일 내 `test()` 블록의 pass/fail 결과를 출력합니다.  
> 외부 라이브러리(Jest, Mocha 등) 없이 Node.js 18+ 내장 기능만 사용합니다.
>
> **현재 테스트가 커버하는 범위**: stores(Redis/event/session), 실험 status 정규화, 세션 요약, 페르소나, SDK 메타데이터  
> **테스트가 없는 범위** (수동 확인 필요): `funnel.js`, `labeler.js`, `pipeline.js`, `chat-orchestrator.js`

| # | 테스트 파일 | 커버 대상 | 기대 결과 | 결과 | 비고 |
|---|---|---|---|---|---|
| 9-1 | `browser-sdk-metadata.test.js` | SDK 이벤트 메타데이터 구조 검증 | All pass | | |
| 9-2 | `consumed-event-store.test.js` | 이벤트 중복 소비 방지 로직 | All pass | | |
| 9-3 | `event-store.test.js` | JSONL 이벤트 저장/조회 | All pass | | |
| 9-4 | `experiment-status.test.js` | 실험 status 정규화 및 전이 허용 규칙 | All pass | | |
| 9-5 | `infra-config.test.js` | Redis/Kafka 인프라 설정값 파싱 | All pass | | |
| 9-6 | `personas.test.js` | 페르소나 데이터 로드 및 구조 검증 | All pass | | |
| 9-7 | `redis-metrics-store.test.js` | Redis 메트릭 저장/조회 로직 | All pass | | |
| 9-8 | `redis-session-store.test.js` | Redis 세션 상태 저장/조회 로직 | All pass | | |
| 9-9 | `session-state.test.js` | mergeSessionState, extractVariantAssignments | All pass | | |
| 9-10 | `session-summary.test.js` | summarizeSession (커머스 이벤트 집계) | All pass | | |

---

## 10. 코드 품질 / 보안 점검 항목

> 기능 동작과 별개로 코드 수준에서 확인해야 할 항목입니다.

| # | 점검 항목 | 위치 | 현황 | 비고 |
|---|---|---|---|---|
| 10-1 | site_id가 API 레이어에서 서버 측으로 강제되는지 (클라이언트 값 신뢰 여부) | server.js 라우터 | | 클라이언트가 임의 site_id 전달 가능한지 확인 |
| 10-2 | preview proxy 대상 도메인 allowlist 적용 여부 | README 경고 사항 | | SSRF 위험 |
| 10-3 | CORS allowlist 설정 여부 | server.js | | |
| 10-4 | 세션 시크릿 환경변수 미설정 시 기본값 사용 여부 | infra-config.js | | 기본값이 고정 문자열이면 Critical |
| 10-5 | rate limiting 적용 여부 | server.js | | |
| 10-6 | `analytics_copilot`의 siteId가 하드코딩 (`"ab-sample"`) | chat-orchestrator.js:101 | ⚠️ 확인 필요 | 멀티 사이트 지원 시 버그 |
| 10-7 | commerce_support 이벤트 로깅의 `resolved/unresolved/fallback` 값 오기록 | chat-orchestrator.js:441~458 | ⚠️ 확인 필요 | user 이벤트에 항상 false 기록 중 |
| 10-8 | LLM API 키 로그 노출 여부 | openaiProvider.js | | Authorization 헤더 로깅 금지 |
| 10-9 | `journey_path_mappings` 필드 미존재 → pathMappings 항상 null | sites.json / server.js:1287, 1317, 1345 / chat-routes.js:72 | ⚠️ 확인 필요 | 사이트별 경로 커스터마이징 기능이 실질적으로 비활성 상태. sites.json에 필드 추가 또는 UI에서 설정 가능해야 함 |
| 10-10 | `events-service.js` 내 `/checkout`, `/detail` 경로 하드코딩 | events-service.js:191~192 | ✅ 수정 완료 | `inferStepFromPath(e.path, pathMappings)`로 교체 |
| 10-11 | `events-service.js`의 `inferJourneyStep()` 함수가 `DEFAULT_PATH_MAPPINGS` 미import 상태로 참조 | events-service.js:26 | ⚠️ 확인 필요 | pathMappings가 null일 때 ReferenceError 발생 가능. 단 현재 해당 함수가 호출되지 않아 잠재적 버그 |

---

## 결과 요약 (테스트 완료 후 작성)

| 영역 | 전체 | Pass | Fail | Partial | Skip |
|---|---|---|---|---|---|
| 1. 인증/세션 | 7 | | | | |
| 2. 권한/site_id | 7 | | | | |
| 3. 실험 관리 | 13 | | | | |
| 4. 퍼널 분석 | 28 | | | | |
| 5. 대시보드 집계 데이터 | 20 | | | | |
| 6. 메트릭/실험 성과 | 4 | | | | |
| 7. 인사이트 | 5 | | | | |
| 8. Analytics Copilot | 9 | | | | |
| 9. 이벤트 파이프라인 | 7 | | | | |
| 10. 자동화 테스트 | 10 | | | | |
| **합계** | **110** | | | | |

---

## 발견된 버그 목록

| # | 영역 | 설명 | 재현 방법 | 심각도 | 담당자 | 상태 |
|---|---|---|---|---|---|---|
| B-001 | | | | | | |
