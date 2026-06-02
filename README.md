# UX-Stream Dashboard

UX-Stream Dashboard는 웹사이트에 설치된 UX SDK로부터 사용자 행동 이벤트를 수집하고, 이를 Kafka와 Redis 기반의 실시간 파이프라인으로 처리하여 운영자에게 UX 분석 결과를 제공하는 대시보드입니다.

이 대시보드는 단순히 클릭 수나 페이지뷰를 보여주는 것이 아니라, 사용자의 세션 흐름, 이탈 유형, A/B 테스트 결과, AI 기반 UX 인사이트를 함께 제공하는 것을 목표로 합니다.

---

## 1. 프로젝트 개요

UX-Stream은 웹사이트 운영자와 기획자가 사용자 행동 데이터를 더 쉽게 이해하고, 실제 UI 개선과 A/B 테스트로 연결할 수 있도록 설계된 UX Observability 시스템입니다.

전체 흐름은 다음과 같습니다.

```txt
Browser SDK
  ↓
POST /collect
  ↓
Kafka topic
  ↓
Event Consumer
  ↓
Redis Read Model
  ↓
Dashboard API
  ↓
Dashboard UI
```

즉, 웹사이트에 설치된 SDK가 사용자 행동 이벤트를 수집하고, Dashboard 서버의 `/collect` endpoint로 전송합니다.
Collector는 이벤트를 Kafka에 publish하고, Kafka consumer는 이벤트를 consume하여 Redis read model을 갱신합니다.
Dashboard는 Redis에 정리된 데이터를 조회하여 실시간 세션, UX 이탈 유형, A/B 테스트 지표, AI 인사이트를 화면에 표시합니다.

---

## 2. 주요 기능

### 2.1 SDK 이벤트 수집

Dashboard 서버는 SDK가 전송하는 사용자 행동 이벤트를 수집합니다.

수집되는 주요 이벤트 예시는 다음과 같습니다.

```txt
page_view
click
dwell_time
add_to_cart
remove_from_cart
checkout_start
payment_attempt
checkout_complete
ab_config_applied
search
filter_change
```

현재 `/collect`는 Kafka primary publish 구조로 동작합니다.

```txt
SDK → /collect → Kafka → Consumer → Redis → Dashboard
```

---

### 2.2 실시간 UX 대시보드

Dashboard는 Redis read model을 기반으로 다음 데이터를 표시합니다.

* 전체 이벤트 수
* 최근 SDK 수집 상태
* 시간대별 이벤트 트렌드
* 상위 페이지
* 상위 클릭 요소
* 사용자 이동 흐름
* 퍼널 요약
* 세션 테이블
* UX 이탈 유형 요약
* AI UX 인사이트

---

### 2.3 Redis 기반 세션 분석

Kafka consumer는 이벤트를 consume하면서 Redis에 세션 상태를 갱신합니다.

Redis session state에는 다음과 같은 정보가 포함됩니다.

```txt
session_id
anon_user_id
site_id
started_at
last_ts
event_count
page_view_count
click_count
paths
last_path
checkout_started
checkout_completed
error_count
price_interaction_count
filter_count
search_count
cart_add_count
cart_remove_count
payment_attempt_count
max_step
experiments
```

Dashboard API는 이 Redis session state를 기반으로 세션 테이블과 UX 라벨 요약을 생성합니다.

---

### 2.4 UX 이탈 유형 분류

사용자 세션은 행동 패턴에 따라 다음과 같은 UX 이탈 유형으로 분류됩니다.

| Label                     | 설명                                      |
| ------------------------- | --------------------------------------- |
| `over_explorer`           | 여러 페이지를 오래 탐색하지만 명확한 전환으로 이어지지 않는 유형    |
| `price_sensitive_dropper` | 가격, 쿠폰, 배송비, 할인 정보 등에 민감하게 반응하다 이탈하는 유형 |
| `window_shopper`          | 가볍게 둘러보는 탐색 중심 유형                       |
| `ux_friction_dropper`     | 오류, 반복 클릭, 불편한 흐름 등 UX 마찰을 겪고 이탈하는 유형   |
| `checkout_abandoner`      | 결제 단계에 진입했지만 최종 구매까지 이어지지 않은 유형         |

---

### 2.5 A/B 테스트

Dashboard는 사이트별 A/B 테스트 생성, 배포, 일시 중지, 결과 확인 기능을 제공합니다.

