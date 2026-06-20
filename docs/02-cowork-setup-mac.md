# macOS에서 Claude Cowork를 AgentCore 게이트웨이와 연동하기

**대상:** 엔터프라이즈 AWS 담당자 / SA  
**목표:** macOS에서 Claude Cowork를 Bedrock 모드로 전환하고, 본 웹 검색 게이트웨이를 `managedMcpServers`에 등록

---

## 개요

Claude Cowork를 AWS Bedrock 추론 엔진으로 전환하면 빌트인 `web_search` 도구가 동작하지 않습니다. 본 가이드는 **AgentCore Gateway**를 MCP(Model Context Protocol) 서버로 등록해 Cowork 내에서 다중 검색 엔진(Tavily, Brave, Serper, DuckDuckGo 등)을 사용할 수 있게 설정하는 방법을 단계별로 설명합니다.

자동 설정 스크립트(`setup-mac.sh`)가 다음을 자동 처리합니다:

1. Terraform 출력에서 Gateway URL과 Cognito 자격증명 수집
2. Cognito M2M(Machine-to-Machine) 클라이언트 인증으로 JWT 토큰 획득
3. JWT 갱신 헬퍼 스크립트 설치
4. macOS 관리 프로필(mobileconfig) 생성 및 적용
5. Cowork 설정 라이브러리에 `managedMcpServers` 항목 추가

---

## 사전 준비

### 1. 인프라 배포 완료
- `01-deployment-guide.md`에 따라 **인프라 배포(`terraform apply`)를 완료**해야 합니다.
- 배포 후 다음 정보가 준비되어야 합니다:
  - **Gateway URL** (예: `https://gateway-abc123.bedrock-agentcore.us-east-1.amazonaws.com`)
  - **Cognito 도메인** (예: `https://websearch-gw-dev.auth.us-east-1.amazoncognito.com`)
  - **M2M 클라이언트 ID** (Terraform output `auth_m2m_client_id` 또는 Cognito 콘솔에서 확인)

### 2. macOS 환경
- **macOS 10.13 이상** (zsh 쉘 필수)
- **curl** 및 **python3** 기본 설치 (대부분의 macOS에 사전 설치됨)
- **관리자 권한** (프로필 설치 시 암호 입력 필요)
- **Claude Desktop** 설치 (최신 버전 권장)

### 3. AWS 자격증명 (선택사항)
Terraform 상태를 읽기 위해 `~/.aws/credentials` 또는 `AWS_PROFILE` 환경 변수가 있으면 편리합니다.
없으면 스크립트가 대화형으로 값을 입력받습니다.

---

## 단계별 설정

### 1단계: 저장소 클론 또는 설정 파일 준비

```bash
cd /path/to/websearch-tool-gateway
ls -la cowork/setup-mac.sh
```

스크립트가 `cowork/setup-mac.sh`에 있는지 확인합니다.

### 2단계: 설정 스크립트 실행

#### 기본 실행 (자동 Terraform 읽기)

```bash
./cowork/setup-mac.sh
```

스크립트가 `infra/environments/dev` 디렉터리에서 Terraform 상태를 읽습니다.

#### Gateway URL 수동 지정

Terraform 읽기에 실패하면 다음과 같이 직접 URL을 전달합니다:

```bash
./cowork/setup-mac.sh --gateway-url https://gateway-xxxxx.bedrock-agentcore.us-east-1.amazonaws.com
```

#### 토큰 갱신 강제

기존 토큰이 있어도 새로 로그인하려면:

```bash
./cowork/setup-mac.sh --force-login
```

#### 스크립트 옵션 전체 보기

```bash
./cowork/setup-mac.sh --help
```

### 3단계: 대화형 입력

스크립트 실행 후 다음 정보를 입력합니다 (Terraform 자동 읽기 실패 시만):

```
Cognito domain (https://xxx.auth.region.amazoncognito.com): https://websearch-gw-dev.auth.us-east-1.amazoncognito.com
Cognito client ID (M2M credentials): <M2M 클라이언트 ID 붙여넣기>
Gateway URL (https://gateway.example.com): https://gateway-abc123.bedrock-agentcore.us-east-1.amazonaws.com
AWS region (us-east-1): us-east-1
```

