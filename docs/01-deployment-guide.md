# 배포 가이드: WebSearch Tool Gateway

**대상**: AWS 클라우드 인프라 담당자, SA, 엔터프라이즈 고객  
**목적**: AWS 인프라 사전 준비부터 Bedrock AgentCore Gateway 배포 및 API 키 등록까지의 단계별 안내  
**예상 소요 시간**: 30-45분

---

## 1. AWS 사전 준비

### 1.1 필수 AWS 계정 설정

WebSearch Tool Gateway 배포를 위해 다음 사항을 확인하세요.

#### 1.1.1 AWS 계정 및 권한 확인

- **AWS 계정**: 활성 계정 필요
- **로그인**: AWS Management Console에 로그인 (관리자 권한 권장)
- **리전**: **ap-northeast-2 (Seoul)** 로 설정 확인
  - AgentCore는 15개 리전에서만 지원하며, 한국(서울)도 포함
  - Console 우측 상단 리전 드롭다운에서 "서울" 선택

#### 1.1.2 필수 IAM 권한

배포 스크립트를 실행할 IAM 사용자 또는 역할에 다음 권한이 필요합니다:

| 서비스 | 권한 | 용도 |
|--------|------|------|
| **S3** | `s3:CreateBucket`, `s3:PutBucketVersioning` | Terraform 상태 저장소 |
| **DynamoDB** | `dynamodb:CreateTable` | Terraform 상태 잠금 |
| **Bedrock AgentCore** | `bedrock-agentcore:*` | Gateway, Identity 생성 |
| **Lambda** | `lambda:CreateFunction`, `lambda:UpdateFunctionCode` | 검색 도구 Lambda 배포 |
| **Cognito** | `cognito-idp:*` | 사용자 풀, 리소스 서버 생성 |
| **IAM** | `iam:CreateRole`, `iam:PutRolePolicy` | 서비스 역할 생성 |
| **CloudWatch** | `logs:CreateLogGroup` | 로그 그룹 생성 |

일반적으로 **AdministratorAccess** 또는 위 서비스 전체에 대한 권한으로 충분합니다.

### 1.2 Bedrock AgentCore Preview 활성화 확인

AgentCore는 현재 preview 단계이므로 사전에 opt-in해야 합니다.

#### 1.2.1 AWS Console에서 활성화 확인

1. AWS Management Console → **Bedrock** 이동
2. 좌측 메뉴: **Model access** (또는 **Capabilities** → **AgentCore**)
3. **AgentCore** 섹션에서 "Request model access" 확인
4. 요청 후 AWS에서 승인할 때까지 대기 (보통 1-2일)
5. 상태가 "Access granted"로 변경되면 준비 완료

_(스크린샷: Bedrock Model access 페이지에서 AgentCore 활성화 상태)_

#### 1.2.2 AgentCore 권한 확인

AgentCore를 배포할 리전(ap-northeast-2)에서 활성화 여부 재확인.

---

## 2. 로컬 개발 환경 준비

### 2.1 필수 도구 설치

#### 2.1.1 Terraform 1.7 이상

```bash
# macOS (Homebrew)
brew install terraform

# 또는 terraform.io에서 직접 다운로드
# https://www.terraform.io/downloads.html

# 설치 확인
terraform --version
# Terraform v1.7.x 이상이어야 함
```

#### 2.1.2 AWS CLI v2

```bash
# macOS (Homebrew)
brew install awscli

# 또는 공식 설치 가이드 참고
# https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

# 설치 확인
aws --version
# aws-cli/2.x.x 이상
```

#### 2.1.3 AWS 자격증명 설정

```bash
# AWS 자격증명 구성
aws configure --profile default

# 프롬프트:
# AWS Access Key ID: [Access Key 입력]
# AWS Secret Access Key: [Secret Key 입력]
# Default region name: ap-northeast-2
# Default output format: json
```

또는 `~/.aws/credentials` 파일에 직접 작성:

```ini
[default]
aws_access_key_id = AKIA...
aws_secret_access_key = ...
```

#### 2.1.4 검색 엔진 API 키 준비

배포 전에 사용할 검색 엔진의 API 키를 확보하세요. 다음 표의 필수/선택 여부를 참고하세요.

