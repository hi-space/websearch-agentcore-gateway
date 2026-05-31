# 05. 트러블슈팅 가이드

**대상:** AWS 담당자·SA, 한국 엔터프라이즈 PoC/본격 배포 운영자

본 문서는 websearch-tool-gateway 배포 및 운영 중 자주 발생하는 문제와 해결 방법을 다룹니다. 각 사례마다 원인 진단 방법과 구체적인 명령어를 제시합니다.

---

## 1. JWT 토큰 만료 문제

### 증상

- Claude Cowork에서 검색 도구를 호출할 수 없음
- 대시보드 또는 MCP Inspector에서 `401 Unauthorized` 또는 `Unauthorized authorization header` 오류 발생
- `CloudWatch Logs`에서 다음 오류 확인:
  ```
  "error": "ExpiredTokenException" or "Invalid JWT signature"
  ```

### 원인

AgentCore Gateway는 Cognito JWT 토큰의 유효 기간(기본값 1시간)을 검증합니다. 토큰이 만료되면 모든 MCP 도구 호출이 거부됩니다.

### 해결 방법

#### 1.1 대시보드/로컬 머신에서의 토큰 갱신

**macOS:**
```bash
# ~/.websearch-gw/agentcore-token.sh 가 headersHelper로 자동 등록됨
# Cowork는 도구 호출 시마다 이 스크립트를 실행하여 토큰 갱신
# 만료 60초 전에 자동 갱신됨

# 수동 갱신이 필요하면:
~/.websearch-gw/agentcore-token.sh --force-refresh
```

**Windows:**
```powershell
# ~/.websearch-gw/agentcore-token.ps1 가 등록됨
# 수동 갱신:
& "$env:USERPROFILE\.websearch-gw\agentcore-token.ps1" -ForceRefresh
```

**Next.js 대시보드:**
```bash
cd dashboard
npm run dev  # 또는 pnpm dev

# 로그인 페이지 (/login)에서 Cognito 계정으로 재인증
# 새 JWT가 브라우저 localStorage에 저장됨
```

#### 1.2 API 호출 시 토큰 직접 갱신

토큰이 만료되었거나 수동으로 테스트하려면:

```bash
# 1. Cognito 엔드포인트/자격증명 확인 (전체 도메인 URL + M2M 클라이언트)
COGNITO_DOMAIN=$(terraform output -raw cognito_domain_url)   # https://...amazoncognito.com
CLIENT_ID=$(terraform output -raw auth_m2m_client_id)        # M2M 클라이언트 (web 클라이언트 아님)
CLIENT_SECRET=$(terraform output -raw auth_m2m_client_secret)
SCOPE=$(terraform output -raw auth_m2m_scope)                # agentcore/invoke

# 2. 토큰 요청 (client_id 는 도메인 URL 이 prefix 가 아님에 주의)
TOKEN=$(curl -s -X POST "${COGNITO_DOMAIN}/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&scope=${SCOPE}")

# 3. 응답에서 access_token 추출
JWT=$(echo $TOKEN | jq -r '.access_token')

# 5. 만료 시간 확인
echo $JWT | jq -R 'split(".")[1] | @base64d | fromjson'
```

#### 1.3 Cowork 헤더 헬퍼 스크립트 문제

Cowork가 토큰을 자동 갱신하지 않는 경우:

```bash
# macOS: headersHelper 상태 확인
ls -la ~/.websearch-gw/agentcore-token.sh

# 실행 가능한지 테스트
~/.websearch-gw/agentcore-token.sh --help

# 권한 부여 (필요시)
chmod 755 ~/.websearch-gw/agentcore-token.sh

# Cowork 설정 폴더에서 mobileconfig 프로필 재설치
# /Library/Application Support/Claude-3p/configLibrary 내 설정 파일 확인
defaults read /Library/Preferences/com.anthropic.claude.plist managedMcpServers

# Cowork 재시작
killall -9 Claude  # Cowork 애플리케이션 종료
open -a Claude     # Cowork 재시작
```

**Windows: 헤더 헬퍼 스크립트 문제**