**Cognito 클라이언트 ID 찾기:**
- Terraform output에서: `terraform output -raw auth_m2m_client_id`
- 또는 AWS 콘솔 > Cognito > User Pools > 애플리케이션 클라이언트 메뉴에서 "M2M" 또는 "websearch-gw" 관련 클라이언트 ID 복사

### 4단계: 인증 처리

스크립트가 Cognito M2M 클라이언트 자격증명으로 액세스 토큰을 자동 획득합니다:

```
=== Authenticating with Cognito (M2M Client Credentials) ===
Exchanging client credentials for access token...
Tokens saved to ~/.websearch-gw/tokens.json (expires in 3600 seconds)
```

**토큰은 자동 갱신되지 않습니다.** 이후 "토큰 만료" 문제 섹션을 참조하세요.

### 5단계: mobileconfig 프로필 설치

스크립트가 macOS 관리 프로필(`cowork-3p.mobileconfig`)을 자동 생성하고 시스템 프로필 설치 대화상자를 엽니다:

_(스크린샷: 시스템 프로필 설치 프롬프트 - "설정을 설치하시겠습니까?" 창)_

**[설치] 버튼 클릭** → **관리자 암호 입력** → **프로필 설치 완료 확인**

프로필이 설치되지 않으면 스크립트가 수동 설치 경로를 안내합니다:

```
Manual installation: open ~/.websearch-gw/profiles/cowork-3p.mobileconfig
```

### 6단계: Cowork 재시작

프로필이 적용되려면 Cowork를 완전히 재시작해야 합니다:

```bash
# 방법 1: 메뉴
Cmd+Q (Cowork 종료) → Cmd+Space "Claude" → Enter (재시작)

# 방법 2: 터미널
killall "Claude Desktop"
sleep 2
open /Applications/Claude.app
```

### 7단계: 연동 확인

#### Cowork 내 확인

1. Cowork 창 우측 상단 **설정 아이콘** → **Customize** 메뉴 열기
2. **Connectors** 섹션에서 **"AgentCore Gateway"** 표시 확인

_(스크린샷: Customize > Connectors 메뉴, "AgentCore Gateway" 항목 표시)_

#### 검색 시험

Cowork의 채팅 입력창에 다음과 같은 쿼리를 입력하고 검색 도구 호출 확인:

```
최근 AI 트렌드 검색해줘
```

**예상 동작:**
- Claude가 검색 도구를 호출하고 결과를 답변에 포함
- `/audit` 대시보드에 해당 쿼리 로그 나타남 (다음 섹션 참고)

---

## 주요 파일 및 디렉터리

설정 스크립트가 다음 위치에 파일을 생성합니다:

| 파일 | 설명 |
|---|---|
| `~/.websearch-gw/config.env` | Cognito 도메인, 클라이언트 ID, Gateway URL (민감 정보) |
| `~/.websearch-gw/tokens.json` | JWT 액세스 토큰 및 만료 시간 |
| `~/.websearch-gw/agentcore-token.sh` | 토큰 갱신 헬퍼 (Cowork에서 호출) |
| `~/.websearch-gw/profiles/cowork-3p.mobileconfig` | macOS 관리 프로필 |
| `~/Library/Application Support/Claude-3p/configLibrary/` | Cowork 로컬 설정 (managedMcpServers 포함) |

**권한 설정:**
```bash
ls -la ~/.websearch-gw/
# config.env, tokens.json: 600 (소유자만 읽기/쓰기)
# agentcore-token.sh: 755 (실행 가능)
```

---

## mobileconfig 프로필 검증

스크립트 완료 후 프로필이 제대로 적용되었는지 확인:

### 1. 명령행으로 프로필 확인

```bash
# 설치된 모든 프로필 나열
sudo profiles -L

# 관리 프로필 세부 정보 조회 (Cowork 관련)
sudo profiles -P | grep -A10 "com.anthropic.claudefordesktop"
```

### 2. System Preferences에서 확인

1. **System Preferences** 또는 **System Settings** 열기
2. **General** → **Profiles** (또는 **Privacy & Security** → **Profiles**)
3. **"AgentCore Gateway Configuration"** 또는 **"Claude 3P"** 프로필 확인
4. 프로필 상세 정보에서 다음 필드 존재 확인:
   - `inferenceBedrockRegion`: `us-east-1`
   - `inferenceBedrockGateway`: Gateway URL
   - `managedMcpServers`: AgentCore Gateway 항목

