# 관찰성 (Observability): CloudWatch 모니터링 가이드

## 개요

이 문서는 Web Search Tool Gateway를 운영할 때 AgentCore Gateway의 성능, 사용량, 오류를 CloudWatch를 통해 모니터링하는 방법을 설명합니다.

**대상 독자:** AWS 엔터프라이즈 고객의 AWS 담당자/SA (한국)

**범위:**
- CloudWatch 콘솔에서 직접 보는 방법
- 프로젝트의 로컬 대시보드 (`/observability`) 사용 방법
- 메트릭(Metrics), 로그(Logs), 트레이스(Traces)의 의미
- 알람 설정 예시
- 비용 추정의 한계

---

## 아키텍처 개요

```
┌─────────────────────────────────────────┐
│   AgentCore Gateway                     │
│   (ap-northeast-2)                      │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
[CloudWatch      [CloudWatch
 Metrics]        Vended Logs]
 (AWS/Bedrock-   (/aws/vendedlogs/
  AgentCore)      bedrock-agentcore/)
    │                     │
    └──────────┬──────────┘
               ▼
    [로컬 대시보드 또는
     CloudWatch 콘솔]
```

### Vended Logs란?

AWS 서비스가 자동으로 고객 계정의 CloudWatch Logs로 전송하는 애플리케이션 로그입니다. AgentCore Gateway는 다음을 vended log로 제공합니다:

- **로그 그룹:** `/aws/vendedlogs/bedrock-agentcore/gateway/{gateway_id}`
- **내용:** 요청/응답 바디, trace_id, span_id, 스핸 정보 (OTEL 표준)
- **목적:** 감시, 디버깅, 재현(reproducibility) 지원

---

## 1. 메트릭 (Metrics)

### 1.1 메트릭 네임스페이스

**네임스페이스:** `AWS/Bedrock-AgentCore`

Gateway가 발행하는 메트릭들:

| 메트릭명 | 단위 | 설명 | 차원(Dimensions) |
|----------|------|------|------------------|
| `Invocations` | Count | 게이트웨이 호출 수 | Operation, Protocol, Method, Resource, toolName |
| `Latency` | Milliseconds | 전체 요청-응답 시간 | 동일 |
| `TargetExecutionTime` | Milliseconds | 백엔드 타겟(Lambda/MCP) 실행 시간 | 동일 |
| `Throttles` | Count | 스로틀링으로 차단된 요청 (서비스 한도 초과) | 동일 |
| `SystemErrors` | Count | 5xx 에러 (서비스 오류) | 동일 |
| `UserErrors` | Count | 4xx 에러 (클라이언트 오류) | 동일 |

### 1.2 차원(Dimensions) 설명

- **Operation:** `tools/list`, `tools/call` 등
- **Protocol:** `MCP/1.0` 등
- **Method:** `GET`, `POST` 등
- **Resource:** 도구명 (tavily, brave, serper 등)
- **toolName:** 개별 도구 이름 (예: `search_web`, `search_code`)

### 1.3 메트릭 확인: CloudWatch 콘솔

**경로:**
```
CloudWatch → Metrics → AWS/Bedrock-AgentCore
```

**조회 예시:**

1. **도구별 호출 수 조회**
   - 메트릭: `Invocations`
   - 필터: `toolName = "tavily"` 또는 `Resource = "tavily"`
   - 통계: `Sum`
   - 기간: `1 Minute`, `5 Minutes`, `1 Hour`

2. **도구별 평균 지연 조회**
   - 메트릭: `Latency`
   - 필터: 모든 도구 (또는 특정 Resource)
   - 통계: `Average`
   - 그룹: `Resource` 차원으로 분리

3. **에러율 확인**
   - 메트릭: `UserErrors`, `SystemErrors`
   - 통계: `Sum`
   - 기간: `5 Minutes`