| 검색 엔진 | 필수 | API 키 발급 |
|----------|------|-----------|
| **Tavily** | 권장 | https://tavily.com (가입 후 Dashboard → API keys) |
| **Brave Search** | 권장 | https://api.search.brave.com |
| **Serper** | 선택 | https://serper.dev (선택 활성화 시 필요) |
| **Exa** | 선택 | https://exa.ai (선택 활성화 시 필요) |
| **DuckDuckGo** | 선택 | 불필요 (공개 API) |
| **Perplexity** | 선택 | https://www.perplexity.ai/api (선택 활성화 시 필요) |

---

## 3. Terraform 설정 작성

### 3.1 terraform.tfvars 생성

WebSearch Tool Gateway 저장소의 infra 디렉토리로 이동합니다.

```bash
cd /path/to/websearch-tool-gateway/infra/environments/dev
```

예제 파일을 바탕으로 실제 설정 파일을 생성합니다.

```bash
cp terraform.tfvars.example terraform.tfvars
```

### 3.2 terraform.tfvars 내용 작성

텍스트 에디터로 `terraform.tfvars` 파일을 열어 다음 항목을 입력하세요.

```hcl
project_name = "websearch-gw"
environment  = "dev"
aws_region   = "ap-northeast-2"

# ============================================================
# 검색 엔진 토글 및 API 키
# ============================================================

# Tavily: 권장 활성화
enable_tavily    = true
tavily_api_key   = "tvly-YOUR_TAVILY_API_KEY_HERE"

# Brave Search: 권장 활성화
enable_brave     = true
brave_api_key    = "YOUR_BRAVE_API_KEY_HERE"

# Serper: 선택 (활성화하지 않으면 빈 문자열 유지)
enable_serper    = false
serper_api_key   = ""

# Exa: 선택
enable_exa       = false
exa_api_key      = ""

# DuckDuckGo: 공개 API이므로 키 불필요
enable_duckduckgo = true

# Perplexity: 선택
enable_perplexity = false
perplexity_api_key = ""

# ============================================================
# 인증 모드
# ============================================================

auth_mode = "cognito"  # 기본값. external_oidc로 변경 가능

# auth_mode = "external_oidc" 인 경우 다음 설정:
# external_oidc_issuer   = "https://your-idp.com"
# external_oidc_audience = "your-audience"

cowork_redirect_uris = ["http://localhost:3000/callback"]

# ============================================================
# Observability (선택)
# ============================================================

enable_otlp_export = false
# OTLP 수집기에 추적을 보내려면 true로 설정하고 엔드포인트 지정
# otlp_endpoint    = "http://localhost:4317"
```

#### 3.2.1 주요 설정 항목 설명

- **project_name**: 프로젝트 식별자. S3 버킷, 리소스 이름에 사용됨
- **aws_region**: 반드시 `ap-northeast-2` (서울)
- **enable_tavily / enable_brave**: 자주 사용하는 2개 엔진. 활성화 권장
- **tavily_api_key**: Tavily에서 발급받은 API 키. 빈 문자열 시 엔진 비활성화
- **auth_mode**: Cognito (기본) 또는 외부 OIDC 제공자

#### 3.2.2 API 키 입력 시 주의

- API 키는 민감한 정보입니다. `terraform.tfvars`를 버전 관리에 포함하지 마세요
- `.gitignore`에 `terraform.tfvars` 추가 (이미 추가된 경우 생략):

```bash
echo "infra/environments/dev/terraform.tfvars" >> .gitignore
```

---

## 4. 인프라 배포

### 4.1 Terraform 상태 저장소 Bootstrap

첫 배포 시 S3 상태 저장소와 DynamoDB 잠금 테이블을 생성합니다.

```bash
cd /path/to/websearch-tool-gateway/infra/scripts
./deploy.sh bootstrap
```

**출력 예시:**

```
==========================================
Web Search Tool Gateway — Terraform Deploy
==========================================
Project: websearch-gw
Region:  ap-northeast-2
Account: 123456789012

Step 1: Creating S3 state bucket and DynamoDB lock table...
[작동 중...]

Backend config:
terraform {
  backend "s3" {
    bucket         = "websearch-gw-tfstate-123456789012-ap-northeast-2"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "websearch-gw-tfstate-lock"
    key            = "dev/terraform.tfstate"
  }
}
```