### 3. 프로필 재설치

프로필이 적용되지 않았다면:

```bash
# 기존 프로필 제거
sudo profiles -R -p "com.anthropic.claudefordesktop"

# mobileconfig 수동 설치
open ~/.websearch-gw/profiles/cowork-3p.mobileconfig
# 또는
sudo profilectl install ~/.websearch-gw/profiles/cowork-3p.mobileconfig
```

---

## 토큰 갱신 및 만료 처리

### 자동 갱신 메커니즘

Cowork가 MCP 호출 시 `agentcore-token.sh` 헬퍼를 실행하여 **HTTP `Authorization` 헤더에 Bearer 토큰 주입**:

```bash
# 헬퍼가 자동으로 다음 같은 헤더 생성:
# Authorization: Bearer <액세스_토큰>
cat ~/.websearch-gw/agentcore-token.sh | head -20
```

토큰 만료 시간(기본 1시간)의 **60초 전에 자동 갱신** 시도.

### 토큰 수동 갱신

만료 오류 발생 시 수동으로 갱신:

```bash
./cowork/setup-mac.sh --force-login
```

또는 직접 실행:

```bash
~/.websearch-gw/agentcore-token.sh refresh
```

### 토큰 상태 확인

```bash
# 토큰 내용 확인
cat ~/.websearch-gw/tokens.json

# 만료 시간 (Unix timestamp) 확인
python3 << 'EOF'
import json
import time
with open(os.path.expanduser('~/.websearch-gw/tokens.json')) as f:
    t = json.load(f)
exp = t['expires_at']
now = time.time()
remaining = exp - now
print(f"Expires in {remaining:.0f} seconds ({remaining/3600:.1f} hours)")
EOF
```

---

## 트러블슈팅

### 문제 1: 프로필이 설치되지 않음

**증상:**
```
Profile installation timeout. Install manually or restart System Preferences.
```

**원인 및 해결:**

| 원인 | 해결 방법 |
|---|---|
| mobileconfig 파일 손상 | `rm -rf ~/.websearch-gw/profiles` 후 `setup-mac.sh` 재실행 |
| macOS 신뢰 문제 | System Preferences > General > Profiles에서 수동 확인 및 승인 |
| 관리자 권한 부족 | 관리자 계정으로 로그인 후 재실행 |

### 문제 2: "Authorization: Bearer <token>" 헤더 누락

**증상:**
```
Gateway returns 401 Unauthorized
```

**원인:** `agentcore-token.sh`가 헤더를 올바르게 생성하지 않음

**해결:**
```bash
# 헬퍼 권한 확인
ls -la ~/.websearch-gw/agentcore-token.sh
# -rwxr-xr-x 확인 (755)

# 직접 헤더 생성 테스트
~/.websearch-gw/agentcore-token.sh
# 출력 예: Authorization: Bearer eyJhbGci...

# 권한 재설정
chmod 755 ~/.websearch-gw/agentcore-token.sh
```

### 문제 3: JWT 토큰 만료 (403 Forbidden)

**증상:**
```
Gateway returns 403 Forbidden - Token expired
```

**원인:** JWT 토큰이 1시간 이상 지난 후 자동 갱신 실패

**해결:**
```bash
# 토큰 상태 확인
cat ~/.websearch-gw/tokens.json | jq .expires_at

# 토큰 강제 갱신
./cowork/setup-mac.sh --force-login

# Cowork 재시작
killall "Claude Desktop" && sleep 2 && open /Applications/Claude.app
```

### 문제 4: "AgentCore Gateway" 커넥터가 표시되지 않음

**증상:**
- Customize > Connectors에 "AgentCore Gateway" 없음
- 검색 도구 호출 실패

**원인:** `managedMcpServers` 설정 미적용 또는 캐시 미갱신

