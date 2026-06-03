# AgentCore Browser Gateway 도구 설계

- **작성일**: 2026-06-03
- **상태**: 승인됨 (구현 대기)
- **범위**: v1 — 자연어 웹 작업 도구(`browser_task`)

## 1. 배경 / 목적

현재 레포는 AgentCore Gateway에 web search 도구들(serper, exa, firecrawl, tavily 등)을
Lambda 타겟 / 외부 MCP 타겟으로 붙여 에이전트에게 `web_search` MCP 도구로 노출한다.

여기에 **AgentCore Browser**를 추가한다. Browser는 에이전트가 실제 웹페이지를 렌더링하고
탐색·클릭·추출할 수 있는 관리형 헤드리스 브라우저 샌드박스다.

AgentCore Browser는 Gateway에 직접 붙는 primitive가 **아니다**(데이터플레인 API로 직접
연결하는 독립 리소스). 따라서 "Gateway에 노출"하려면 Lambda 도구가 브라우저 세션을 열고
작업을 수행한 뒤 결과를 돌려주는 래퍼가 필요하다 — 이 설계의 핵심.

## 2. 핵심 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| Browser 리소스 | **커스텀 브라우저** (`aws_bedrockagentcore_browser`, terraform) | 레포가 IaC 중심. 네트워크/실행롤을 IaC로 일관 관리. (공식 샘플은 기본 `aws.browser.v1`을 쓰지만, 본 레포는 IaC 일관성을 우선) |
| 제어 프레임워크 | **browser-use + Bedrock LLM** (공식 샘플 방식) | AWS 공식 browser 샘플의 표준 경로. LLM이 멀티스텝 웹 작업을 자율 수행 |
| 도구 성격 | **자연어 작업 도구 `browser_task(task)`** | browser-use는 자연어 task를 받아 클릭/탐색을 스스로 결정. 단순 fetch가 아닌 멀티스텝 작업 지원 |
| Lambda 내 LLM | **ChatAnthropicBedrock** (Claude Haiku 4.5) | Lambda 실행롤에 `bedrock:InvokeModel` 필요. 도구 안에 LLM이 한 번 더 도는 중첩 구조 |
| 인증 헤더 | browser-use `BrowserProfile(headers=...)` | 최신 browser-use는 헤더를 CDPClient에 네이티브 전달(패치 불필요 가능). 구버전만 patch 필요 |
| 네트워크 모드 | `PUBLIC` | 공개 웹 접근. VPC는 후속 |
| 세션 녹화(S3) | **v1 제외** | S3 버킷/IAM 복잡도 제거. 후속 확장 |

### 중요한 함의 (정직한 트레이드오프)

- **중첩 LLM 구조**: Gateway 위의 에이전트(LLM)가 `browser_task`를 호출하면, Lambda 안에서
  browser-use가 **또 다른 Bedrock LLM**을 돌린다. 단순 페이지 읽기엔 과하지만, "사이트에서
  X를 찾아 정리" 같은 멀티스텝 작업엔 강력하다.
- **비용/지연**: Lambda 실행 중 Bedrock 모델 호출 비용 + 멀티스텝 루프로 지연이 길다
  (수십 초 가능). Lambda timeout/메모리를 넉넉히 잡고, 세션 timeout < 15분(SigV4 만료) 유지.
- **권한 확장**: Lambda 실행롤에 `bedrock:InvokeModel`(Claude 모델 ARN) 추가 필요.

## 3. 아키텍처

```
에이전트 (Gateway 위 LLM)
  │ MCP: browser_task(task, ...)
  ▼
AgentCore Gateway ── "browser" 타겟 (Lambda, inline browser_task 스키마)
  │ invoke
  ▼
Lambda (tools/browser/handler.py)
  │ 1. BrowserClient(region).start(identifier=BROWSER_ID)   # 커스텀 브라우저 세션
  │ 2. ws_url, headers = client.generate_ws_headers()        # SigV4 서명 헤더
  │ 3. BrowserProfile(headers=headers, timeout=...) + Browser(cdp_url=ws_url)
  │ 4. Agent(task=task, llm=ChatAnthropicBedrock(...), browser_session=...).run()
  │ 5. 결과 텍스트 수집 → 반환
  │ 6. client.stop()  (finally)
  ▼
AgentCore Browser (관리형 Chromium 샌드박스, 커스텀 리소스)
  └─ CDP WebSocket으로 Lambda와 통신, browser-use가 단계별 액션 수행
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

`handler.py` — 기존 핸들러 패턴(`extract_gateway_input`, try/except, 일관된 반환 dict)을 따른다.
공식 browser-use 샘플(`getting_started.py`)의 흐름을 Lambda에 맞게 이식한다.

```python
import asyncio, os, time
from boto3.session import Session
from browser_use import Agent, Browser, BrowserProfile
from browser_use.llm import ChatAnthropicBedrock
from bedrock_agentcore.tools.browser_client import BrowserClient