이 출력을 `infra/environments/dev/backend-config.hcl`에 저장하면 나중에 재사용 가능합니다.

### 4.2 Terraform 초기화

백엔드를 구성합니다.

```bash
./deploy.sh init
```

**출력:**

```
Step 2: Initializing Terraform with backend...
[초기화 중...]
Terraform initialized successfully
```

### 4.3 인프라 변경 사항 검토 (선택사항)

배포 전에 생성될 리소스를 미리 확인하려면:

```bash
./deploy.sh plan
```

출력된 `tfplan` 파일에 리소스 생성 계획이 기록됩니다.

### 4.4 인프라 배포 실행

```bash
./deploy.sh apply
```

**소요 시간**: 약 10-15분

배포 진행 중 다음과 같은 리소스가 생성됩니다:

| 리소스 | 개수 | 설명 |
|--------|------|------|
| **Lambda 함수** | 3-5개 | 검색 엔진별 핸들러 (활성화된 엔진만) |
| **AgentCore Gateway** | 1개 | MCP 프로토콜 엔드포인트 |
| **AgentCore Identity** | 3-5개 | 엔진별 API 키 저장소 |
| **Cognito User Pool** | 1개 | 사용자 인증 |
| **CloudWatch Log Group** | 1개 | 감사 로그 저장소 |
| **IAM 역할 및 정책** | 3-5개 | 서비스 간 권한 |

#### 4.4.1 배포 완료 확인

배포가 완료되면 다음 정보를 터미널에 출력합니다:

```
Infrastructure deployed successfully!

Gateway URL:
https://gateway-abcdef123456.bedrock-agentcore.ap-northeast-2.amazonaws.com

Next steps:
  1. Seed API keys: ./scripts/seed-api-keys.sh
  2. Set up Cowork: cowork/setup-mac.sh or setup-windows.ps1
```

**이 Gateway URL을 복사하여 저장**해 두세요. 이후 단계에서 필요합니다.

### 4.5 배포 출력값 확인

Terraform output에서 대시보드 및 Cowork 설정에 필요한 값들을 확인합니다.

```bash
cd infra/environments/dev
terraform output -json > /tmp/deployment-outputs.json
cat /tmp/deployment-outputs.json | jq .
```

주요 출력값:

- **gateway_id**: `gateway-abcdef123456`
- **gateway_url**: `https://gateway-abcdef123456.bedrock-agentcore.ap-northeast-2.amazonaws.com`
- **cognito_domain**: `websearch-gw-abc123.auth.ap-northeast-2.amazoncognito.com`
- **cognito_client_id**: M2M 클라이언트 ID (Cowork 설정에 사용)
- **enabled_engines**: 활성화된 검색 엔진 목록

---

## 5. API 키 등록 (시드)

Lambda 핸들러와 외부 MCP 서버는 런타임에 AgentCore Identity로부터 API 키를 가져옵니다. `seed-api-keys.sh` 스크립트로 API 키를 등록합니다.

### 5.1 API 키 시딩 실행

```bash
cd /path/to/websearch-tool-gateway/infra/scripts
./seed-api-keys.sh
```

**출력 예시:**

```
==========================================
Seeding API Keys
==========================================
Project: websearch-gw
Region:  ap-northeast-2

Seeding API keys:
  ✓ tavily: Seeded
  ✓ brave: Seeded
  ⚠ serper: No API key (skipped)
  ⚠ exa: No API key (skipped)
  ⚠ duckduckgo: No API key (skipped)
  ⚠ perplexity: No API key (skipped)

API key seeding complete!
```

#### 5.1.1 에러 발생 시

**에러**: `✗ tavily: Failed (provider may not exist)`

- 원인: AgentCore Identity credential provider가 생성되지 않음
- 해결: Terraform apply 단계를 다시 확인하거나, AWS Console에서 AgentCore Gateway 및 Identity를 수동으로 확인

**에러**: `aws: command not found` 또는 AWS CLI 인증 오류

- 원인: AWS CLI 미설치 또는 자격증명 미설정
- 해결: 2.1절 "AWS CLI v2" 및 "AWS 자격증명 설정" 재확인

### 5.2 API 키 검증