**해결:**
```bash
# 1. Cowork 캐시 초기화
rm -rf ~/Library/Application\ Support/Claude-3p/plugin-settings.json
rm -f ~/.claude/mcp-needs-auth-cache.json
find ~/Library/Application\ Support/Claude-3p/ -name ".credentials.json" -delete

# 2. macOS 키체인 자격증명 캐시 삭제
security delete-generic-password -s "Claude Code-credentials" 2>/dev/null || true
security delete-generic-password -s "Claude-credentials" 2>/dev/null || true

# 3. Cowork 재시작
killall "Claude Desktop"
sleep 3
open /Applications/Claude.app
```

### 문제 5: mobileconfig 템플릿 오류

**증상:**
```
ERROR: Template not found: ./cowork/templates/cowork-3p.mobileconfig.tmpl
```

**원인:** 템플릿 파일 누락 또는 저장소 불완전

**해결:**
```bash
# 저장소 구조 확인
tree cowork/
# cowork/
# ├── setup-mac.sh
# ├── setup-windows.ps1
# ├── agentcore-token.sh
# └── templates/
#     ├── cowork-3p.mobileconfig.tmpl
#     └── cowork-3p.reg.tmpl

# 파일 없으면 재클론 또는 다운로드
git clone https://github.com/your-org/websearch-tool-gateway.git
cd websearch-tool-gateway
./cowork/setup-mac.sh
```

---

## 고급 설정 (선택사항)

### 커스텀 Gateway URL 사용

조직 내부 방화벽 또는 로드 밸런서 뒤의 Gateway를 사용하는 경우:

```bash
./cowork/setup-mac.sh --gateway-url https://internal-gateway.your-domain.com
```

### 독립형 토큰 갱신 데몬 (cron)

장시간 Cowork를 실행하며 토큰이 만료되지 않게 보장하려면 crontab에 추가:

```bash
# 30분마다 토큰 갱신 시도
crontab -e

# 다음 줄 추가:
*/30 * * * * ~/.websearch-gw/agentcore-token.sh refresh > /dev/null 2>&1
```

### MDM 배포 (엔터프라이즈)

조직 MDM(Mobile Device Management) 솔루션을 사용 중이면:

1. `~/.websearch-gw/profiles/cowork-3p.mobileconfig` 다운로드
2. MDM 콘솔에 업로드 (Jamf, Intune, Kandji 등)
3. 정책으로 배포

**주의:** 각 사용자마다 Gateway URL과 토큰이 달라질 수 있으므로 템플릿화 필요.

---

## 다음 단계

설정 완료 후:

1. **검색 도구 테스트** — Cowork에서 다양한 쿼리로 검색 확인
2. **모니터링** — AWS CloudWatch 콘솔 또는 `03-observability.md`의 로컬 대시보드로 호출 로그 확인
3. **접근 제어 확인** — 대시보드 `/access` 페이지에서 게이트웨이 인증자와 허용 클라이언트 목록 확인

---

## FAQ / 자주 발생하는 문제

| 문제 | 해결책 |
|---|---|
| 설정 스크립트 권한 오류 | `chmod +x ./cowork/setup-mac.sh` 실행 |
| "No such file: setup-mac.sh" | 올바른 디렉터리(`/path/to/websearch-tool-gateway`)에서 실행 확인 |
| Terraform 자동 읽기 실패 | `--gateway-url` 옵션으로 직접 전달 |
| Gateway 연결 403/401 | 토큰 갱신 시도 (`--force-login`) |
| 프로필 설치 후 Cowork 반영 없음 | Cowork 완전 재시작 필요 (앱 강종 후 재시작) |
| MCP 서버 목록에 Gateway 없음 | 캐시 삭제 후 재시작 (위 "커넥터 미표시" 섹션 참고) |

자세한 내용은 **[04-troubleshooting.md](./04-troubleshooting.md)**를 참조하세요. 여기에는 JWT 갱신 실패, MCP 프로토콜 오류, CloudWatch 로그 분석 등 심화 트러블슈팅이 포함됩니다.

---

## 참고 자료

- **배포 가이드:** [01-deployment-guide.md](./01-deployment-guide.md)
- **Windows 설정:** [02-cowork-setup-windows.md](./02-cowork-setup-windows.md)
- **모니터링 및 관찰성:** [03-observability.md](./03-observability.md)
- **심화 트러블슈팅:** [04-troubleshooting.md](./04-troubleshooting.md)

---

**마지막 업데이트:** 2026년 5월  
**작성:** AWS AI SA Team
