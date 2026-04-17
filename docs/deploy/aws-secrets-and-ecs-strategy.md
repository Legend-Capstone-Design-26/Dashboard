# AWS Secrets & ECS Strategy

이 문서는 이 저장소를 AWS에 올릴 때 **무엇을 Secrets Manager에 넣고**, **무엇을 SSM Parameter Store에 넣고**, **ECS app/worker task에 어떻게 주입할지**를 고정합니다.

## 1. 최종 권장안

가장 운영하기 좋은 방식은 아래 **혼합 전략**입니다.

- **AWS Secrets Manager**
  - 진짜 비밀값 저장
- **AWS Systems Manager Parameter Store**
  - 비밀이 아닌 런타임 설정 저장

이 방식을 권장하는 이유:

1. 비밀값 rotation이 쉬움
2. app/worker 공통 설정을 namespace로 관리하기 좋음
3. ECS task definition이 깔끔해짐
4. 누가 봐도 secret과 config 경계가 명확해짐

---

## 2. 무엇을 어디에 둘 것인가

### A. Secrets Manager

아래 값은 **Secrets Manager**로 관리합니다.

- `/dashboard/prod/app/admin`
  - `DASHBOARD_ADMIN_USERNAME`
  - `DASHBOARD_ADMIN_PASSWORD`
  - `DASHBOARD_ADMIN_DISPLAY_NAME`
- `/dashboard/prod/app/llm`
  - `OPENAI_API_KEY`

선택적으로 하나의 secret에 묶을 수도 있지만,
운영에서는 **admin bootstrap**과 **LLM secret**을 분리하는 쪽이 더 안전합니다.

### B. Parameter Store

아래 값은 **Parameter Store**로 관리합니다.

- `/dashboard/prod/shared/ENABLE_KAFKA_DUAL_WRITE`
- `/dashboard/prod/shared/KAFKA_BROKERS`
- `/dashboard/prod/shared/KAFKA_CLIENT_ID`
- `/dashboard/prod/shared/KAFKA_TOPIC_EVENTS`
- `/dashboard/prod/shared/KAFKA_CONSUMER_GROUP_ID`
- `/dashboard/prod/shared/KAFKA_CONSUMER_FROM_BEGINNING`
- `/dashboard/prod/shared/ENABLE_REDIS_SESSION_STORE`
- `/dashboard/prod/shared/REDIS_URL`
- `/dashboard/prod/shared/REDIS_KEY_PREFIX`
- `/dashboard/prod/shared/REDIS_SESSION_TTL_SEC`
- `/dashboard/prod/shared/REDIS_ASSIGNMENT_TTL_SEC`
- `/dashboard/prod/app/NODE_ENV`
- `/dashboard/prod/app/PORT`
- `/dashboard/prod/app/LLM_PROVIDER`
- `/dashboard/prod/app/OPENAI_MODEL`
- `/dashboard/prod/worker/NODE_ENV`

---

## 3. Namespace 규칙

권장 namespace는 아래와 같습니다.

```txt
/dashboard/prod/shared/*
/dashboard/prod/app/*
/dashboard/prod/worker/*
```

환경이 추가되면 `prod`만 바꾸면 됩니다.

예:

```txt
/dashboard/staging/shared/*
/dashboard/staging/app/*
/dashboard/staging/worker/*
```

---

## 4. ECS task 주입 규칙

### App task

App task는 아래를 받습니다.

- shared config (Parameter Store)
- app config (Parameter Store)
- admin secret (Secrets Manager)
- llm secret (Secrets Manager)

ECS에서는 위 값을 **containerDefinitions[].secrets** 로 주입하는 것을 권장합니다.
즉 Parameter Store 값도 task definition의 `environment` 하드코딩 대신 `secrets.valueFrom` 으로 주입합니다.

### Worker task

Worker task는 아래를 받습니다.

- shared config (Parameter Store)
- worker config (Parameter Store)

Worker에는 아래가 필요 없습니다.

- `PORT`
- `DASHBOARD_ADMIN_*`
- `OPENAI_API_KEY`

즉 app/worker 모두 **ECS secrets 필드로 통일 주입**하고,
secret source만 `Secrets Manager` 와 `SSM Parameter Store` 로 나눕니다.

---

## 5. EFS 권장 이유

현재 코드 구조에서는 `/app/dashboard-be/data`가 **운영 상태 + 로그**를 포함하므로,
ECS/Fargate로 간다면 EFS를 붙이는 것이 가장 현실적입니다.

권장 마운트 경로:

```txt
/app/dashboard-be/data
```

app과 worker가 같은 데이터를 읽고 써야 하므로,
같은 EFS access point를 공유하는 구성이 가장 단순합니다.

---

## 6. 초기 배포 순서

1. ECR에 app 이미지 push
2. ECR에 worker 이미지 push
3. EFS 생성 및 access point 준비
4. Secrets Manager secret 생성
5. Parameter Store 값 생성
6. ECS app task definition 등록
7. ECS worker task definition 등록
8. app service 생성
9. worker service 생성
10. `/health`, `/ready` 검증

---

## 7. 지금 단계에서의 결론

이 저장소 기준 최종 권장안은 아래입니다.

- **Secrets Manager**: 민감값
- **Parameter Store**: 비민감 설정값
- **EFS**: `/app/dashboard-be/data`
- **ECS/Fargate**: app / worker 분리 배포

즉 AWS 콘솔에서는 이제 이 문서를 기준으로 값을 만들면 됩니다.