API 키가 정상 등록되었는지 확인하려면, AWS CLI로 직접 조회:

```bash
aws bedrock-agentcore-control list-api-key-credential-providers \
  --region ap-northeast-2
```

**출력 예시:**

```json
{
  "providers": [
    {
      "name": "tavily",
      "arn": "arn:aws:bedrock-agentcore:ap-northeast-2:123456789012:identity-provider/...",
      "status": "ACTIVE"
    },
    {
      "name": "brave",
      "arn": "arn:aws:bedrock-agentcore:ap-northeast-2:123456789012:identity-provider/...",
      "status": "ACTIVE"
    }
  ]
}
```

모든 활성화된 엔진에 대해 `"status": "ACTIVE"` 여부 확인.

---

## 6. 배포 검증

### 6.1 Gateway 연결 테스트

Bedrock AgentCore Gateway가 정상 작동하는지 간단히 테스트합니다.

#### 6.1.1 Cognito 토큰 발급

먼저 M2M 클라이언트 자격증명으로 인증 토큰을 얻습니다.

```bash
# 전체 도메인 URL과 M2M 클라이언트(시크릿 보유)를 사용합니다.
COGNITO_DOMAIN="$(terraform output -raw cognito_domain_url)"
CLIENT_ID="$(terraform output -raw auth_m2m_client_id)"
CLIENT_SECRET="$(terraform output -raw auth_m2m_client_secret)"
SCOPE="$(terraform output -raw auth_m2m_scope)"   # agentcore/invoke

# client_id:client_secret 를 base64 인코딩 (개행 제거 필수 — GNU base64는 76자에서 줄바꿈)
BASIC_AUTH=$(printf '%s:%s' "$CLIENT_ID" "$CLIENT_SECRET" | base64 | tr -d '\n')

TOKEN_RESPONSE=$(curl -s -X POST "${COGNITO_DOMAIN}/oauth2/token" \
  -H "Authorization: Basic $BASIC_AUTH" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=${SCOPE}")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

echo "Access Token: $ACCESS_TOKEN"
```

#### 6.1.2 Gateway에 도구 목록 요청

게이트웨이는 **JSON-RPC 2.0** 만 지원합니다. REST 스타일 경로(`$GATEWAY_URL/tools/list`)는
`"Http operation is not supported for gateway protocol type MCP"` 로 거부됩니다.
반드시 `$GATEWAY_URL`(끝의 `/mcp` 포함) 로 JSON-RPC 를 POST 하고, 협상된 프로토콜
버전 헤더를 보내야 합니다.

```bash
GATEWAY_URL="$(terraform output -raw gateway_url)"   # .../mcp 로 끝남

curl -s -X POST "$GATEWAY_URL" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq .
```