현재 정책은 다음과 같습니다.

```txt
Draft 실험은 여러 개 생성 가능
Running 실험은 site_id당 최대 1개만 허용
새 실험을 배포하려면 기존 Running 실험을 paused 처리해야 함
```

즉 하나의 사이트에서는 동시에 하나의 실험만 실행됩니다.
이는 A/B 테스트 결과 해석이 여러 실험의 영향으로 섞이는 것을 방지하기 위한 정책입니다.

실험 구조는 다음과 같습니다.

```txt
Variant A: 기존 UI
Variant B: 관리자가 Visual Editor 또는 Agent Mode로 수정한 UI
```

기존 running 실험이 있는 상태에서 새 실험을 배포하려 하면 Dashboard는 확인 메시지를 표시합니다.

```txt
현재 기존 실험이 진행 중입니다.
새 실험을 배포하려면 기존 실험을 일시 중지해야 합니다.

기존 실험을 일시 중지하고 새 실험을 배포하시겠습니까?
```

확인하면 기존 실험은 `paused`, 새 실험은 `running` 상태가 됩니다.

---

### 2.6 Visual Editor

Visual Editor는 관리자가 실제 웹페이지를 보면서 UI 변경안을 만들 수 있도록 돕는 기능입니다.

주요 기능은 다음과 같습니다.

* 특정 사이트/경로 미리보기
* 텍스트 변경
* 스타일 변경
* CTA 버튼 수정
* 변경안 저장
* A/B 테스트 draft 생성
* 실험 배포

Visual Editor에서 만든 변경안은 Variant B에 저장됩니다.

---

### 2.7 AI Insight

Dashboard는 Redis 기반 세션 데이터와 이벤트 요약 데이터를 바탕으로 AI UX 인사이트를 생성합니다.

AI 인사이트는 다음 내용을 포함할 수 있습니다.

* 현재 가장 두드러진 UX 문제
* 주요 이탈 유형
* 이탈이 발생하는 위치
* 근거가 되는 세션/행동 패턴
* 개선 제안
* A/B 테스트 아이디어

현재 `/api/insights`는 `events.jsonl`이 아니라 Redis session state와 Redis event summary를 기반으로 동작합니다.

---

### 2.8 Agent Mode

Agent Mode는 대시보드 내에서 AI가 실험 생성, 인사이트 요약, 배포 제안 등을 도와주는 기능입니다.

Agent는 위험한 작업을 바로 실행하지 않고 approval 흐름을 거칩니다.

예를 들어 기존 running 실험이 있는 상태에서 새 실험 배포가 필요한 경우, Agent는 다음 내용을 안내하고 승인을 요청합니다.

```txt
현재 기존 실험이 진행 중입니다.
새 실험을 배포하려면 기존 실험을 일시 중지해야 합니다.
승인하면 기존 실험은 paused 상태가 되고 새 실험이 running 상태로 배포됩니다.
```

---

## 3. 현재 데이터 파이프라인

### 3.1 수집 파이프라인

현재 `/collect`는 Kafka primary publish 구조로 동작합니다.

```txt
Browser SDK
  ↓
POST /collect
  ↓
Kafka topic: ux.events.raw
```

`/collect`는 더 이상 `events.jsonl`에 이벤트를 primary로 저장하지 않습니다.

Kafka가 비활성화되어 있거나 publish에 실패하면 기본적으로 file fallback을 사용하지 않고 `503 kafka_unavailable`을 반환합니다.

```json
{
  "ok": false,
  "reason": "kafka_unavailable",
  "message": "이벤트 스트림에 연결할 수 없습니다. Kafka collector 설정을 확인해 주세요.",
  "source": "kafka",
  "fallback_used": false
}
```

개발용 legacy fallback이 필요한 경우에만 다음 환경변수를 사용할 수 있습니다.

```env
ENABLE_LEGACY_FILE_COLLECT_FALLBACK=true
```

단, 기본값은 `false`입니다.

---

### 3.2 Kafka Consumer

Kafka consumer는 Kafka topic의 이벤트를 consume하여 Redis read model을 갱신합니다.

```txt
Kafka topic
  ↓
event-consumer
  ↓
Redis
```

Consumer는 다음 Redis 데이터를 갱신합니다.

* Redis session state
* Redis event summary
* Redis A/B metrics
* Redis variant assignment