**주의:** Gateway 자체에서는 **토큰 수나 비용 메트릭을 직접 발행하지 않습니다.** 비용 추정은 호출 수와 엔진별 단가표를 조합하여 산출해야 합니다 ([1.5절 참조](#15-비용-추정의-한계)).

### 1.4 메트릭 저장 기간

- **기본 보유 기간:** 15개월
- **고해상도(High-Resolution):** 최대 3시간 (1초 단위)
- **표준:** 최대 15개월 (1분 단위 이상)

### 1.5 비용 추정의 한계

**문제:** Bedrock 모델(Claude)에 대한 토큰 수를 알려면 Bedrock 모델 invocation 메트릭을 별도로 조회해야 하지만, AgentCore Gateway는 이를 직접 노출하지 않습니다.

**해결책:**
1. **문제 해결 전략 선택:**
   - **Option A (보수적):** `Invocations` 메트릭으로 호출 수만 계산. 예: "월 1만 호출 × $0.001/호출 ≈ $10"
   - **Option B (정확함):** Bedrock 콘솔(`Bedrock → Usage`)에서 직접 모델 사용량 조회
   - **Option C (자동화):** 로컬 대시보드의 "비용" 카드 — "추정치 ★" 레이블로 명시하고 정확한 청구는 AWS 콘솔 확인 권장

2. **주의사항:**
   - 호출당 비용은 엔진별 다름 (예: Tavily MCP ≠ Serper Lambda)
   - MCP vs Lambda 타겟 비용이 상이할 수 있음
   - 토큰 오버헤드(요청 헤더, 에러 재시도) 미반영

3. **권장:**
   - 개발 단계: Option A로 정성적 추정만 사용
   - 프로덕션: 월 단위로 Option B로 실제 청구액 검증

---

## 2. 로그 (Logs) — Vended Logs 상세

### 2.1 로그 그룹

**그룹명:** `/aws/vendedlogs/bedrock-agentcore/gateway/{gateway_id}`

- `gateway_id` — Terraform output으로 확인 가능:
  ```bash
  terraform -chdir=infra/environments/dev output gateway_id
  ```

### 2.2 로그 스트림 구조

각 로그 스트림은 Gateway의 개별 작업(invocation)을 나타냅니다:

```json
{
  "timestamp": "2026-05-31T10:23:45.123Z",
  "request_id": "req-12345",
  "trace_id": "0af7651916cd43dd8448eb211c80319c",
  "span_id": "b7ad6b7169203331",
  "level": "INFO",
  "message": "Tool invoked: tavily",
  "request_body": {
    "tools": [
      {
        "toolName": "search_web",
        "toolInput": {"query": "kubernetes", "num_results": 5}
      }
    ]
  },
  "response_body": {
    "result": [
      {
        "title": "Kubernetes Documentation",
        "url": "https://...",
        "snippet": "...",
        "score": 0.95
      }
    ]
  },
  "latency_ms": 245,
  "status_code": 200
}
```

### 2.3 로그 조회: CloudWatch Insights

**경로:**
```
CloudWatch → Logs → Log Insights
```

#### 예제 쿼리 1: 특정 도구의 에러 조회

```
fields @timestamp, @message, toolName, status_code, latency_ms
| filter toolName = "serper" and status_code >= 400
| stats count() as error_count, avg(latency_ms) as avg_latency by status_code
```

#### 예제 쿼리 2: 1시간 내 가장 느린 5개 요청

```
fields @timestamp, toolName, latency_ms, request_body.tools[0].toolName
| stats max(latency_ms) as max_latency by toolName
| sort max_latency desc
| limit 5
```

#### 예제 쿼리 3: trace_id로 단일 요청 재현

```
fields @timestamp, @message, request_body, response_body
| filter trace_id = "0af7651916cd43dd8448eb211c80319c"
```

**활용 팁:**
- **trace_id/span_id:** OpenTelemetry 표준. Jaeger, Datadog 등 외부 백엔드와 연계 가능
- **request_body/response_body:** 전체 로그되므로 PII 주의 (마스킹 필요시 로그 필터 정책 적용)

### 2.4 로그 보관 설정

**경로:**
```
CloudWatch → Logs → Log Groups → /aws/vendedlogs/bedrock-agentcore/gateway/... 
→ Edit retention policy
```

**권장 설정:**
- 개발: 7 days
- 스테이징: 30 days
- 프로덕션: 90 days 이상

---

## 3. 트레이스 (Traces) — OTEL 스팬

### 3.1 OTEL 스팬 구조

AgentCore는 OpenTelemetry 호환 스팬을 발행합니다:

- **SERVER 스팬:** Gateway 요청 입수 → 응답 전송
- **CLIENT 스팬:** Gateway → 타겟(Lambda/MCP) 호출

#### 예시 스팬 트리:

```
[SERVER] POST /tools/call (trace_id=0af7...)
├── [CLIENT] Lambda invoke tavily (span_id=b7a...)
│   └── latency: 150ms
├── [CLIENT] MCP call tools/result (span_id=c8b...)
│   └── latency: 95ms
└── total latency: 245ms
```

### 3.2 트레이스 조회

#### Option A: CloudWatch Logs (무료)

위 섹션 2.3의 trace_id 쿼리 사용.

#### Option B: X-Ray (선택적, 유료)

1. **활성화:**
   ```bash
   # terraform.tfvars에서 enable_otlp_export = true 설정
   # 그 다음 X-Ray daemon 실행 (로컬) 또는
   # otlp_endpoint = "http://localhost:4317" 지정
   ```

2. **조회:**
   ```
   X-Ray → Traces → Service map
   ```

3. **비용:** 수신 스팬당 $0.50/백만 (약간의 추가 비용)

### 3.3 OTEL 속성 (Attributes)

vended log의 각 레코드에는 다음이 포함됩니다:

| 속성 | 타입 | 예시 |
|------|------|------|
| `otel.span_kind` | string | `SERVER`, `CLIENT` |
| `otel.status_code` | string | `OK`, `ERROR` |
| `http.status_code` | int | 200, 400, 500 |
| `http.method` | string | `POST` |
| `http.url` | string | `/tools/call` |
| `rpc.system` | string | `aws_lambda`, `mcp` |

### 3.4 로컬 대시보드의 트레이스 뷰 (`/traces`)

대시보드의 `/traces` 페이지는 X-Ray Transaction Search에 쌓인 OTEL 스팬을 CloudWatch 콘솔 없이 직접 조회합니다.

- **데이터 소스:** X-Ray `GetTraceSummaries`(목록) + `BatchGetTraces`(스팬 트리). CloudWatch 메트릭/로그와는 다른 소스입니다.
- **`TimeRangeType`는 반드시 `Event`:** Transaction Search는 CloudWatch Logs 기반이라 `Event` 모드에서만 트레이스가 조회됩니다. (`TraceId` 모드는 결과가 0건이라 "트래픽 없음"처럼 보입니다.)
- **게이트웨이 스코핑:** filter expression `service("<gateway_id>")` — 계정 내 다른 게이트웨이와 섞이지 않습니다.
- **시간 범위:** 1시간 / 6시간 / 24시간. X-Ray API가 24시간을 초과하는 조회를 거부하므로 7일은 지원하지 않습니다.
- **필요 IAM 권한** (대시보드를 실행하는 `AWS_PROFILE` 자격증명에 부여):
  - `xray:GetTraceSummaries`
  - `xray:BatchGetTraces`
- **목록:** 시각 · 도구 · Duration · HTTP · 상태(정상/Error/Fault/Throttle) 배지. 도구명은 스팬의 `span.name`(`AgentCore.Gateway.InvokeTool.<tool>`)에서 추출하며, `ListTools` 같이 도구가 없는 호출은 `—`로 표시됩니다.
- **상세:** 트레이스 행 클릭 → SERVER/CLIENT 스팬 워터폴(상대 시작 위치·길이를 막대로 표시).

> 구현: `dashboard/src/app/api/xray/traces/route.ts`, `dashboard/src/app/api/xray/traces/[id]/route.ts`, `dashboard/src/lib/xray.ts`, `dashboard/src/app/traces/page.tsx`.

---

## 4. 로컬 대시보드: `/observability` 페이지

### 4.1 개요

프로젝트의 로컬 웹 대시보드(`http://localhost:3000/observability`)는 CloudWatch 콘솔을 거치지 않고 직관적으로 메트릭을 시각화합니다.

**기술:** Next.js → AWS SDK v3 → CloudWatch GetMetricData API

### 4.2 제공 카드

#### 카드 1: 시간대별 호출 수

- **메트릭:** `Invocations` 합계
- **그룹:** 분당(1분), 시간당(1시간) 선택 가능
- **필터:** 도구별(Resource 차원)
- **시각화:** 라인 차트 (recharts)

#### 카드 2: 도구별 평균 지연

- **메트릭:** `Latency` 평균값
- **그룹:** Resource 차원
- **통계:** p50, p95, p99 (계산됨)
- **표시:** 막대 차트

#### 카드 3: 에러 현황

- **메트릭:** `UserErrors`, `SystemErrors` 합계
- **필터:** 도구별
- **표시:** 분할 막대 또는 도넛 차트

#### 카드 4: 비용 추정 ★

- **계산:** `Invocations` × 엔진별 단가표
- **표시:** 카드 우상단에 "추정치 ★" 레이블
- **링크:** "정확한 청구액은 AWS Billing 콘솔 참조" (공지)

### 4.3 대시보드 vs CloudWatch 콘솔 비교

| 특성 | 대시보드 (`/observability`) | CloudWatch 콘솔 |
|------|-----|------|
| 접근성 | 로컬 (인터넷 불필요, 인증 불필요) | AWS 콘솔 (VPN/NAT 필요시) |
| 실시간성 | 60초 지연(권장) | 즉시 업데이트 |
| 커스터마이징 | 고정 대시보드 | 자유로운 편집 |
| 로그 상세 조회 | 미지원 (대시보드 → audit 페이지로 이동) | CloudWatch Insights 풀 지원 |
| 권한 | AWS_PROFILE 자격증명 필요 | AWS 콘솔 로그인 필요 |
| 저장 | 없음 (매번 실시간 계산) | 대시보드 저장 가능 |

### 4.4 대시보드 기동 및 설정

#### 사전 준비

```bash
# 1. 환경 변수 설정
cd /home/ubuntu/workspace/websearch-tool-gateway/dashboard
cp .env.example .env.local

# 2. Terraform output 확인
terraform -chdir=../infra/environments/dev output -json | jq '.dashboard_env.value'
# 출력:
# {
#   "NEXT_PUBLIC_REGION": "ap-northeast-2",
#   "NEXT_PUBLIC_GATEWAY_ID": "gateway-abc123",
#   "NEXT_PUBLIC_GATEWAY_URL": "https://gateway.example.com",
#   "NEXT_PUBLIC_COGNITO_DOMAIN": "websearch-gw-dev.auth.ap-northeast-2.amazoncognito.com",
#   "NEXT_PUBLIC_COGNITO_CLIENT_ID": "client-id-xyz"
# }

# 3. .env.local 수정
cat >> .env.local << EOF
NEXT_PUBLIC_REGION=ap-northeast-2
NEXT_PUBLIC_GATEWAY_ID=gateway-abc123
NEXT_PUBLIC_GATEWAY_URL=https://gateway.example.com
NEXT_PUBLIC_COGNITO_DOMAIN=websearch-gw-dev.auth.ap-northeast-2.amazoncognito.com
NEXT_PUBLIC_COGNITO_CLIENT_ID=client-id-xyz
AWS_PROFILE=default
EOF

# 4. 의존성 설치 및 실행
pnpm install
pnpm dev
```

#### 접속

```
http://localhost:3000/login
→ (Cognito 로그인)
→ http://localhost:3000/observability
```

#### 메트릭 새로고침 주기

대시보드의 "Query Interval" 설정 (기본 60초):

```typescript
// dashboard/src/app/observability/page.tsx 내 설정
const METRIC_QUERY_INTERVAL_MS = 60 * 1000; // 60초
```

필요시 수정 후 `pnpm dev` 재시작.

---

## 5. 알람 설정 예시

### 5.1 예시 1: 에러율 급증 알람

**목표:** 5분 이내 에러가 10개 이상 발생 시 알람

**CloudWatch 콘솔 설정:**

```
CloudWatch → Alarms → Create Alarm
```

**설정:**

| 필드 | 값 |
|------|-----|
| **Metric** | `UserErrors` + `SystemErrors` |
| **Statistic** | `Sum` |
| **Period** | `5 Minutes` |
| **Threshold** | `≥ 10` |
| **Datapoints to alarm** | `1` (즉시 트리거) |
| **Notification** | SNS topic (이메일 또는 Slack) |

**Terraform 코드:**

```hcl
# infra/modules/observability/alarms.tf
resource "aws_cloudwatch_metric_alarm" "error_threshold" {
  alarm_name          = "websearch-gw-errors-spike"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "UserErrors"
  namespace           = "AWS/Bedrock-AgentCore"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    Resource = "*"  # 모든 도구
  }
}
```

### 5.2 예시 2: 응답 시간 저하 알람

**목표:** 평균 Latency가 500ms 초과 시 경고

**설정:**

| 필드 | 값 |
|------|-----|
| **Metric** | `Latency` |
| **Statistic** | `Average` |
| **Period** | `5 Minutes` |
| **Threshold** | `> 500` ms |
| **Notification** | SNS topic |

**Terraform:**

```hcl
resource "aws_cloudwatch_metric_alarm" "high_latency" {
  alarm_name          = "websearch-gw-high-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Latency"
  namespace           = "AWS/Bedrock-AgentCore"
  period              = "300"
  statistic           = "Average"
  threshold           = "500"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"
}
```

### 5.3 예시 3: Throttle 발생 알람

**목표:** 서비스 스로틀링(한도 초과)으로 인한 throttle 감지

```hcl
resource "aws_cloudwatch_metric_alarm" "throttled" {
  alarm_name          = "websearch-gw-throttled"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Throttles"
  namespace           = "AWS/Bedrock-AgentCore"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
```

### 5.4 SNS 토픽 설정

```hcl
# infra/modules/observability/main.tf
resource "aws_sns_topic" "alerts" {
  name = "websearch-gw-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "ops-team@company.com"
}

# 선택: Slack 연계
resource "aws_sns_topic_subscription" "alerts_slack" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "https"
  endpoint  = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
}
```

---

## 6. CloudWatch 콘솔에서 보는 법 (상세)

### 6.1 메트릭 대시보드 만들기

**경로:**

```
CloudWatch → Dashboards → Create Dashboard
```

**이름:** `websearch-gw-observability`

**위젯 추가:**

```json
{
  "type": "Metric",
  "properties": {
    "metrics": [
      ["AWS/Bedrock-AgentCore", "Invocations", {"stat": "Sum"}],
      [".", "Latency", {"stat": "Average"}],
      [".", "UserErrors", {"stat": "Sum"}],
      [".", "SystemErrors", {"stat": "Sum"}]
    ],
    "period": 300,
    "stat": "Average",
    "region": "ap-northeast-2",
    "title": "AgentCore Gateway Overview"
  }
}
```

### 6.2 로그 그룹에서 스트림 확인

**경로:**

```
CloudWatch → Logs → Log Groups
→ /aws/vendedlogs/bedrock-agentcore/gateway/{gateway_id}
```

**하위 스트림:** 시간대별로 자동 분할 (예: `2026/05/31/16/`)

**로그 검색:**

- 키워드: "ERROR", "timeout", "400", 도구명 등
- 필터링: @message, @timestamp, trace_id 기준

### 6.3 Insights 쿼리 저장

자주 사용하는 쿼리를 저장:

```
CloudWatch → Logs → Insights
→ (쿼리 작성)
→ Save
```

예:

| 쿼리명 | 쿼리문 |
|--------|--------|
| `tavily_errors_5m` | `fields @timestamp, @message \| filter toolName = "tavily" and status_code >= 400` |
| `top_latency` | `fields toolName, latency_ms \| stats max(latency_ms) by toolName \| sort desc` |
| `token_usage` | `fields toolName, request_body.tokens_used \| stats sum(tokens_used) by toolName` |

---

## 7. 비용 추정 (고려사항)

### 7.1 CloudWatch 비용 요소

| 항목 | 단가 | 예시 |
|------|------|------|
| 메트릭 기록 | $0.30/메트릭/월 | 6개 메트릭 × $0.30 = $1.80/월 |
| 로그 수집 | $0.50/GB | 100GB/월 = $50 |
| 로그 스토리지 | $0.03/GB/월 | 100GB 저장 = $3/월 |
| Insights 쿼리 | $0.005/MB scanned | 1GB 스캔 = $5 |
| 알람 | $0.10/알람/월 | 5개 알람 = $0.50/월 |

**예상 월간 관찰성 비용 (생산 환경):**

```
메트릭:     $2
로그:      $50–100 (트래픽 규모에 따라)
알람:      $1–5
─────────────────
합계:      $53–107/월
```

### 7.2 로그 비용 절감 방법

1. **로그 필터 정책 적용:**
   ```hcl
   resource "aws_cloudwatch_log_resource_policy" "filter_errors_only" {
     policy_name     = "log-filter-errors"
     policy_text     = jsonencode({
       Version = "2012-10-17"
       Statement = [{
         Effect = "Deny"
         Principal = "*"
         Action = "logs:PutLogEvents"
         Resource = "arn:aws:logs:*:*:log-group:/aws/vendedlogs/*"
         Condition = {
           StringNotLike = {
             "logs:logTag/severity" = "ERROR"
           }
         }
       }]
     })
   }
   ```

2. **보관 기간 단축:**
   - 개발: 7일 (자동 삭제)
   - 프로덕션: 90일

3. **샘플링:**
   - DEBUG 레벨은 무시하고 INFO 이상만 저장

### 7.3 Gateway 메트릭 비용이 없는 이유

CloudWatch 메트릭 자체는 거의 비용이 없습니다 ($0.30/메트릭/월 = 무시할 수준).

**그러나 Bedrock 모델 토큰 비용은 별도:**
- Claude 3.5 Sonnet: 입력 $3/백만 토큰, 출력 $15/백만 토큰
- 로그 기반 비용 추정 불가능 → Bedrock 콘솔의 "Usage" 탭에서 직접 확인 필수

---

## 8. 트러블슈팅

각 항목에 대한 상세는 [04-troubleshooting.md](./04-troubleshooting.md)를 참조하세요.

### 8.1 로그가 보이지 않음

**증상:** CloudWatch Logs에 vended log 그룹이 없음

**확인 사항:**
1. Gateway가 실제로 호출되었는가?
   ```bash
   # 대시보드 /audit 페이지 확인
   # 또는 로컬에서 MCP 테스트
   curl -X POST $GATEWAY_URL/tools/list \
     -H "Authorization: Bearer $JWT"
   ```

2. 로그 그룹명이 정확한가?
   ```bash
   terraform -chdir=infra/environments/dev output log_group_name
   ```

### 8.2 메트릭이 0으로만 표시됨

**원인:** 
- 호출이 없거나
- 메트릭 발행 지연 (최대 1분)

**해결:**
- 테스트 호출 생성: `/playground` 페이지에서 쿼리 실행
- 2분 후 다시 확인

### 8.3 Throttles 메트릭이 증가하지 않음

**원인:** 정상입니다. `Throttles`는 AgentCore 서비스 한도를 초과해 요청이 스로틀링될 때만 증가합니다. 일반적인 사용량에서는 0으로 유지됩니다.

**확인:** 부하 테스트로 짧은 시간에 다량의 호출을 보내면 메트릭 동작을 검증할 수 있습니다.

### 8.4 비용이 예상보다 높음

**확인 순서:**
1. 로그 보관 기간이 너무 길지 않은가?
2. 불필요한 쿼리가 많이 실행되지 않는가?
3. 로그 필터 정책이 적용되었는가?

---

## 9. FAQ / 자주 발생하는 문제

**Q: 대시보드와 CloudWatch 콘솔에서 숫자가 다르게 나옵니다.**

A: 다음을 확인하세요:
- 시간대/시간 범위가 동일한가?
- 차원(Dimensions) 필터가 동일한가?
- 통계 함수(Sum/Average/Max)가 동일한가?
- 대시보드는 60초마다 갱신되므로 1-2분의 지연이 발생할 수 있습니다.

**Q: trace_id로 Jaeger나 Datadog에 보낼 수 있나요?**

A: 예. `terraform.tfvars`에서 `enable_otlp_export = true`로 설정하고 `otlp_endpoint`를 지정하면, vended log 스팬이 자동으로 그 백엔드로 전송됩니다. 다만 추가 비용이 발생합니다.

**Q: PII(개인정보)가 로그에 기록되면?**

A: request_body에 사용자 쿼리가 포함되므로 주의가 필요합니다. CloudWatch 로그 필터 정책으로 민감 필드를 마스킹하거나, 로그 보관 기간을 짧게 설정하는 것을 권장합니다.

**Q: CloudWatch Insights에서 매우 오래된 로그(예: 6개월 전)를 조회할 수 있나요?

A: 아니요. CloudWatch Logs의 기본 보관 기간은 무제한이지만, Insights 쿼리는 로그 저장 설정에 따라 결정됩니다. 개발 환경(7일), 프로덕션(90일) 이상 권장.

**Q: 비용 정확히 알려면?**

A: AWS Billing 대시보드 → Cost Explorer에서 필터:
- Service = "CloudWatch"
- 또는 "AWS Bedrock"
월간 비용을 정확히 확인 가능.

**더 알아보기:**
- [04-troubleshooting.md](./04-troubleshooting.md) — 배포/운영 오류 해결
- AWS 공식 문서: [CloudWatch Logs 사용 설명서](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/)
- Bedrock AgentCore: [AWS 콘솔 → Bedrock → Agent Core](https://console.aws.amazon.com/bedrock/)

---

**최종 수정:** 2026-05-31
**버전:** 1.0
