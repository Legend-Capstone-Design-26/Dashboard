# Dashboard

이 프로젝트는 **운영자용 대시보드 서비스**입니다.

## 구성

- `dashboard-fe`
  - 로그인 / 대시보드 / editor 정적 UI
- `dashboard-be`
  - Express API 서버
  - 로그인/세션/권한
  - 실험, metrics, sessions, insights, preview proxy
  - 사용자와 `site_id` 접근 제어

설치형 브라우저 SDK 패키지는 `@enejwl/ux-sdk`로 사용합니다.

## 현재 런타임 의존성

현재 `Dashboard`는 `/sdk.js`를 서빙할 때 **설치된 패키지 의존성 `@enejwl/ux-sdk`** 를 사용합니다.

즉 `Dashboard`는 더 이상 `../UX_SDK/...` 소스 경로를 직접 참조하지 않습니다.

현재 `Dashboard`는 SDK 패키지 tarball을 자체적으로 포함하고 있습니다.

```txt
Dashboard/vendor/enejwl-ux-sdk-0.1.1.tgz
```

즉 `Dashboard`는 더 이상 `../UX_SDK` 소스 폴더가 없어도 설치/실행할 수 있습니다.

나중에 npm publish가 완료되면 이 tarball 의존성은 일반 버전 의존성으로 바꿀 수 있습니다.

## 실행

```bash
cd Dashboard
npm install
npm run dev
```

접속:

- 로그인: `http://localhost:3001/login`
- 대시보드: `http://localhost:3001/dashboard`
- 에디터: `http://localhost:3001/editor`

## 로그인

세션 쿠키 기반 인증을 사용합니다.

현재 기본 admin 계정은 데이터가 비어 있고 환경변수 bootstrap이 제공될 때만 생성됩니다.

권장 환경변수:

```bash
DASHBOARD_ADMIN_USERNAME=admin
DASHBOARD_ADMIN_PASSWORD=change-me
DASHBOARD_ADMIN_DISPLAY_NAME=Dashboard Admin
```

## 사용자 권한

- admin 계정만 사용자 생성 가능
- 일반 사용자 계정은 사용자 관리 UI가 보이지 않음
- 각 사용자는 허용된 `site_id`만 dashboard/editor에서 볼 수 있음

데이터 파일:

- `dashboard-be/data/users.json`
- `dashboard-be/data/user_site_access.json`
- `dashboard-be/data/sites.json`

## 세션 쿠키 설명

- `HttpOnly`
  - 브라우저 JavaScript에서 쿠키를 읽지 못하게 함
- `Secure`
  - HTTPS에서만 쿠키 전송

즉 `HttpOnly`는 "HTTP 전용"이 아니라 **JS 접근 제한 옵션**입니다.

## 테스트

```bash
cd Dashboard
npm test
```

## 배포 가이드

완전체 배포(App + Worker + Kafka + Redis + Ecommerce 연동) 시작점은 아래 문서를 참고합니다.

- `docs/deploy/aws-full-deployment.md`
- `dashboard-be/.env.shared.example`
- `dashboard-be/.env.app.example`
- `dashboard-be/.env.worker.example`
- `dashboard-be/.env.local.shared.example`
- `dashboard-be/.env.local.app.example`
- `dashboard-be/.env.local.worker.example`
- `docker-compose.full.yml`
- `docs/deploy/data-seed-strategy.md`
- `dashboard-be/data/sites.production.example.json`
- `docs/deploy/aws-secrets-and-ecs-strategy.md`
- `infra/aws/ecs-app-task-definition.example.json`
- `infra/aws/ecs-worker-task-definition.example.json`

## 주의

- preview proxy는 신뢰된 사이트에만 연결해야 함
- 운영 전에는 CORS allowlist, site/domain 검증, rate limit 보강 권장