---

### 3.3 Redis Read Model

Dashboard 주요 API는 Redis read model을 조회합니다.

| API                      | 데이터 소스                                    |
| ------------------------ | ----------------------------------------- |
| `/api/event-summary`     | Redis event summary                       |
| `/api/sessions`          | Redis session state                       |
| `/api/realtime/sessions` | Redis session state                       |
| `/api/labels/summary`    | Redis session state 기반 label summary      |
| `/api/insights`          | Redis session state + Redis event summary |
| `/api/metrics`           | Redis experiment metrics                  |

Redis가 비활성화되었거나 연결에 실패하면 file fallback을 사용하지 않고 명시적인 오류를 반환합니다.

```json
{
  "ok": false,
  "reason": "redis_unavailable",
  "message": "실시간 데이터 저장소에 연결할 수 없습니다. Redis와 event consumer 상태를 확인해 주세요.",
  "source": "redis",
  "fallback_used": false
}
```

---

## 4. 주요 디렉터리 구조

```txt
Dashboard/
├─ dashboard-be/
│  ├─ server.js
│  ├─ routes/
│  │  ├─ chat-routes.js
│  │  └─ agent-routes.js
│  ├─ services/
│  │  ├─ collector/
│  │  │  └─ collect-handler.js
│  │  ├─ stores/
│  │  │  ├─ event-store.js
│  │  │  ├─ experiment-store.js
│  │  │  ├─ redis-session-store.js
│  │  │  ├─ redis-event-summary-store.js
│  │  │  └─ redis-metrics-store.js
│  │  ├─ analytics/
│  │  │  ├─ session-state.js
│  │  │  ├─ redis-session-analytics-service.js
│  │  │  ├─ experiment-status.js
│  │  │  └─ running-experiment-policy.js
│  │  ├─ agent/
│  │  ├─ runtime/
│  │  │  ├─ kafka.js
│  │  │  ├─ redis.js
│  │  │  └─ infra-config.js
│  │  └─ read-models/
│  ├─ workers/
│  │  └─ event-consumer.js
│  ├─ analytics/
│  │  ├─ labeler.js
│  │  ├─ pipeline.js
│  │  └─ funnel.js
│  ├─ insights/
│  ├─ personas/
│  ├─ data/
│  └─ test/
│
├─ dashboard-fe/
│  └─ public/
│     ├─ dashboard.html
│     ├─ dashboard.js
│     ├─ dashboard.css
│     ├─ editor.html
│     ├─ editor.js
│     └─ analytics-chat.js
│
├─ vendor/
│  └─ enejwl-ux-sdk-0.1.1.tgz
├─ package.json
└─ README.md
```

---

## 5. 주요 API

### 5.1 SDK 수집

```txt
POST /collect
```

SDK가 수집한 이벤트 batch를 Kafka로 publish합니다.

성공 응답:

```json
{
  "ok": true,
  "received": 3,
  "source": "kafka",
  "fallback_used": false
}
```

Kafka 비활성화 또는 publish 실패:

```json
{
  "ok": false,
  "reason": "kafka_unavailable",
  "message": "이벤트 스트림에 연결할 수 없습니다. Kafka collector 설정을 확인해 주세요.",
  "source": "kafka",
  "fallback_used": false
}
```

---

### 5.2 SDK 스크립트

```txt
GET /sdk.js
```

Dashboard에 포함된 SDK 패키지를 브라우저에서 로드할 수 있도록 제공합니다.

---

### 5.3 A/B 설정 조회

```txt
GET /api/config?site_id={site_id}&url={url}
```

SDK가 현재 페이지에 적용 가능한 running 실험 설정을 조회합니다.

중복 running 실험이 존재할 경우 서버는 최신 `published_at` 또는 `updated_at` 기준으로 하나만 내려주는 방어 로직을 가집니다.

---

### 5.4 이벤트 요약

```txt
GET /api/event-summary?site_id={site_id}
```

Redis event summary를 조회합니다.

반환 데이터 예시:

```txt
total_events
top_pages
top_elements
page_flow
trend
sdk_status
funnel
journey
```

---

### 5.5 세션 목록

```txt
GET /api/sessions?site_id={site_id}
```

Redis session state를 기반으로 세션 목록을 반환합니다.

---

### 5.6 UX 라벨 요약