BROWSER_ID = os.environ["BROWSER_ID"]
MODEL_ID   = os.environ.get("BEDROCK_MODEL_ID",
                            "global.anthropic.claude-haiku-4-5-20251001-v1:0")

def extract_gateway_input(event):
    if "input" in event and isinstance(event["input"], dict):
        return event["input"]
    return event

async def _run(task, max_steps, region):
    client = BrowserClient(region)
    client.start(identifier=BROWSER_ID)            # 커스텀 브라우저
    ws_url, headers = client.generate_ws_headers()
    browser_session = None
    try:
        profile = BrowserProfile(headers=headers, timeout=150000)
        browser_session = Browser(cdp_url=ws_url, browser_profile=profile, keep_alive=True)
        await browser_session.start()
        llm = ChatAnthropicBedrock(model=MODEL_ID, aws_region=region)
        agent = Agent(task=task, llm=llm, browser_session=browser_session)
        history = await agent.run(max_steps=max_steps)
        return history.final_result()              # browser-use 최종 결과 텍스트
    finally:
        if browser_session:
            await browser_session.close()
        client.stop()

def lambda_handler(event, context):
    start = time.time()
    p = extract_gateway_input(event)
    task = p.get("task")
    max_steps = max(1, min(int(p.get("max_steps", 15)), 50))
    region = Session().region_name or os.environ["AWS_REGION"]
    if not task:
        return {"task": "", "result": "", "latency_ms": int((time.time()-start)*1000),
                "error": "Missing required parameter: task"}
    try:
        result = asyncio.run(_run(task, max_steps, region))
        return {"task": task, "result": result,
                "latency_ms": int((time.time()-start)*1000)}
    except Exception as e:
        return {"task": task, "result": "",
                "latency_ms": int((time.time()-start)*1000),
                "error": f"Browser task error: {e}"}