```powershell
# 스크립트 실행 정책 확인
Get-ExecutionPolicy

# 필요시 사용자 수준에서 권한 부여
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Cowork 설정 폴더 확인
$ConfigPath = "$env:APPDATA\Claude-3p\configLibrary"
if (Test-Path $ConfigPath) { Get-ChildItem $ConfigPath }

# Cowork 재시작
Stop-Process -Name claude -Force  # 또는 작업 관리자에서 종료
# 그 후 Claude 애플리케이션 다시 열기
```

---

## 2. MCP 게이트웨이 연결 실패

### 증상

- `Failed to connect to MCP gateway` 또는 `Connection refused`
- 대시보드 `/inspector` 페이지에서 "No tools available"
- Cowork에서 "MCP protocol error"
- `curl` 테스트 시:
  ```
  curl: (7) Failed to connect to gateway.example.com port 443: Connection refused
  ```

### 원인

1. Gateway URL이 잘못됨 (오타, 만료된 엔드포인트)
2. Gateway가 실제로 배포되지 않았거나 중단됨
3. 네트워크/보안 그룹 제약
4. 잘못된 인증 헤더

### 해결 방법

#### 2.1 Gateway 상태 확인

```bash
# 1. Terraform output에서 URL 확인
cd infra/environments/dev
terraform output gateway_url

# 2. HTTPS 엔드포인트에 직접 연결 시도 (JSON-RPC, REST 경로 아님)
GATEWAY_URL=$(terraform output -raw gateway_url)
JWT=$(~/.websearch-gw/agentcore-token.sh --raw)  # --raw: 헤더 JSON이 아닌 토큰만

curl -v -X POST "$GATEWAY_URL" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# 3. 응답 확인
# 성공: 200 OK + tools 배열
# 실패: 401, 403, 502, 504 등
```

#### 2.2 AWS API 수준에서 Gateway 상태 확인

```bash
GATEWAY_ID=$(terraform output -raw gateway_id)
REGION="ap-northeast-2"

# Gateway 존재 여부 확인
aws bedrockagentcore list-gateways \
  --region $REGION \
  --query "gateways[?id=='$GATEWAY_ID']"

# 상태 조회
aws bedrockagentcore get-gateway \
  --gateway-id $GATEWAY_ID \
  --region $REGION \
  --query 'gateway.[status, createdAt, lastModifiedAt]' --output table
```

#### 2.3 보안 그룹/네트워크 확인

Gateway는 **HTTPS (포트 443)** 로만 외부 접근을 허용합니다.

```bash
# 1. Gateway의 보안 그룹 확인
GATEWAY_ARN=$(terraform output -raw gateway_arn)
SG_ID=$(aws ec2 describe-network-interfaces \
  --filters "Name=status,Values=in-use" \
  --query "NetworkInterfaces[?Attachment.InstanceOwnerId=='$GATEWAY_ID'].Groups[0].GroupId" \
  --region ap-northeast-2 --output text)

# 2. Inbound 규칙 확인
aws ec2 describe-security-groups \
  --group-ids $SG_ID \
  --region ap-northeast-2 \
  --query 'SecurityGroups[0].IpPermissions[].[FromPort,ToPort,IpProtocol,IpRanges[0].CidrIp]' \
  --output table

# 3. 443 포트가 열려있는지 확인 (CIDR은 0.0.0.0/0 또는 특정 IP 범위)
```

#### 2.4 대시보드 .env 파일 확인

```bash
cd dashboard

# .env.local 파일 검증
cat > .env.local << EOF
NEXT_PUBLIC_REGION=ap-northeast-2
NEXT_PUBLIC_GATEWAY_ID=$(terraform -chdir=../infra/environments/dev output -raw gateway_id)
NEXT_PUBLIC_GATEWAY_URL=$(terraform -chdir=../infra/environments/dev output -raw gateway_url)
NEXT_PUBLIC_COGNITO_DOMAIN=$(terraform -chdir=../infra/environments/dev output -raw cognito_domain)
NEXT_PUBLIC_COGNITO_CLIENT_ID=$(terraform -chdir=../infra/environments/dev output -raw cognito_client_id)
AWS_PROFILE=default
EOF

# 대시보드 재시작
npm run dev
```