```txt
GET /api/labels/summary?site_id={site_id}
```

Redis session state를 기반으로 UX 이탈 유형 요약을 반환합니다.

---

### 5.7 AI 인사이트

```txt
GET /api/insights?site_id={site_id}
```

Redis session state와 Redis event summary를 기반으로 AI UX 인사이트를 생성합니다.

---

### 5.8 A/B 테스트 목록

```txt
GET /api/experiments?site_id={site_id}
```

사이트의 실험 목록을 반환합니다.

---

### 5.9 A/B 테스트 상태 변경

```txt
PATCH /api/experiments/:id
```

실험 상태를 변경합니다.

예시:

```json
{
  "site_id": "legend-ecommerce",
  "status": "running"
}
```

기존 running 실험이 있을 경우 다음과 같은 응답을 반환합니다.

```json
{
  "ok": false,
  "reason": "running_experiment_exists",
  "message": "이미 진행 중인 실험이 있습니다. 기존 실험을 일시 중지한 뒤 새 실험을 배포할 수 있습니다.",
  "running_experiment": {
    "id": "exp_old",
    "key": "exp_home_cta_v1",
    "status": "running"
  }
}
```

기존 running 실험을 paused 처리하고 새 실험을 배포하려면 다음 옵션을 사용합니다.

```json
{
  "site_id": "legend-ecommerce",
  "status": "running",
  "replace_running": true
}
```

---

## 6. 환경변수

`.env` 또는 실행 환경에 다음 값을 설정할 수 있습니다.

```env
# Server
PORT=3001
NODE_ENV=development

# Kafka collector
ENABLE_KAFKA_DUAL_WRITE=true
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=ux-sdk-service
KAFKA_TOPIC_EVENTS=ux.events.raw
KAFKA_CONSUMER_GROUP_ID=ux-sdk-event-consumer
KAFKA_CONSUMER_FROM_BEGINNING=false

# Legacy collect fallback
ENABLE_LEGACY_FILE_COLLECT_FALLBACK=false

# Redis read model
ENABLE_REDIS_SESSION_STORE=true
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=uxsdk
REDIS_SESSION_TTL_SEC=1800
REDIS_ASSIGNMENT_TTL_SEC=2592000

# LLM
OPENAI_API_KEY=
LLM_PROVIDER=openai
LLM_MODEL=
```

> 현재 Kafka 활성화 환경변수 이름은 기존 호환성을 위해 `ENABLE_KAFKA_DUAL_WRITE`를 사용합니다.
> 다만 현재 구조는 dual write가 아니라 Kafka primary collector 구조입니다.
> 추후 `ENABLE_KAFKA_COLLECTOR`와 같은 이름으로 정리할 수 있습니다.

---

## 7. 로컬 실행

### 7.1 의존성 설치

```bash
npm install
```

또는 backend 디렉터리 기준으로 실행하는 구조라면:

```bash
cd dashboard-be
npm install
```

---

### 7.2 Kafka 실행

로컬 Docker 예시:

```bash
docker run -d \
  --name ux-sdk-kafka \
  -p 9092:9092 \
  apache/kafka:3.7.1
```

Kafka topic 생성 예시:

```bash
docker exec -it ux-sdk-kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create \
  --topic ux.events.raw \
  --partitions 1 \
  --replication-factor 1
```

Topic 확인:

```bash
docker exec -it ux-sdk-kafka /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --list
```

---

### 7.3 Redis 실행

로컬 Docker 예시:

```bash
docker run -d \
  --name ux-sdk-redis \
  -p 6379:6379 \
  redis:7
```

연결 확인:

```bash
redis-cli ping
```

정상 응답:

```txt
PONG
```

---

### 7.4 Dashboard 서버 실행

```bash
npm run dev
```

또는 backend 기준:

```bash
cd dashboard-be
npm run dev
```

서버 기본 주소:

```txt
http://localhost:3001
```

---

### 7.5 Kafka Consumer 실행

```bash
npm run worker:events
```

Consumer는 Kafka topic의 이벤트를 읽어 Redis read model을 갱신합니다.

---

## 8. 운영 실행 예시

PM2를 사용하는 경우:

```bash
pm2 start "npm run dev" --name dashboard
pm2 start "npm run worker:events" --name dashboard-worker
pm2 save
```

환경변수 변경 후 재시작:

```bash
pm2 restart dashboard --update-env
pm2 restart dashboard-worker --update-env
```

로그 확인:

```bash
pm2 logs dashboard
pm2 logs dashboard-worker
```

---

## 9. SDK 연동 예시

일반 HTML 사이트에서는 다음과 같이 사용할 수 있습니다.

```html
<script src="http://localhost:3001/sdk.js"></script>
<script>
  MiniSDK.create({
    siteId: "legend-ecommerce",
    appId: "legend-ecommerce",
    endpoint: "http://localhost:3001/collect",
    configEndpoint: "http://localhost:3001/api/config",
    debug: true
  }).install();
</script>
```

React/Vite 프로젝트에서는 proxy를 사용할 수 있습니다.

```ts
server: {
  proxy: {
    "/uxsdk": {
      target: "http://localhost:3001",
      changeOrigin: true,
      rewrite: (requestPath) => requestPath.replace(/^\/uxsdk/, ""),
    },
  },
}
```

SDK 설정 예시:

```ts
window.MiniSDK?.create({
  endpoint: "/uxsdk/collect",
  configEndpoint: "/uxsdk/api/config",
  siteId: "legend-ecommerce",
  appId: "legend-ecommerce",
  schemaVersion: 1,
  debug: true
}).install();
```

요청 매핑:

| Ecommerce 요청        | Dashboard 요청  |
| ------------------- | ------------- |
| `/uxsdk/sdk.js`     | `/sdk.js`     |
| `/uxsdk/collect`    | `/collect`    |
| `/uxsdk/api/config` | `/api/config` |

---

## 10. 테스트

정적 문법 확인:

```bash
node --check dashboard-be/server.js
node --check dashboard-be/services/collector/collect-handler.js
node --check dashboard-be/services/stores/event-store.js
node --check dashboard-be/workers/event-consumer.js
node --check dashboard-be/routes/chat-routes.js
node --check dashboard-be/routes/agent-routes.js
node --check dashboard-fe/public/dashboard.js
```

전체 테스트:

```bash
npm test
```

Diff whitespace 확인:

```bash
git diff --check
```

---

## 11. 현재 테스트 범위

현재 테스트에는 다음 흐름이 포함됩니다.

* site_id당 running 실험 단일화 정책
* running 실험 교체 배포 정책
* Agent approval 기반 실험 배포
* Redis event summary store
* Redis session analytics service
* Kafka primary collect handler
* Redis unavailable 응답 처리
* A/B config 중복 running 방어 로직

---

## 12. Legacy 및 추후 정리 후보

현재 운영 기준 read/write path는 Kafka와 Redis 중심으로 전환되었습니다.

다만 다음 legacy 요소는 아직 일부 기능에서 참조될 수 있어 바로 삭제하지 않습니다.

| 항목                                       | 상태 | 이유                                                           |
| ---------------------------------------- | -- | ------------------------------------------------------------ |
| `events.jsonl`                           | 보류 | legacy metrics/chat tools 일부와 과거 데이터 보관                      |
| `createCompositeEventStore`              | 보류 | 기존 unit test 및 legacy store abstraction 가능성                  |
| `analytics/pipeline.js`                  | 보류 | Redis analytics service가 label summary/input builder 일부를 재사용 |
| Commerce demo services                   | 보류 | chat/commerce assistant와 API route에서 참조                      |
| `scenario-data.js`, sample/eval fixtures | 보류 | 테스트 및 시나리오 생성에서 사용                                           |

추후 정리 방향:

```txt
1. legacy fileEventStore 참조 제거
2. events.jsonl 기반 chat tool 정리
3. analytics/pipeline.js의 순수 함수와 file pipeline 분리
4. ENABLE_KAFKA_DUAL_WRITE env 이름 정리
5. legacy commerce/demo 기능 유지 여부 결정
```

---

## 13. 현재 상태 요약

현재 Dashboard의 핵심 데이터 흐름은 다음과 같습니다.

```txt
SDK
  ↓
/collect
  ↓
Kafka
  ↓
event-consumer
  ↓
Redis read model
  ↓
Dashboard API
  ↓
Dashboard UI
```

즉, 현재 Dashboard는 초기 MVP의 `events.jsonl` 기반 로그 뷰어 구조에서 벗어나, Kafka와 Redis를 중심으로 한 실시간 UX 분석 대시보드 구조로 전환되었습니다.
