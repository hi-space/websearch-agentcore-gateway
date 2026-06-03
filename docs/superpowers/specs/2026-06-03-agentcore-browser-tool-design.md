# AgentCore Browser Gateway 도구 설계

- **작성일**: 2026-06-03
- **상태**: 승인됨 (구현 대기)
- **범위**: v1 — 읽기 전용 페이지 가져오기(`browser_fetch`)

## 1. 배경 / 목적

현재 레포는 AgentCore Gateway에 web search 도구들(serper, exa, firecrawl, tavily 등)을
Lambda 타겟 / 외부 MCP 타겟으로 붙여 에이전트에게 `web_search` MCP 도구로 노출한다.

여기에 **AgentCore Browser**를 추가한다. Browser는 에이전트가 실제 웹페이지를 렌더링하고
탐색할 수 있는 관리형 헤드리스 브라우저 샌드박스다. JS 렌더링이 필요한 페이지를 깊이 읽는
용도로, 검색 결과 심화 읽기와 결합된다.

AgentCore Browser는 Gateway에 직접 붙는 primitive가 **아니다**(에이전트가 데이터플레인
API로 직접 연결하는 독립 리소스). 따라서 "Gateway에 노출"하려면 Lambda 도구가 브라우저
세션을 열고 결과를 돌려주는 래퍼가 필요하다 — 이 설계의 핵심.

## 2. 핵심 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| Browser 리소스 | **커스텀 브라우저** (`aws_bedrockagentcore_browser`, terraform) | 레포가 IaC 중심. 네트워크/녹화/실행롤을 IaC로 일관 관리 |
| 브라우저 제어 | **bedrock-agentcore SDK helper + Playwright sync API** | AWS 공식 헬퍼가 SigV4 WebSocket 서명 처리. sync API로 Lambda 이벤트루프 이슈 회피 |
| Lambda 패키징 | playwright **Python 클라이언트만** (Chromium 바이너리 미포함) | `connect_over_cdp`는 원격 브라우저에 연결만 함. 압축 ~15-18MB로 경량 |
| 도구 계약 | 신규 `browser_fetch` 스키마 (web_search와 분리) | 파라미터/반환이 검색과 다름 |
| 네트워크 모드 | `PUBLIC` | 공개 웹 접근. VPC는 후속 |
| 세션 녹화(S3) | **v1 제외** | S3 버킷/IAM 복잡도 제거. 후속 확장 |

## 3. 아키텍처

```
에이전트
  │ MCP: browser_fetch(url, ...)
  ▼
AgentCore Gateway ── "browser" 타겟 (Lambda, inline browser_fetch 스키마)
  │ invoke
  ▼
Lambda (tools/browser/handler.py)
  │ 1. browser_session(region, identifier=BROWSER_ID)   # 커스텀 브라우저 세션 시작
  │ 2. generate_ws_headers() → (ws_url, SigV4 headers)
  │ 3. sync_playwright().chromium.connect_over_cdp(ws_url, headers)
  │ 4. page.goto(url, wait_until); html = page.content()
  │ 5. markdownify(html) → max_chars 절단
  │ 6. 세션 종료 (context manager)
  ▼
AgentCore Browser (관리형 샌드박스, 커스텀 리소스)
  └─ CDP WebSocket으로 Lambda와 통신, 실제 Chromium 실행
```

## 4. 컴포넌트 상세

### 4.1 Browser 리소스 모듈 — `infra/modules/browser/` (신규)

```hcl
resource "aws_bedrockagentcore_browser" "this" {
  name        = "${var.project_name}_${var.environment}_browser"  # [a-zA-Z][a-zA-Z0-9_]{0,47}
  description = "Managed headless browser for ${var.project_name}"

  network_configuration {
    network_mode = "PUBLIC"
  }
  # recording 블록은 v1 미사용

  tags = { Component = "browser" }
}
```

- **입력 변수**: `project_name`, `environment`, `aws_region`
- **출력**: `browser_id`, `browser_arn`
- 이름 규칙: 브라우저 name 패턴은 underscore 허용(`[a-zA-Z][a-zA-Z0-9_]{0,47}`) — 게이트웨이
  타겟 name 규칙(underscore 불가)과 다르므로 주의.

### 4.2 Lambda 도구 — `tools/browser/` (신규)

`handler.py` — 기존 핸들러 패턴(`extract_gateway_input`, try/except, `_shared` 사용)을 따른다.

```python
from playwright.sync_api import sync_playwright
from bedrock_agentcore.tools.browser_client import browser_session
from markdownify import markdownify

BROWSER_ID = os.environ["BROWSER_ID"]
REGION     = os.environ["AWS_REGION"]  # Lambda 런타임 자동 주입

def lambda_handler(event, context):
    start = time.time()
    p = extract_gateway_input(event)
    url = p.get("url")
    wait_until = p.get("wait_until", "networkidle")  # load | networkidle
    max_chars = max(500, min(int(p.get("max_chars", 8000)), 50000))
    if not url:
        return {"url": "", "title": "", "content": "",
                "latency_ms": ..., "error": "Missing required parameter: url"}
    try:
        with browser_session(REGION, identifier=BROWSER_ID) as client:
            ws_url, headers = client.generate_ws_headers()
            with sync_playwright() as pw:
                browser = pw.chromium.connect_over_cdp(ws_url, headers=headers)
                page = browser.contexts[0].pages[0]
                page.goto(url, wait_until=wait_until, timeout=30000)
                title = page.title()
                html = page.content()
                browser.close()
        content = markdownify(html)[:max_chars]
        return {"url": url, "title": title, "content": content,
                "latency_ms": int((time.time()-start)*1000)}
    except Exception as e:
        return {"url": url, "title": "", "content": "",
                "latency_ms": int((time.time()-start)*1000),
                "error": f"Browser fetch error: {e}"}
```

