# Windows에서 AgentCore Gateway 연동 설정 가이드

**대상**: AWS 한국 엔터프라이즈 고객의 SA/클라우드 담당자  
**난이도**: 초급~중급 (PowerShell 기본 지식 필요)  
**예상 시간**: 15~20분

---

## 개요

본 문서는 **Windows 환경**에서 Claude Cowork를 AWS Bedrock AgentCore Gateway와 자동으로 연동하도록 설정하는 방법을 단계별로 설명합니다.

**주요 특징:**
- PowerShell 자동화 스크립트로 클릭 한 번에 완료
- Windows 자격증명 관리자로 토큰 안전 저장
- 레지스트리 설정 및 Cowork 설정 파일 자동 병합
- 재인증 불필요 (토큰 자동 갱신)

**참고**: macOS 사용자는 [02-cowork-setup-mac.md](./02-cowork-setup-mac.md)를 참조하세요.

---

## 사전 준비사항

### 1단계: 필수 소프트웨어 확인

다음 프로그램이 설치되어 있는지 확인하세요.

| 프로그램 | 최소 버전 | 확인 방법 |
|---------|---------|---------|
| **PowerShell** | 5.1 이상 | 터미널에서 `$PSVersionTable.PSVersion` 입력 |
| **AWS CLI** | 2.13 이상 (선택) | `aws --version` 입력 |
| **Git Bash** 또는 **WSL** (선택) | 최신 | Terraform 콘솔 출력 값 수동 입력 시 불필요 |

### 2단계: 관리자 권한 확인

레지스트리 설정을 위해 **관리자 권한**이 필요합니다.

**확인 방법:**
1. PowerShell을 마우스 우클릭
2. "관리자로 실행" 선택
3. "사용자 계정 컨트롤" 프롬프트 확인 후 "예" 클릭

### 3단계: Terraform 출력 값 확인

[배포 가이드](./01-deployment-guide.md)에서 `terraform apply` 완료 후, 아래 출력 값을 준비하세요.

```bash
cd infra/environments/dev
terraform output
```

필요한 값 (setup 스크립트가 자동으로 읽습니다):
- **cognito_domain_url**: `https://websearch-gw-xxx.auth.ap-northeast-2.amazoncognito.com` (전체 URL)
- **auth_m2m_client_id**: M2M (Machine-to-Machine) 클라이언트 ID
- **auth_m2m_client_secret**: M2M 클라이언트 시크릿 (`terraform output -raw auth_m2m_client_secret`)
- **auth_m2m_scope**: `agentcore/invoke`
- **gateway_url**: `https://...gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp`
- **region**: `ap-northeast-2` (고정)

**주의**: 반드시 **M2M 클라이언트**(`auth_m2m_client_id`)와 그 시크릿을 사용하세요.
`cognito_client_id`(웹 클라이언트)는 시크릿이 없어 client_credentials 그랜트에 사용할 수 없습니다.

---

## 자동 설정 실행

### 1단계: 터미널 열기 (관리자 모드)

1. 검색창에서 "PowerShell" 검색
2. "Windows PowerShell" 마우스 우클릭 → "관리자로 실행"
3. "사용자 계정 컨트롤" 대화 상자에서 "예" 클릭

### 2단계: 스크립트 위치로 이동

```powershell
cd C:\path\to\websearch-tool-gateway\cowork
```

예를 들어 저장소가 `C:\dev\projects\websearch-tool-gateway`에 있다면:

```powershell
cd C:\dev\projects\websearch-tool-gateway\cowork
```

### 3단계: 실행 정책 임시 변경 (필요 시)

처음 실행 시 PowerShell이 스크립트 실행을 차단할 수 있습니다.

```powershell
# 현재 사용자 정책만 변경 (임시)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

### 4단계: 자동 설정 스크립트 실행

**기본 실행** (대화형 입력):

```powershell
.\setup-windows.ps1
```

**옵션:**

- **강제 재인증** (이전 토큰 무시):
  ```powershell
  .\setup-windows.ps1 -ForceLogin
  ```

- **Gateway URL 직접 지정**:
  ```powershell
  .\setup-windows.ps1 -GatewayUrl "https://bedrock-agentcore-xxx.ap-northeast-2.bedrock.amazonaws.com"
  ```

- **Terraform 디렉토리 지정**:
  ```powershell
  .\setup-windows.ps1 -TfDir "C:\dev\infra\environments\dev"
  ```

### 5단계: 입력 프롬프트 응답

스크립트가 다음을 물을 때 입력합니다 (자동 감지 실패한 경우):

```
[Cyan] Reading Terraform outputs...

