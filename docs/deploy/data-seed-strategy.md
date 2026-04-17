# Production Data & Seed Strategy

이 문서는 AWS 배포 전에 `dashboard-be/data` 아래 파일을 **무엇을 이미지에 넣고**, **무엇을 런타임 상태로 분리하고**, **무엇을 운영 시드로 준비해야 하는지** 정리합니다.

## 1. 핵심 원칙

운영에서는 `dashboard-be/data`를 하나의 폴더로만 보면 안 됩니다.

이 프로젝트의 데이터 파일은 아래 3종류로 나뉩니다.

1. **운영 시드(seed)**
   - 배포 전에 준비되는 기본 설정
2. **운영 상태(state)**
   - 앱이 실행 중 직접 수정하는 파일
3. **이벤트/분석 로그(log)**
   - 계속 append 되는 파일

운영에서는 **state/log 파일을 컨테이너 이미지에 bake-in 하면 안 됩니다.**

---

## 2. 파일별 분류

### A. 운영 시드(seed)

이 파일들은 운영 시작 전에 준비해둘 수 있습니다.

- `sites.json`
  - 필수
  - 단, 일부 필드는 런타임에 갱신될 수 있음
- `products.json`
- `faq.json`
- `policies.json`
- `orders.json`

이 중 `products/faq/policies/orders`는 현재 데모/샘플 성격이 강하므로,
운영에서 실제 이커머스 시스템과 연결한다면 장기적으로는 별도 API/DB로 옮기는 것이 좋습니다.

### B. 운영 상태(state)

이 파일들은 서버가 직접 수정합니다.

- `users.json`
  - 관리자/사용자 계정 저장
- `user_site_access.json`
  - 사용자별 site 접근 권한 저장
- `experiments.json`
  - 에디터/대시보드에서 만든 실험 저장
- `sites.json`
  - `inferred_preview_targets`, `inferred_targets_updated_at`가 갱신될 수 있음
- `chat_sessions.json`
- `chat_feedback.json`
- `support_tickets.json`

즉 `sites.json`은 **순수 seed 파일이 아니라 seed + mutable state 혼합형**입니다.

### C. 이벤트/분석 로그(log)

- `events.jsonl`
- `events.consumed.jsonl`
- `chat_events.jsonl`

이 파일들은 append-only 성격이며, 운영에서는 persistent volume 또는 외부 로그/저장소 전략이 필요합니다.

---

## 3. 운영에서 반드시 분리해야 하는 것

### 이미지에 넣어도 되는 것

- 코드
- 정적 프론트
- SDK tarball
- 문서
- 선택적 demo seed template

### 이미지에 넣으면 안 되는 것

- 실제 운영 `users.json`
- 실제 운영 `user_site_access.json`
- 실제 운영 `experiments.json`
- 실제 운영 `events.jsonl`
- 실제 운영 `events.consumed.jsonl`
- 실제 운영 `chat_events.jsonl`

이 값들은 컨테이너 재배포 시 보존되어야 하므로 **persistent storage**로 분리해야 합니다.

---

## 4. 권장 운영 전략

### 권장안 (현재 구조 유지 기준)

`/app/dashboard-be/data` 전체를 persistent volume으로 분리하고,
배포 직후 아래 순서로 seed를 주입합니다.

1. persistent volume 마운트
2. 비어 있는 경우에만 seed 파일 복사
3. 앱 기동
4. admin bootstrap env로 초기 관리자 생성

이 전략은 현재 코드 구조를 거의 안 바꾸고도 운영할 수 있다는 장점이 있습니다.

### 중기 개선안

다음 파일은 장기적으로 파일 저장소에서 분리하는 것이 좋습니다.

- `users.json` -> DB 또는 auth 서비스
- `user_site_access.json` -> DB
- `experiments.json` -> DB
- `events*.jsonl` -> Kafka + object storage / warehouse
- `sites.json` -> 운영 config store 또는 admin-managed DB

---

## 5. sites.json 운영 규칙

`sites.json`은 운영에서 가장 중요합니다.

반드시 포함해야 하는 값:

- `site_id`
- `name`
- `preview_base_url`
- `api_base_url`
- `target_generation` 또는 `preview_targets`

운영에서 주의할 점:

- `127.0.0.1` 주소 금지
- preview 대상은 실제 운영/스테이징 도메인으로 교체
- `inferred_preview_targets`는 런타임 갱신 가능

즉 운영용 `sites.json`은 아래 두 층으로 이해해야 합니다.

1. **base seed**
   - site_id / base urls / target_generation / manual preview targets
2. **runtime overlay**
   - inferred_preview_targets / inferred_targets_updated_at

---

## 6. admin/user 초기화 규칙

현재 서버는 아래 조건에서만 초기 admin을 생성합니다.

- `users.json`이 비어 있음
- `DASHBOARD_ADMIN_USERNAME`
- `DASHBOARD_ADMIN_PASSWORD`

즉 운영에서는 아래 중 하나를 택해야 합니다.

### 방법 A. bootstrap env 사용

- 첫 배포 시 env로 admin 생성
- 이후 env는 제거하거나 rotation

### 방법 B. users.json 사전 주입

- 운영 계정을 미리 만들어 volume에 넣고 시작

권장: **방법 A**

이유:
- 초기 배포 자동화가 쉬움
- 이미지에 계정 파일을 넣지 않아도 됨

---

## 7. AWS 직전 체크리스트

AWS 가기 전에 아래 질문에 답할 수 있어야 합니다.

1. `dashboard-be/data` 전체를 volume으로 뺄 것인가?
2. `sites.json`는 누가 언제 주입하는가?
3. admin 계정은 env bootstrap인가, 파일 주입인가?
4. `experiments.json`은 volume 유지인가, 외부 저장소로 이전할 계획인가?
5. `events*.jsonl`는 임시 운영 로그인가, 장기 저장 대상인가?

이 5개가 정해지면 그 다음에 ECS/EBS/EFS/S3/Secrets 설계를 확정할 수 있습니다.

---

## 8. 현재 단계에서의 권장 결론

지금 이 저장소 구조를 유지하면서 AWS에 가장 빨리 올리려면 아래가 현실적입니다.

- `sites.json` -> 운영 seed 파일로 준비
- `users.json`, `user_site_access.json`, `experiments.json` -> persistent volume 유지
- `events.jsonl`, `events.consumed.jsonl`, `chat_events.jsonl` -> persistent volume 유지
- 초기 admin -> env bootstrap
- 데모 catalog 파일 (`products/faq/policies/orders`) -> 필요 시만 seed

즉 **AWS 직전 기준 권장안은 “seed + persistent volume” 혼합 전략**입니다.
