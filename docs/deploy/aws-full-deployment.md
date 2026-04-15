# AWS Full Deployment Runbook

이 문서는 `Dashboard`를 **대시보드 앱 + 이벤트 워커 + Kafka + Redis + 이커머스 연동**까지 포함한 완전체로 배포하기 위한 첫 번째 운영 계약서입니다.

## 1. 배포 범위

완전체 배포는 아래 5개 역할이 함께 돌아가야 합니다.

1. **dashboard-be 앱 서비스**
   - 로그인, `/dashboard`, `/editor`, `/collect`, `/api/config`, `/api/*` 제공
2. **event-consumer 워커 서비스**
   - Kafka 이벤트 소비
   - Redis 세션/메트릭 갱신
3. **Kafka / MSK**
   - `/collect` 이후 이벤트 스트림 전달
4. **Redis / ElastiCache**
   - 실시간 세션/메트릭 조회 소스
5. **이커머스 사이트 + UX SDK**
   - 브라우저 이벤트 전송
   - 실험 config 적용

## 2. 이 저장소가 담당하는 것

이 저장소(`C:\Dashboard`)는 SDK 소스 저장소가 아니라 **패키징된 `@enejwl/ux-sdk`를 소비하는 운영 대시보드 저장소**입니다.

- `dashboard-be/server.js`
  - `/sdk.js` 서빙
  - `/collect`
  - `/api/config`
  - 대시보드/에디터/미리보기
- `dashboard-be/workers/event-consumer.js`
  - Kafka -> Redis 반영
- `dashboard-be/docker-compose.yml`
  - 로컬 Kafka/Redis 실행 예시

즉 AWS 배포의 1차 주 작업은 **이 저장소**에서 진행합니다.

## 3. 권장 AWS 구성

### 권장 구성

- **Dashboard App**: ECS/Fargate 또는 EC2 1개 서비스
- **Event Consumer Worker**: ECS/Fargate 또는 EC2 별도 서비스
- **Kafka**: Amazon MSK 권장
- **Redis**: ElastiCache for Redis 권장
- **Secrets**: AWS Secrets Manager 또는 SSM Parameter Store
- **로그**: CloudWatch Logs

### 최소 분리 단위

- 앱 서비스와 워커 서비스는 **반드시 분리**합니다.
- Redis/Kafka는 가능하면 EC2 직접 설치보다 관리형 서비스 사용을 권장합니다.

## 4. 필수 환경 변수

이제 env 예제는 역할별로 분리되어 있습니다.

- `dashboard-be/.env.shared.example`
  - app / worker 공통 infra 설정
- `dashboard-be/.env.app.example`
  - dashboard app 전용 설정
- `dashboard-be/.env.worker.example`
  - event-consumer worker 전용 설정

### shared (app + worker 공통)

```env
ENABLE_KAFKA_DUAL_WRITE=true
KAFKA_BROKERS=<msk-bootstrap-host:9092>
KAFKA_CLIENT_ID=ux-sdk-service
KAFKA_TOPIC_EVENTS=ux.events.raw
KAFKA_CONSUMER_GROUP_ID=ux-sdk-event-consumer
KAFKA_CONSUMER_FROM_BEGINNING=false

ENABLE_REDIS_SESSION_STORE=true
REDIS_URL=redis://<redis-endpoint>:6379
REDIS_KEY_PREFIX=uxsdk
REDIS_SESSION_TTL_SEC=1800
REDIS_ASSIGNMENT_TTL_SEC=2592000
```

### app 전용

```env
NODE_ENV=production
PORT=3001

DASHBOARD_ADMIN_USERNAME=admin
DASHBOARD_ADMIN_PASSWORD=<secret>
DASHBOARD_ADMIN_DISPLAY_NAME=Dashboard Admin

LLM_PROVIDER=openai
OPENAI_API_KEY=<secret>
OPENAI_MODEL=gpt-4.1-mini
```

### worker 전용

```env
NODE_ENV=production
```

### ECS/Fargate 적용 원칙

- **App task** = `shared + app`
- **Worker task** = `shared + worker`
- 공통 값은 복제 입력하지 말고, 같은 secret set 또는 parameter namespace로 관리하는 것을 권장합니다.

### 주의

- `ENABLE_KAFKA_DUAL_WRITE=true`만 켜면 **앱이 Kafka로도 쓰기 시작**합니다.
- `ENABLE_REDIS_SESSION_STORE=true`만 켜도 충분하지 않습니다.
  **워커가 Kafka를 읽어 Redis를 채워야** 실시간 세션/메트릭이 살아납니다.
- worker는 `OPENAI_API_KEY`, `PORT`, admin bootstrap 계정이 필요하지 않습니다.

## 5. 사이트 설정 선행 조건

`dashboard-be/data/sites.json`의 각 사이트는 운영 주소로 맞춰져 있어야 합니다.

필수 항목:

- `site_id`
- `preview_base_url`
- `api_base_url`
- `preview_targets` 또는 `target_generation`

배포 전에 반드시 아래를 운영값으로 바꿔야 합니다.