Cognito domain (https://xxx.auth.region.amazoncognito.com): 
```

Terraform 출력 값을 그대로 붙여 넣으세요.

#### 입력 예시

```
Cognito domain: https://websearch-gw-abc123.auth.ap-northeast-2.amazoncognito.com
Cognito client ID (M2M credentials): 7abc123def456xyz
Gateway URL (https://gateway.example.com): https://bedrock-agentcore-mygateway.ap-northeast-2.bedrock.amazonaws.com
AWS region (ap-northeast-2): ap-northeast-2
```

### 6단계: 토큰 획득 확인

스크립트가 자동으로 Cognito에 인증하고 토큰을 저장합니다.

```
[Success] Tokens saved to C:\Users\username\.websearch-gw\tokens.json (expires in 3600 seconds)
```

성공 메시지가 나타나면 진행하세요.

### 7단계: 레지스트리 설정 적용

Windows 레지스트리가 자동으로 업데이트됩니다.

```
[Info] Applying registry settings...
[Success] Registry settings applied successfully
```

**사용자 계정 컨트롤** 프롬프트가 나타나면 "예"를 클릭하세요.

### 8단계: 완료 및 Cowork 재시작

스크립트가 완료되면 다음 메시지가 표시됩니다:

```
=== Setup Complete! ===

[Success] Cowork 3P client configured successfully!

Next steps:
  1. If using MDM, deploy the registry file:
     → Located at: C:\Users\username\.websearch-gw\profiles\cowork-3p.reg

  2. Restart Cowork:
     → Close Cowork completely
     → Reopen Cowork

  3. Verify setup:
     → Look for 'AgentCore Gateway' in Customize > Connectors
     → Try a test search query

Configuration stored at:
  → C:\Users\username\.websearch-gw\config.env
  → C:\Users\username\.websearch-gw\tokens.json
  → C:\Users\username\.websearch-gw\agentcore-token.ps1
```

---

## 수동 확인 및 검증

### 저장된 설정 위치 확인

스크립트가 생성한 파일들:

| 파일 | 용도 | 경로 |
|-----|-----|-----|
| `config.env` | 환경 설정 (Cognito/Gateway URL) | `%USERPROFILE%\.websearch-gw\config.env` |
| `tokens.json` | JWT 토큰 (보안 저장) | `%USERPROFILE%\.websearch-gw\tokens.json` |
| `agentcore-token.ps1` | 토큰 갱신 헬퍼 스크립트 | `%USERPROFILE%\.websearch-gw\agentcore-token.ps1` |
| `cowork-3p.reg` | 레지스트리 설정 파일 | `%USERPROFILE%\.websearch-gw\profiles\cowork-3p.reg` |

**확인 방법:**

PowerShell에서:

```powershell
# 설정 파일 확인
Get-ChildItem -Path "$env:USERPROFILE\.websearch-gw"

# 토큰 유효성 확인 (만료 시각)
$token = Get-Content "$env:USERPROFILE\.websearch-gw\tokens.json" | ConvertFrom-Json
$expireTime = Get-Date -UnixTimeSeconds $token.expires_at
Write-Host "Token expires at: $expireTime"
```

### Cowork 재시작

1. **Cowork 완전 종료:**
   - 작업 표시줄에서 Claude Cowork 우클릭
   - "종료" 또는 "끝내기" 선택
   - 또는 작업 관리자에서 강제 종료

2. **Cowork 재시작:**
   - 시작 메뉴에서 "Claude" 검색 또는
   - 앱 메뉴에서 Claude Code 실행

3. **연동 확인:**
   - Cowork 상단 우측 "Customize > Connectors" 클릭
   - "AgentCore Gateway"가 목록에 나타나는지 확인

_(스크린샷: Cowork의 Customize > Connectors 메뉴)_

### 테스트 쿼리 실행

Cowork 내 검색 도구를 사용하여 테스트합니다.

**테스트 쿼리:**
```
AWS Bedrock AgentCore에 대해 검색
```

**예상 결과:**
- 웹 검색 결과 반환 (설정된 검색 엔진 사용)
- 2~5초 내 응답

---

## 고급 설정

### 1. MDM 배포 (엔터프라이즈)

조직의 Mobile Device Management 솔루션을 사용하여 레지스트리 설정 배포:

1. 생성된 레지스트리 파일 위치 확인:
   ```
   C:\Users\<username>\.websearch-gw\profiles\cowork-3p.reg
   ```

2. MDM 관리자에게 파일 전달
3. MDM에서 "PowerShell 스크립트 실행" 또는 "레지스트리 파일 병합" 정책으로 배포

**예: Intune 정책 (PowerShell)**
```powershell
# Intune Remediation Script로 실행
$regPath = "C:\Users\<username>\.websearch-gw\profiles\cowork-3p.reg"
reg import $regPath
```

### 2. 토큰 수동 갱신

토큰 만료 시 수동으로 갱신:

```powershell
# 강제 재인증
.\setup-windows.ps1 -ForceLogin

# 또는 수동으로 토큰 획득
$env:COGNITO_DOMAIN = "https://websearch-gw-xxx.auth.ap-northeast-2.amazoncognito.com"
$env:CLIENT_ID = "7abc123def456xyz"
.\agentcore-token.ps1
```

### 3. 자격증명 관리자 확인

Windows 자격증명 관리자에서 저장된 자격증명 확인:

1. "제어판 > 자격증명 관리자" 열기
2. "Windows 자격증명" 탭 클릭
3. "Claude" 또는 "Bedrock" 항목 확인

_(스크린샷: Windows 자격증명 관리자)_

### 4. Cowork 캐시 초기화

문제 발생 시 Cowork 캐시 초기화:

```powershell
# Cowork 완전 종료 후 실행
$cachePaths = @(
    "$env:APPDATA\Claude-3p\plugin-settings.json",
    "$env:USERPROFILE\.claude\mcp-needs-auth-cache.json",
    "$env:APPDATA\Claude-3p\.credentials.json"
)

foreach ($path in $cachePaths) {
    if (Test-Path $path) {
        Remove-Item $path -Force
        Write-Host "Cleared: $path"
    }
}

# 캐시 초기화 후 Cowork 재시작
```

---

## 설정 파일 상세 설명

### config.env

```bash
COGNITO_DOMAIN="https://websearch-gw-abc123.auth.ap-northeast-2.amazoncognito.com"
CLIENT_ID="7abc123def456xyz"
GATEWAY_URL="https://bedrock-agentcore-mygateway.ap-northeast-2.bedrock.amazonaws.com"
REGION="ap-northeast-2"
```

**용도:** `agentcore-token.ps1` 헬퍼 스크립트가 읽어 토큰 갱신 시 사용

### tokens.json

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": 1717896000,
  "token_type": "Bearer"
}
```

**용도:** Cowork의 헤더 헬퍼가 MCP 요청 시 `Authorization: Bearer <access_token>` 추가

**보안 주의:** 이 파일은 JWT를 포함하므로 보호해야 합니다. 스크립트가 자동으로 권한 제한 설정 (`600` 동등)을 적용합니다.

### cowork-3p.reg

레지스트리 파일 샘플 구조:

```reg
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\SOFTWARE\Policies\Claude]
"InferenceBedrockRegion"="ap-northeast-2"
"ManagedMcpServers"="[{\"url\":\"https://bedrock-agentcore-...\",\"name\":\"AgentCore Gateway\",\"headersHelper\":\"...\\\agentcore-token.ps1\"}]"
```

---

## FAQ / 자주 발생하는 문제

### Q1: "관리자 권한 필요" 오류가 나옵니다.

**원인**: 레지스트리 쓰기 작업에 관리자 권한 필요

**해결책**:
1. PowerShell을 마우스 우클릭
2. "관리자로 실행" 선택
3. 스크립트 재실행

```powershell
# 현재 권한 확인
[System.Security.Principal.WindowsIdentity]::GetCurrent().Owner
# S-1-5-21-... 형태로 반환되면 관리자 아님
```

---

### Q2: "Token exchange failed" 오류

**원인**: Cognito 인증 실패 (M2M Client ID/Secret, scope, 또는 도메인 URL 오류)

**해결책**:
1. Terraform 출력 값 다시 확인 (M2M 클라이언트 + 전체 도메인 URL)
   ```bash
   terraform output auth_m2m_client_id
   terraform output -raw auth_m2m_client_secret
   terraform output cognito_domain_url
   terraform output auth_m2m_scope   # agentcore/invoke
   ```

2. Client ID가 M2M 클라이언트인지 확인
   - AWS Cognito 콘솔 → User Pool → "App client" 확인
   - "M2M"으로 표시되어야 함

3. 강제 재인증 후 올바른 값 입력
   ```powershell
   .\setup-windows.ps1 -ForceLogin
   ```

[더 자세한 문제 해결은 04-troubleshooting.md 참조](./04-troubleshooting.md#cognito-토큰-오류)

---

### Q3: Cowork에 "AgentCore Gateway" 연동이 안 나타납니다.

**원인**: 설정 파일이 Cowork에 읽혀지지 않음

**해결책**:

1. **캐시 초기화:**
   ```powershell
   # Cowork 완전 종료 후
   $cachePaths = @(
       "$env:APPDATA\Claude-3p\plugin-settings.json",
       "$env:USERPROFILE\.claude\mcp-needs-auth-cache.json"
   )
   foreach ($path in $cachePaths) {
       if (Test-Path $path) { Remove-Item $path -Force }
   }
   # Cowork 재시작
   ```

2. **설정 파일 경로 확인:**
   ```powershell
   Get-ChildItem -Path "$env:APPDATA\Claude-3p\configLibrary" -Force
   # 파일이 없으면 스크립트 재실행
   ```

3. **레지스트리 확인:**
   ```powershell
   Get-ItemProperty -Path "HKCU:\SOFTWARE\Policies\Claude" -ErrorAction SilentlyContinue
   # InferenceBedrockRegion 항목이 있는지 확인
   ```

[더 자세한 문제 해결은 04-troubleshooting.md 참조](./04-troubleshooting.md#cowork-연동-확인-실패)

---

### Q4: PowerShell 실행 정책 오류

**오류 메시지:**
```
cannot be loaded because running scripts is disabled on this system
```

**해결책**:

```powershell
# 현재 사용자 정책만 변경 (안전)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

# 확인
Get-ExecutionPolicy -Scope CurrentUser
# RemoteSigned 반환되면 OK
```

**주의**: 시스템 전역 정책은 변경하지 마세요 (보안 위험).

---

### Q5: 토큰 만료 전 자동 갱신이 안 됩니다.

**원인**: `agentcore-token.ps1` 헬퍼가 실행 중이 아니거나 경로가 잘못됨

**확인**:

```powershell
# 헬퍼 스크립트 존재 확인
Test-Path "$env:USERPROFILE\.websearch-gw\agentcore-token.ps1"

# Cowork의 configLibrary에 올바른 경로 저장되었는지 확인
Get-Content "$env:APPDATA\Claude-3p\configLibrary\*.json" | 
  Select-String "headersHelper" -Context 0,0
```

**수동 갱신:**

```powershell
# Cowork 실행 중 터미널에서 수동 실행
.\agentcore-token.ps1

# 또는 전체 설정 재실행
.\setup-windows.ps1 -ForceLogin
```

---

### Q6: "Invalid gateway URL" 오류

**원인**: Gateway URL 형식 오류

**해결책**:

Gateway URL 형식 확인 (반드시 `https://`로 시작):
```
✓ https://bedrock-agentcore-mygateway.ap-northeast-2.bedrock.amazonaws.com
✗ bedrock-agentcore-mygateway.ap-northeast-2.bedrock.amazonaws.com (http:// 누락)
```

Terraform 출력에서 직접 복사:
```bash
terraform output -raw gateway_url
```

---

## 다음 단계

설정 완료 후:

1. **[03-observability.md](./03-observability.md)** — CloudWatch 대시보드에서 검색 로그 모니터링

2. **[04-troubleshooting.md](./04-troubleshooting.md)** — 배포 후 문제 해결

---

## 참고 자료

| 주제 | 문서 |
|-----|-----|
| 전체 배포 | [01-deployment-guide.md](./01-deployment-guide.md) |
| macOS 설정 | [02-cowork-setup-mac.md](./02-cowork-setup-mac.md) |
| 모니터링 | [03-observability.md](./03-observability.md) |
| 문제 해결 | [04-troubleshooting.md](./04-troubleshooting.md) |

**AWS 공식 문서:**
- [AWS Bedrock AgentCore](https://docs.aws.amazon.com/bedrock/latest/userguide/agentcore.html)
- [Claude Cowork MCP 연동](https://docs.anthropic.com/cowork/mcp-integration)
- [Windows PowerShell 실행 정책](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies)

---

**마지막 업데이트**: 2026-05-31  
**버전**: 1.0.0