```

**async 결정**: browser-use는 async API다. 공식 샘플도 `asyncio.run(main_async(...))`를
쓴다. Lambda에서 `asyncio.run()`을 핸들러에서 호출하면 매 invocation마다 새 이벤트루프가
생성되므로 안전하다. (Playwright sync 래퍼는 browser-use 경로엔 불필요.)

`requirements.txt`:
```
bedrock-agentcore
browser-use
playwright>=1.40.0
boto3
```
빌드 시 주의:
- arm64 manylinux2014 휠로 설치(기존 build 스크립트). **Chromium 바이너리는 미포함**
  (`connect_over_cdp`로 원격 연결).
- browser-use 의존성 트리가 크다(playwright, pydantic 등). Lambda 250MB(uncompressed)
  한계 내인지 빌드 시 검증. 초과 시 Lambda Layer 또는 컨테이너 이미지 패키징으로 전환.
- browser-use 버전이 `BrowserProfile(headers=...)`를 CDPClient에 네이티브 전달하는지 확인.
  미지원 구버전이면 `patch_browser_use.py`에 해당하는 빌드 후처리 필요 → **최신 버전 핀**으로
  네이티브 지원 버전 고정하는 것을 우선.

### 4.3 Gateway 타겟 — `infra/modules/gateway/main.tf` (수정)

web_search용 `for_each` 타겟과 **분리된** 전용 타겟을 추가한다(스키마가 다름).

```hcl
resource "aws_bedrockagentcore_gateway_target" "browser" {
  count              = var.browser_tool_arn != "" ? 1 : 0
  gateway_identifier = aws_bedrockagentcore_gateway.this.gateway_id
  name               = "browser"
  description        = "Perform a natural-language web task in a managed browser"

  credential_provider_configuration { gateway_iam_role {} }

  target_configuration {
    mcp {
      lambda {
        lambda_arn = var.browser_tool_arn
        tool_schema {
          inline_payload {
            name        = "browser_task"
            description = "Drive a managed headless browser to perform a natural-language web task (navigate, click, read) and return the result."
            input_schema {
              type = "object"
              property { name = "task"      type = "string"  description = "Natural-language description of the web task to perform." required = true }
              property { name = "max_steps" type = "integer" description = "Max agent steps (1-50, default 15)." required = false }
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
`browser_tool_arn`을 **포함**해야 한다. 구현: `aws_iam_role_policy.gateway`의
`Resource = values(var.lambda_tool_arns)` 를 `concat(values(var.lambda_tool_arns),
var.browser_tool_arn != "" ? [var.browser_tool_arn] : [])` 로 확장.

### 4.4 Lambda 실행롤 권한 — `infra/modules/gateway-lambda-tool/main.tf` (수정)

browser 도구 Lambda만 추가 권한 필요. 모듈에 옵션 변수 `browser_arn`(선택)을 추가하고,
값이 있을 때만 아래 statement들을 inline policy로 부여(기존 도구들은 영향 없음).

```json
[
  {
    "Effect": "Allow",
    "Action": [
      "bedrock-agentcore:StartBrowserSession",
      "bedrock-agentcore:StopBrowserSession",
      "bedrock-agentcore:ConnectBrowserAutomationStream",
      "bedrock-agentcore:GetBrowserSession"
    ],
    "Resource": "<browser_arn>"
  },
  {
    "Effect": "Allow",
    "Action": ["bedrock:InvokeModel"],
    "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5*"
  }
]
```

> `global.` 프리픽스 추론 모델 ID를 쓰면 cross-region inference profile ARN도 필요할 수
> 있다. 구현 시 실제 모델 ID에 맞는 리소스 ARN(`foundation-model/*` + `inference-profile/*`)을
> 정확히 매핑한다.

### 4.5 배선 — `infra/environments/dev/main.tf` + `variables.tf` (수정)

- `variables.tf`: `variable "enable_browser" { type = bool, default = false }`,
  `variable "browser_model_id" { type = string, default = "global.anthropic.claude-haiku-4-5-20251001-v1:0" }`
- `main.tf`:
  - `module "browser"` 를 `var.enable_browser` 일 때만 생성(`count`).
  - browser Lambda를 `module "browser_tool"`로 조건부 생성(`gateway-lambda-tool` 모듈
    재사용, `browser_arn` 주입, env `BROWSER_ID` = `module.browser.browser_id`,
    `BEDROCK_MODEL_ID` = `var.browser_model_id`). timeout/memory는 아래 6절 값.
  - `module.gateway`에 `browser_tool_arn` 전달.
  - browser arn은 gateway `lambda_tool_arns`(web_search 스키마)에는 넣지 않고, invoke
    권한 리스트에만 포함되도록 gateway 모듈 입력 조정(4.3 참조).

## 5. 도구 계약 (요약)

```
browser_task(
  task: string           # 필수, 자연어 웹 작업
  max_steps?: integer    # 1-50, 기본 15
) -> {
  task: string,
  result: string,        # browser-use 최종 결과 텍스트
  latency_ms: integer,
  error?: string
}
```

오류 처리: 기존 핸들러처럼 예외를 잡아 `error` 필드를 채워 반환(throw하지 않음).

## 6. 설정값

- Lambda: timeout **300s**(멀티스텝 + LLM 루프), memory **2048MB**, arm64, python3.12
- 세션 타임아웃: `BrowserProfile(timeout=150000)` (150s) + SDK 세션 < 15분(SigV4 만료 회피)
- 콜드스타트: 세션 시작 ~2-4s + CDP 연결 + browser-use 초기화. 큰 패키지로 콜드스타트 김.

## 7. v1 범위 제외 (후속)

- 페이지 스크린샷 + S3 저장 / 세션 녹화(recording → S3)
- VPC 네트워크 모드
- 시스템 브라우저(`aws.browser.v1`) 토글
- Live View(실시간 모니터링) 노출
- 도메인 필터링 / 엔터프라이즈 정책

## 8. 검증 계획

- `terraform plan` (dev): `enable_browser=true` 시 browser/lambda/타겟 생성, `false` 시 무생성 확인
- 패키징: arm64 빌드에서 browser-use + playwright 휠 설치 + import 성공, 패키지 크기
  250MB 한계 확인(초과 시 Layer/컨테이너 전환)
- browser-use 버전이 `BrowserProfile(headers=...)`를 CDP에 전달하는지 import 후 확인
- Lambda 단위: `extract_gateway_input` + 파라미터 클램핑 테스트(기존 `tools/tests` 패턴)
- 통합: 배포 후 Gateway MCP로 `browser_task("example.com 열어서 제목 읽기")` 호출,
  결과 텍스트 반환 확인. Bedrock InvokeModel 권한/모델 가용성 확인.
```