---

## 3. Lambda 도구 호출 권한 오류

### 증상

- 특정 검색 엔진(Serper, Exa, Perplexity 등)이 "Tool not found" 또는 "Access Denied"
- CloudWatch Logs에서:
  ```
  "error": "User: arn:aws:iam::...:role/... is not authorized to perform: lambda:InvokeFunction on resource: arn:aws:lambda:..."
  ```

### 원인

Gateway의 IAM 역할에 Lambda 함수 호출 권한이 없거나, Lambda 함수가 비활성화되었을 수 있습니다.

### 해결 방법

#### 3.1 Gateway IAM 역할 확인

```bash
# 1. Gateway 역할 조회
GATEWAY_ID=$(terraform output -raw gateway_id)
ROLE_ARN=$(aws bedrockagentcore get-gateway \
  --gateway-id $GATEWAY_ID \
  --region ap-northeast-2 \
  --query 'gateway.serviceRoleArn' --output text)

# 2. 역할 정책 조회
ROLE_NAME=$(echo $ROLE_ARN | cut -d'/' -f2)
aws iam list-role-policies --role-name $ROLE_NAME --output table

# 3. Lambda 호출 권한 정책 확인
aws iam get-role-policy \
  --role-name $ROLE_NAME \
  --policy-name "allow-lambda-invoke" \
  --query 'RolePolicyDocument.Statement[]' --output json | jq '.[]|select(.Effect=="Allow" and .Action | contains("lambda:InvokeFunction"))'
```

#### 3.2 Lambda 함수 상태 확인

```bash
# 1. 배포된 Lambda 함수 목록
for engine in serper exa perplexity duckduckgo; do
  aws lambda get-function \
    --function-name "websearch-gw-dev-${engine}" \
    --region ap-northeast-2 \
    --query 'Configuration.[FunctionName, State, LastUpdateStatus]' \
    --output table
done

# 2. 특정 함수 실행 권한 정책 확인
aws lambda get-policy \
  --function-name "websearch-gw-dev-serper" \
  --region ap-northeast-2 \
  --output json | jq '.Policy | fromjson'
```

#### 3.3 IAM 정책 수정 (필요시)

Terraform 설정에서 누락된 엔진이 있다면:

```bash
# 1. terraform.tfvars 확인
cat infra/environments/dev/terraform.tfvars

# 2. 원하는 엔진 활성화
# enable_serper = true
# serper_api_key = "your-key-here"

# 3. 변경 사항 적용
cd infra/environments/dev
terraform plan    # 변경 사항 검토
terraform apply   # 적용
```

#### 3.4 Lambda 함수 직접 호출 테스트

```bash
# 테스트 payload
PAYLOAD=$(cat <<'EOF'
{
  "query": "AWS bedrock",
  "num_results": 5,
  "country": "KR"
}
EOF
)

# 동기 호출
aws lambda invoke \
  --function-name "websearch-gw-dev-serper" \
  --region ap-northeast-2 \
  --payload "$PAYLOAD" \
  /tmp/lambda-response.json

# 응답 확인
cat /tmp/lambda-response.json | jq .
```

---

## 4. Identity Provider API 키 누락

### 증상

- MCP Inspector에서 도구 목록에는 나타나지만 호출 시 오류:
  ```
  "error": "GetResourceApiKey failed: credential provider not initialized"
  ```
- CloudWatch Logs:
  ```
  "error": "Unable to retrieve API key from identity provider"
  ```

### 원인

Terraform 적용 후 Identity provider에 실제 API 키가 입력되지 않았거나, 키가 잘못 저장되었습니다.

### 해결 방법

#### 4.1 현재 API 키 상태 확인

```bash
REGION="ap-northeast-2"

# 활성화된 엔진 목록 확인
ENABLED_ENGINES=$(terraform output -json enabled_engines | jq -r '.[]')

# 각 엔진의 Identity provider 확인
for engine in $ENABLED_ENGINES; do
  echo "=== $engine ==="
  
  # Provider ARN 조회
  PROVIDER_ARN=$(terraform output -json identity_provider_arns | jq -r ".\"$engine\"")
  
  # Provider 상태 확인
  aws bedrockagentcore get-api-key-credential_provider \
    --credentialProviderName "$PROVIDER_ARN" \
    --region $REGION 2>/dev/null || echo "Provider not found or empty"
done
```