`requirements.txt`:
```
bedrock-agentcore
playwright
markdownify
```
(arm64 manylinux2014 휠로 빌드 — 기존 모듈 build 스크립트 그대로. Chromium 미포함.)

**주의**: playwright sync API는 greenlet C 확장을 쓴다. `--only-binary=:all:` + arm64 휠로
설치되는지 빌드 시 검증 필요(implementation note).

### 4.3 Gateway 타겟 — `infra/modules/gateway/main.tf` (수정)

web_search용 `for_each` 타겟과 **분리된** 전용 타겟을 추가한다(스키마가 다름).

```hcl
resource "aws_bedrockagentcore_gateway_target" "browser" {
  count              = var.browser_tool_arn != "" ? 1 : 0
  gateway_identifier = aws_bedrockagentcore_gateway.this.gateway_id
  name               = "browser"
  description        = "Render a web page in a managed browser and return its text"

  credential_provider_configuration { gateway_iam_role {} }

  target_configuration {
    mcp {
      lambda {
        lambda_arn = var.browser_tool_arn
        tool_schema {
          inline_payload {
            name        = "browser_fetch"
            description = "Render a web page (JS-capable) and return its main text as markdown."
            input_schema {
              type = "object"
              property { name = "url"        type = "string"  description = "Absolute URL to fetch." required = true }
              property { name = "wait_until" type = "string"  description = "When to consider load done: 'load' or 'networkidle' (default)." required = false }
              property { name = "max_chars"  type = "integer" description = "Max characters of returned markdown (500-50000, default 8000)." required = false }
            }
          }
        }
      }
    }
  }
  depends_on = [time_sleep.wait_for_iam_propagation]
}
```

게이트웨이 IAM 롤은 이미 `lambda:InvokeFunction`을 `var.lambda_tool_arns` 값에 대해 허용.
browser Lambda도 invoke되어야 하므로, gateway 모듈의 invoke 권한 리소스 리스트가
`browser_tool_arn`을 **포함**해야 한다. 구현: gateway 모듈 `aws_iam_role_policy.gateway`의
`Resource = values(var.lambda_tool_arns)` 를 `concat(values(var.lambda_tool_arns),
var.browser_tool_arn != "" ? [var.browser_tool_arn] : [])` 로 확장.

### 4.4 Lambda 실행롤 권한 — `infra/modules/gateway-lambda-tool/main.tf` (수정)

browser 도구 Lambda만 추가 권한 필요. 모듈에 옵션 변수 `extra_policy_statements`(또는
`enable_browser_permissions`)를 추가하거나, browser 전용으로 별도 inline policy를 조건부 부여.

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock-agentcore:StartBrowserSession",
    "bedrock-agentcore:StopBrowserSession",
    "bedrock-agentcore:ConnectBrowserAutomationStream",
    "bedrock-agentcore:GetBrowserSession"
  ],
  "Resource": "<browser_arn>"
}
```

구현 시 가장 깔끔한 방식: `gateway-lambda-tool` 모듈에 `browser_arn`(선택) 변수를 추가하고,
값이 있을 때만 위 statement를 붙인다. 기존 도구들은 영향 없음.

### 4.5 배선 — `infra/environments/dev/main.tf` + `variables.tf` (수정)

- `variables.tf`: `variable "enable_browser" { type = bool, default = false }`
- `main.tf`:
  - `module "browser"` 를 `var.enable_browser` 일 때만 생성(`count`).
  - `local.enabled_lambda_tools` 와 별개로 browser Lambda를 `module "browser_tool"`로
    조건부 생성(`gateway-lambda-tool` 모듈 재사용, `browser_arn` 주입, env `BROWSER_ID`).
  - `module.gateway`에 `browser_tool_arn` 전달.
  - gateway 모듈 `lambda_tool_arns`에 browser arn은 **넣지 않고**(스키마가 web_search라서),
    대신 `lambda:InvokeFunction` 권한 리스트에 browser arn을 포함하도록 gateway 모듈 입력 조정.

## 5. 도구 계약 (요약)

```
browser_fetch(
  url: string            # 필수, 절대 URL
  wait_until?: string    # "load" | "networkidle" (기본)
  max_chars?: integer    # 500-50000, 기본 8000
) -> {
  url: string,
  title: string,
  content: string,       # markdown
  latency_ms: integer,
  error?: string
}
```

오류 처리: 기존 핸들러처럼 예외를 잡아 `error` 필드를 채워 반환(throw하지 않음).

## 6. 설정값

- Lambda: timeout **60s**, memory **1024MB**, arm64, python3.12
- 세션 타임아웃: SDK 기본(<15분) 유지 — SigV4 헤더 만료 회피
- 콜드스타트: 세션 시작 ~2-4s + CDP 연결 ~1-2s 감안

## 7. v1 범위 제외 (후속)

- 페이지 스크린샷 + S3 저장
- 세션 녹화(recording → S3)
- VPC 네트워크 모드
- 클릭/폼입력/스크롤 등 인터랙션 액션
- 시스템 브라우저(`aws.browser.v1`) 폴백 옵션

## 8. 검증 계획

- `terraform plan` (dev): `enable_browser=true` 시 browser/lambda/타겟 생성, `false` 시 무생성 확인
- Lambda 단위: `extract_gateway_input` + 파라미터 클램핑 테스트(기존 `tools/tests` 패턴)
- 통합: 배포 후 Gateway MCP로 `browser_fetch` 호출, JS 렌더 페이지에서 markdown 반환 확인
- 패키징: arm64 빌드에서 playwright greenlet 휠 설치 + import 성공 확인
```