- 로컬 `127.0.0.1` 주소 제거
- 실제 이커머스 프리뷰/앱 API 주소 반영

## 6. 서비스 기동 순서

권장 순서는 아래와 같습니다.

1. Kafka / MSK 준비
2. Redis / ElastiCache 준비
3. Dashboard App 배포
4. Event Consumer Worker 배포
5. `sites.json` 운영값 반영
6. 관리자 계정 bootstrap 확인
7. 이커머스 사이트에 SDK 연결
8. 샘플 이벤트 유입 확인

## 7. 배포 후 검증 체크리스트

### 앱 자체

- `GET /health` -> `200`
- `GET /ready` -> `200`
- `/login` 접속 가능
- `/dashboard` 로그인 후 진입 가능

### Kafka / Redis 경로

- `/ready` 응답에서 `checks.kafka.ok === true`
- `/ready` 응답에서 `checks.redis.ok === true`
- `/collect` 이후 Kafka topic에 이벤트 유입
- worker 로그에서 Kafka consume 확인
- Redis 세션/메트릭 키 생성 확인

### Dashboard 화면

- `/api/realtime/sessions`가 `503`이 아니라 `200`
- Metrics가 Redis 경로를 우선 사용
- Recent Sessions가 실시간 세션을 표시

### 이커머스 연결

- `/sdk.js` 로드 성공
- SDK가 `/api/config`에서 실험 설정 수신
- SDK가 `/collect`로 이벤트 전송

## 8. 지금 당장 이어서 해야 할 다음 작업

이 문서 다음의 실제 구현 우선순위는 아래입니다.

1. **AWS 인프라 코드화**
   - ECS task/service
   - MSK
   - ElastiCache
   - 보안그룹 / 시크릿 연결
2. **운영용 sites.json 시드 전략 정리**
   - 파일 bake-in 또는 외부 저장소 사용 여부 결정
3. **배포용 secret 주입 방식 고정**
   - Secrets Manager / SSM Parameter Store 중 하나로 통일
   - shared/app/worker namespace 설계

## 8-1. 컨테이너 빌드/실행 기준

이 저장소는 루트 기준으로 컨테이너를 빌드해야 합니다.

- `dashboard-be`가 `../dashboard-fe/public` 정적 파일을 함께 서빙함
- `dashboard-be`가 `../vendor/enejwl-ux-sdk-0.1.1.tgz`를 의존성으로 사용함

### 앱 이미지 빌드

```bash
docker build -t dashboard-app .
```

### 워커 이미지 빌드

```bash
docker build -f Dockerfile.worker -t dashboard-worker .
```

### 앱 로컬 실행 예시

```bash
docker run --rm -p 3001:3001 --env-file .env dashboard-app
```

### 워커 로컬 실행 예시

```bash
docker run --rm --env-file .env dashboard-worker
```

## 8-2. AWS 전 로컬 통합 검증

AWS에 올리기 전에 아래 통합 스택이 반드시 한 번은 성공해야 합니다.

### 사용 파일

- `docker-compose.full.yml`
- `dashboard-be/.env.local.shared.example`
- `dashboard-be/.env.local.app.example`
- `dashboard-be/.env.local.worker.example`

### 기동 명령

```bash
npm run stack:up
```

### 종료 명령

```bash
npm run stack:down
```

### 로그 확인

```bash
npm run stack:logs
```

### 로컬 통합 완료 기준

1. `http://localhost:3001/health` -> 200
2. `http://localhost:3001/ready` -> 200
3. `/ready` 응답에서 `checks.kafka.ok === true`
4. `/ready` 응답에서 `checks.redis.ok === true`
5. `/collect`로 보낸 이벤트가 Kafka를 거쳐 worker 로그에 표시됨
6. Redis에 세션/메트릭 키가 쌓임
7. `GET /api/realtime/sessions`가 정상 응답함

### 왜 이 단계가 필요한가

이 검증을 통과하면 AWS에서 바뀌는 것은 주로 **인프라 주소와 시크릿 주입 방식**뿐입니다.
반대로 이 단계가 실패하면 AWS에서도 같은 문제가 반복될 가능성이 높습니다.

### ECS 기준 권장 매핑

- `Dockerfile` -> dashboard app task
- `Dockerfile.worker` -> event consumer worker task
- app/worker는 같은 env 세트를 공유하되, worker는 외부 포트 노출이 필요 없음

## 9. 작업 경계 정리

### 이 저장소(`C:\Dashboard`)에서 할 일

- 앱/워커 배포
- Kafka/Redis 연결
- dashboard/editor/preview 운영화
- `/collect`, `/api/config` 운영 검증

### `C:\UX_SDK`에서 할 일

- SDK 자체 기능 강화
- 이벤트 스키마/재시도/버퍼링/안정성 개선
- 실험 적용 로직 고도화
- 새 SDK 버전 패키징

즉 **완전체 배포의 시작점은 이 저장소**이고,
**SDK 자체를 더 강하게 만드는 작업은 UX_SDK 저장소에서 이어집니다.**