#### 4.2 API 키 시드 스크립트 실행

Terraform apply 후 API 키를 입력하려면:

```bash
# 1. 스크립트 실행
cd infra
bash scripts/seed-api-keys.sh

# 2. 대화형 입력
# 각 엔진별로 API 키 입력 프롬프트 표시

# 또는 환경 변수로 제공
TAVILY_API_KEY="tvly-..." \
SERPER_API_KEY="..." \
bash scripts/seed-api-keys.sh
```

#### 4.3 AWS CLI로 수동 입력

```bash
REGION="ap-northeast-2"
WORKLOAD_TOKEN=$(cat ~/.websearch-gw/tokens.json | jq -r '.workload_identity_token // empty')

# Tavily 키 입력 예시
TAVILY_ARN=$(terraform output -json identity_provider_arns | jq -r '.tavily')

aws bedrockagentcore create-or-update-api-key \
  --credentialProviderName $TAVILY_ARN \
  --apiKey "tvly-..." \
  --region $REGION

# 검증
aws bedrockagentcore get-api-key \
  --credentialProviderName $TAVILY_ARN \
  --region $REGION \
  --query 'apiKey' --output text
```

#### 4.4 terraform.tfvars 재확인

```bash
# 1. 파일 내용 확인
cat infra/environments/dev/terraform.tfvars

# 2. 예시 파일 검토
cat infra/environments/dev/terraform.tfvars.example

# 3. enable_* 플래그와 *_api_key 쌍이 일치하는지 확인
# 예: enable_tavily = true 이면 tavily_api_key 가 비어있으면 안 됨

# 4. 변경 후 apply
terraform apply
```

---

## 5. Integration Template (Tavily/Brave) 콘솔 전용 제약

### 증상

- Terraform으로 `aws_bedrockagentcore_gateway_target` 생성 시 다음 오류:
  ```
  Error: Tavily integration template is only available via AWS Console
  ```
- AWS 콘솔에서 "Add tool" 버튼이 있지만 Terraform으로 자동화 불가

### 원인

AWS Bedrock AgentCore의 빌트인 통합 템플릿(Tavily, Brave)은 **콘솔 UI 전용** 기능이며, API/IaC로는 프로비저닝할 수 없습니다.

### 해결 방법 (공식 지원되는 대안)

본 프로젝트는 다음 두 가지 방식으로 대응합니다:

#### 5.1 Hosted MCP Server Target (권장 IaC 방식)

Tavily/Brave는 공식 MCP 서버를 제공하며, 이를 Gateway target으로 등록할 수 있습니다:

```bash
# 1. Hosted Brave MCP 확인
# https://github.com/brave-search/brave-search-mcp

# 2. 업데이트된 terraform.tfvars 에서 활성화 확인
cat infra/environments/dev/terraform.tfvars | grep -E "enable_(tavily|brave)"

# 3. Apply
cd infra/environments/dev
terraform apply

# 4. 결과 확인
terraform output gateway_targets  # MCP server target으로 등록됨
```

#### 5.2 AWS 콘솔 수동 추가 (대안)

IaC를 우회하고 콘솔에서 직접 추가하려면:

1. **AWS 콘솔 이동:**
   - https://console.aws.amazon.com/bedrock/
   - 좌측 메뉴: `Agents & Guardrails` → `Agent Core`
   - Gateway 선택
   - `Tools` 탭 → `Add tool` 버튼

2. **Tavily/Brave 선택 → API 키 입력**

3. **주의:** 콘솔에서 추가한 도구는 Terraform state에 **반영되지 않음** (state drift 발생)

#### 5.3 Lambda Wrapper로 우회 (가능한 경우)

Brave/Tavily API를 Lambda로 래핑하여 Lambda target으로 등록할 수 있습니다:

```bash
# 1. Lambda 함수 생성
# tools/brave/handler.py 또는 tools/tavily/handler.py 작성

# 2. terraform.tfvars 에서 활성화
enable_brave = true
brave_api_key = "..."

# 3. Terraform 변경사항 재적용
terraform apply

# 결과: Lambda target으로 등록됨 (MCP server target 대신)
```

---

## 6. ap-northeast-2 외 리전 시도

### 증상

- Terraform apply 시:
  ```
  Error: Region must be ap-northeast-2 (Seoul) for AgentCore availability.
  ```
- 다른 리전에서 AgentCore API 호출 시 `ResourceNotFoundException`

### 원인

AWS Bedrock AgentCore는 제한된 리전에서만 지원됩니다. 본 프로젝트는 **ap-northeast-2 (Seoul)** 에서만 검증되었습니다.

### 해결 방법

#### 6.1 지원되는 리전 확인

```bash
# 공식 문서 확인
# https://docs.aws.amazon.com/bedrock-agentcore/latest/userguide/what-is-bedrock-agentcore.html

# 또는 AWS CLI로 현재 리전 확인
aws ec2 describe-regions \
  --query 'Regions[?RegionName==`ap-northeast-2`]' \
  --output table
```

#### 6.2 ap-northeast-2 사용으로 수정

```bash
# 1. Terraform 변수 확인
cat infra/environments/dev/terraform.tfvars | grep aws_region

# 2. 변경 필요시
sed -i 's/aws_region = ".*/aws_region = "ap-northeast-2"/g' \
  infra/environments/dev/terraform.tfvars

# 3. AWS CLI 기본 리전 확인
aws configure get region

# 4. 필요시 AWS CLI 리전 설정
aws configure set region ap-northeast-2

# 또는 환경 변수
export AWS_REGION=ap-northeast-2
```

#### 6.3 AWS 계정 및 리전 설정 검증

```bash
# 현재 계정/리전 정보 출력
aws sts get-caller-identity
aws ec2 describe-availability-zones --query 'AvailabilityZones[].RegionName' --region ap-northeast-2

# Bedrock AgentCore 리전 가용성 확인
aws bedrockagentcore list-gateways --region ap-northeast-2 --output table
```

---

## 7. Cowork 설정 문제

### 증상

- setup-mac.sh/setup-windows.ps1 실행 후에도 Cowork에 검색 도구가 나타나지 않음
- `Error: Unable to authenticate via Cognito`
- mobileconfig/레지스트리 설치 실패

### 해결 방법

#### 7.1 Terraform output 확인

```bash
# setup 스크립트가 필요로 하는 값들 확인
cd infra/environments/dev
terraform output -json | jq '{
  cognito_domain,
  cognito_client_id,
  gateway_url,
  region
}'

# 값이 비어있으면 Gateway가 아직 완전히 배포되지 않았음
```

#### 7.2 설정 파일 수동 검증

**macOS:**
```bash
# 설정 저장 위치 확인
cat ~/.websearch-gw/config.env
cat ~/.websearch-gw/tokens.json | jq .

# 헤더 헬퍼 스크립트 테스트
~/.websearch-gw/agentcore-token.sh

# mobileconfig 프로필 설치 상태
system_profiler SPManagedClientStatus | grep -i "claude\|agentcore"
```

**Windows:**
```powershell
# 설정 저장 위치 확인
Get-Content "$env:USERPROFILE\.websearch-gw\config.env"
Get-Content "$env:USERPROFILE\.websearch-gw\tokens.json" | ConvertFrom-Json

# 레지스트리 확인
Get-ItemProperty -Path "HKCU:\SOFTWARE\Policies\Claude" -ErrorAction SilentlyContinue

# Cowork 프로세스 확인
Get-Process -Name claude -ErrorAction SilentlyContinue
```

#### 7.3 Cognito 자격증명 재발급

```bash
# setup 스크립트 재실행 (강제 로그인)
cd cowork

# macOS
./setup-mac.sh --force-login

# Windows
.\setup-windows.ps1 -ForceLogin
```

#### 7.4 Cowork 재시작 및 프로필 재설치