**정상 응답 예시:** 도구 이름은 `<engine>___web_search` 형태로 네임스페이스가 붙습니다.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      { "name": "duckduckgo___web_search", "description": "...", "inputSchema": { } },
      { "name": "serper___web_search", "description": "...", "inputSchema": { } },
      { "name": "tavily___tavily_search", "description": "...", "inputSchema": { } }
    ]
  }
}
```

도구 호출은 `{"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}` 형식이며,
결과 페이로드는 `result.content[0].text` 안에 JSON 문자열로 들어 있습니다.
활성화한 모든 검색 엔진이 나타나야 합니다.

### 6.2 Lambda 핸들러 직접 테스트

각 검색 도구별 Lambda 함수를 직접 호출하여 작동 여부 확인:

```bash
# 예: Tavily Lambda 호출
aws lambda invoke \
  --function-name websearch-gw-dev-tavily \
  --region ap-northeast-2 \
  --payload '{"query": "AWS Bedrock AgentCore", "num_results": 3}' \
  response.json

cat response.json | jq .
```

**정상 응답 예시:**

```json
{
  "results": [
    {
      "title": "AWS Bedrock AgentCore Documentation",
      "url": "https://docs.aws.amazon.com/bedrock-agentcore/...",
      "snippet": "AgentCore is a preview feature...",
      "score": 0.95
    }
  ],
  "engine": "tavily",
  "latency_ms": 234
}
```

---

## 7. 다음 단계

배포가 완료되었으므로 다음 단계로 진행하세요:

### 7.1 Cowork 클라이언트 설정

로컬 Mac/Windows 머신에서 Claude Cowork를 AgentCore Gateway에 연결:

- **Mac 사용자**: [02-cowork-setup-mac.md](./02-cowork-setup-mac.md) 참고
- **Windows 사용자**: [02-cowork-setup-windows.md](./02-cowork-setup-windows.md) 참고

### 7.2 대시보드 시작

웹 대시보드에서 검색 도구 통합 상태, 성능 메트릭, 게이트웨이 접근 제어를 확인:

```bash
cd /path/to/websearch-tool-gateway/dashboard
pnpm install
cp .env.example .env.local

# .env.local에 Terraform output 값 입력:
# NEXT_PUBLIC_REGION=ap-northeast-2
# NEXT_PUBLIC_GATEWAY_ID=gateway-abcdef123456
# NEXT_PUBLIC_GATEWAY_URL=https://gateway-abcdef123456.bedrock-agentcore.ap-northeast-2.amazonaws.com
# NEXT_PUBLIC_COGNITO_DOMAIN=websearch-gw-abc123.auth.ap-northeast-2.amazoncognito.com
# NEXT_PUBLIC_COGNITO_CLIENT_ID=<cognito_client_id>

pnpm dev
```

대시보드는 `http://localhost:3000`에서 접근 가능합니다.

### 7.3 모니터링 및 로깅

Gateway 호출, 성능 메트릭, 감사 로그를 CloudWatch에서 확인:

- [03-observability.md](./03-observability.md) 참고

---

## 8. FAQ / 자주 발생하는 문제

### Q: Terraform apply 중 "MissingRegionError" 에러

**A**: AWS_REGION이 ap-northeast-2로 설정되지 않음.

```bash
export AWS_REGION=ap-northeast-2
./deploy.sh apply
```

또는 `terraform.tfvars`에서 `aws_region = "ap-northeast-2"` 확인.

### Q: "AgentCore not available in this region"

**A**: Bedrock AgentCore가 해당 리전에서 활성화되지 않음.

1. AWS Console → Bedrock → Model access 확인
2. 리전을 ap-northeast-2 (Seoul)로 변경
3. AgentCore access 요청 및 승인 대기

### Q: Seed API keys 실행 후 "provider may not exist" 에러

**A**: Identity credential provider가 생성되지 않았을 가능성.

1. Terraform apply 로그 재확인
2. AWS Console → Bedrock → AgentCore → Identity providers 확인
3. 필요시 `terraform destroy` 후 재배포

### Q: Gateway URL을 얻지 못함

**A**: Terraform output 직접 조회:

```bash
cd infra/environments/dev
terraform output gateway_url
```

### 추가 문제 해결

더 자세한 문제 해결 방법은 [04-troubleshooting.md](./04-troubleshooting.md) 참고.

---

## 9. 배포 완료 체크리스트

배포 완료 후 다음을 확인하세요:

- [ ] AWS 계정에서 ap-northeast-2 (Seoul) 리전 선택
- [ ] Bedrock AgentCore preview 활성화 (Model access에서 "Access granted")
- [ ] Terraform 1.7 이상, AWS CLI v2 설치
- [ ] AWS 자격증명 설정 (aws configure)
- [ ] 검색 엔진 API 키 확보
- [ ] terraform.tfvars 파일 작성 및 API 키 입력
- [ ] `./scripts/deploy.sh bootstrap` 실행 완료
- [ ] `./scripts/deploy.sh init` 실행 완료
- [ ] `./scripts/deploy.sh apply` 실행 완료
- [ ] Gateway URL 획득 및 저장
- [ ] `./scripts/seed-api-keys.sh` 실행 완료
- [ ] 검색 엔진별 상태 확인 (status = ACTIVE)
- [ ] Cognito 토큰 발급 테스트 성공
- [ ] Gateway `tools/list` 호출 성공
- [ ] 각 검색 엔진 Lambda 함수 테스트 성공

모두 완료되었다면 배포가 성공적으로 완료된 것입니다!

---

**다음 가이드**: 
- Mac 사용자: [02-cowork-setup-mac.md](./02-cowork-setup-mac.md)
- Windows 사용자: [02-cowork-setup-windows.md](./02-cowork-setup-windows.md)