**macOS:**
```bash
# Cowork 완전히 종료
killall -9 Claude

# 설정 라이브러리 재설정
rm -rf "$HOME/Library/Application Support/Claude-3p/configLibrary"

# Cowork 재시작
open -a Claude

# setup 스크립트 재실행
cd cowork
./setup-mac.sh
```

**Windows:**
```powershell
# Cowork 종료
Stop-Process -Name claude -Force

# 설정 폴더 제거
Remove-Item "$env:APPDATA\Claude-3p\configLibrary" -Recurse -Force -ErrorAction SilentlyContinue

# Cowork 재시작 (애플리케이션 메뉴 또는 .exe)

# setup 스크립트 재실행
cd cowork
.\setup-windows.ps1
```

---

## 8. CloudWatch 로그 및 메트릭 확인 방법

### 문제 진단용 로그 조회

#### 8.1 Vended Log 조회

```bash
LOG_GROUP=$(terraform output -raw log_group_name)
REGION="ap-northeast-2"

# 지난 1시간 로그 조회
aws logs tail "$LOG_GROUP" \
  --since 1h \
  --region $REGION \
  --format short

# 특정 trace_id 검색
TRACE_ID="abc123"
aws logs filter-log-events \
  --log-group-name "$LOG_GROUP" \
  --filter-pattern "{$.trace_id = \"$TRACE_ID\"}" \
  --region $REGION \
  --query 'events[].message' --output text
```

#### 8.2 메트릭 조회

```bash
GATEWAY_ID=$(terraform output -raw gateway_id)

# 지난 1시간 호출 수
aws cloudwatch get-metric-statistics \
  --namespace "AWS/Bedrock-AgentCore" \
  --metric-name "Invocations" \
  --dimensions Name=gateway-id,Value=$GATEWAY_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region ap-northeast-2 \
  --output table

# 에러 비율 확인
aws cloudwatch get-metric-statistics \
  --namespace "AWS/Bedrock-AgentCore" \
  --metric-name "UserErrors" \
  --dimensions Name=gateway-id,Value=$GATEWAY_ID \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region ap-northeast-2
```

---

## 9. 대시보드 시작 오류

### 증상

- `pnpm dev` 실행 시 포트 3000 충돌 또는 환경 변수 오류
- `/inspector`, `/observability` 페이지에서 "Failed to fetch tools" 또는 "Unauthorized"

### 해결 방법

#### 9.1 환경 변수 재생성

```bash
cd dashboard

# .env.local 제거 및 재생성
rm .env.local

# Terraform output에서 자동 생성
terraform -chdir=../infra/environments/dev output dashboard_env | \
  jq -r 'to_entries[] | "\(.key)=\(.value)"' > .env.local

# 확인
cat .env.local
```

#### 9.2 포트 변경 또는 종료

```bash
# 포트 3000 사용 프로세스 확인
lsof -i :3000

# 프로세스 종료 (필요시)
kill -9 <PID>

# 다른 포트로 시작
npm run dev -- -p 3001
```

#### 9.3 AWS 자격증명 확인

```bash
# ~/.aws/credentials 확인
cat ~/.aws/credentials

# 또는 환경 변수
echo $AWS_PROFILE
echo $AWS_REGION

# 자격증명 재설정
aws configure
```

---

## 10. FAQ / 자주 발생하는 문제

### Q1: 검색 엔진을 추가하거나 비활성화하고 싶습니다.

**A:** `infra/environments/dev/terraform.tfvars` 파일에서 `enable_<engine>` 플래그를 수정하고 `terraform apply` 를 실행합니다.

```bash
# 예: Serper 활성화
sed -i 's/enable_serper = false/enable_serper = true/' terraform.tfvars
sed -i 's/serper_api_key = ""/serper_api_key = "your-key"/' terraform.tfvars

terraform apply
```

### Q2: Gateway는 배포되었는데 /observer 대시보드에서 메트릭이 안 보입니다.

**A:** 대시보드가 CloudWatch 메트릭을 조회하려면 AWS 자격증명이 필요합니다. AWS CLI 프로필을 확인하세요:

```bash
aws sts get-caller-identity
aws cloudwatch list-metrics --namespace "AWS/Bedrock-AgentCore" --region ap-northeast-2
```

또한 대시보드 .env 파일이 올바른지 확인하세요 (상단 섹션 9.1 참고).

### Q3: Lambda 함수에서 "permission denied" 오류가 발생합니다.

**A:** Identity provider에서 API 키가 제대로 저장되었는지 확인하세요 (섹션 4 참고). 그리고 Lambda 함수의 IAM 역할이 Secrets Manager 접근 권한을 가지고 있는지 확인하세요:

```bash
LAMBDA_ROLE=$(aws lambda get-function-configuration \
  --function-name websearch-gw-dev-serper \
  --query Role --output text | cut -d'/' -f2)

aws iam get-role-policy --role-name $LAMBDA_ROLE --policy-name allow-secrets-access
```

### Q4: Cowork에서 도구가 보이지만 호출하면 타임아웃됩니다.

**A:** 다음을 확인하세요:

1. **JWT 만료:** `~/.websearch-gw/agentcore-token.sh --force-refresh` 실행
2. **Gateway 응답 시간:** CloudWatch 메트릭에서 `TargetExecutionTime` 확인
3. **Lambda 콜드 스타트:** 첫 호출은 지연될 수 있음 (2–3초)
4. **Identity provider 키:** 섹션 4 참고

### Q5: 게이트웨이 접근 제어는 어떻게 확인하나요?

**A:** 이 게이트웨이는 별도의 정책 엔진 없이 CUSTOM_JWT 인증자 + 허용 클라이언트(allowed-clients) 목록으로 접근을 통제합니다. 대시보드의 `/access` 페이지에서 인증자, 허용 클라이언트, 타깃 상태를 확인할 수 있습니다.

---

## 부록: 유용한 명령어 모음

### 빠른 상태 점검 스크립트

```bash
#!/bin/bash
set -euo pipefail

echo "=== WebSearch Tool Gateway 상태 점검 ==="

REGION="ap-northeast-2"
TF_DIR="infra/environments/dev"

# 1. Terraform 상태
echo ""
echo "[1] Terraform 리소스 확인"
cd $TF_DIR
echo "Gateway ID: $(terraform output -raw gateway_id)"
echo "Gateway Status: $(aws bedrockagentcore get-gateway --gateway-id $(terraform output -raw gateway_id) --region $REGION --query 'gateway.status' --output text)"

# 2. Cognito
echo ""
echo "[2] Cognito 상태"
USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
echo "User Pool: $USER_POOL_ID"

# 3. Lambda 함수
echo ""
echo "[3] Lambda 함수 상태"
for func in $(aws lambda list-functions --region $REGION --query 'Functions[?FunctionName|contains(`websearch-gw-dev`)].FunctionName' --output text); do
  STATE=$(aws lambda get-function-configuration --function-name $func --region $REGION --query State --output text)
  echo "  $func: $STATE"
done

# 4. CloudWatch 로그
echo ""
echo "[4] 최근 로그 (10줄)"
LOG_GROUP=$(terraform output -raw log_group_name)
aws logs tail "$LOG_GROUP" --since 30m --region $REGION --max-items 10

echo ""
echo "=== 점검 완료 ==="
```

저장 후 실행:
```bash
bash scripts/health-check.sh
```

---

## 참고 문서

- [01-deployment-guide.md](./01-deployment-guide.md) — 초기 배포 가이드
- [02-cowork-setup-mac.md](./02-cowork-setup-mac.md) — macOS Cowork 설정
- [02-cowork-setup-windows.md](./02-cowork-setup-windows.md) — Windows Cowork 설정
- [03-observability.md](./03-observability.md) — 모니터링 및 로그 조회
- [AWS Bedrock AgentCore 공식 문서](https://docs.aws.amazon.com/bedrock-agentcore/latest/userguide/what-is-bedrock-agentcore.html)
- [AWS CloudWatch Logs 쿼리](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html)

---

**마지막 업데이트:** 2026-05-31  
**버전:** 1.0  
**담당자:** AWS Solutions Architecture
