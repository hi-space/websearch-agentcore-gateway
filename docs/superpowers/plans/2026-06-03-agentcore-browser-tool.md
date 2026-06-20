# AgentCore Browser Gateway 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AgentCore Browser를 `browser_task(task, max_steps)` 자연어 웹 작업 도구로 Gateway에 노출한다. Lambda가 커스텀 브라우저 세션을 열고 browser-use + Bedrock LLM으로 작업을 수행해 결과를 반환한다.

**Architecture:** terraform이 커스텀 `aws_bedrockagentcore_browser` 리소스를 띄우고, 기존 `gateway-lambda-tool` 모듈을 재사용해 `tools/browser/handler.py` Lambda를 배포한다. Gateway 모듈은 web_search와 분리된 전용 `browser_task` 인라인 스키마 타겟을 추가한다. 모든 것은 `enable_browser` 토글로 조건부 생성된다.

**Tech Stack:** Terraform (aws provider ~> 6.47, `aws_bedrockagentcore_browser`), Python 3.12 arm64 Lambda, `bedrock-agentcore` SDK, `browser-use`, `playwright` (Chromium 미포함, CDP 원격 연결), Bedrock Claude Haiku 4.5.

---

## File Structure

생성/수정 파일과 책임:

- **Create** `tools/browser/handler.py` — Lambda 핸들러. 입력 파싱/검증(동기, 테스트 가능) + 브라우저 작업 실행(async, 무거운 deps는 lazy import)
- **Create** `tools/browser/requirements.txt` — `bedrock-agentcore`, `browser-use`, `playwright`, `boto3`
- **Create** `tools/browser/__init__.py` — 패키지 마커 (기존 도구 디렉터리와 동일)
- **Modify** `tools/tests/test_handlers.py` — browser 핸들러의 입력 검증/클램핑/에러 경로 단위 테스트 추가
- **Create** `infra/modules/browser/main.tf` `variables.tf` `outputs.tf` — 커스텀 브라우저 리소스 모듈
- **Modify** `infra/modules/gateway-lambda-tool/variables.tf` — 옵션 `browser_arn`, `bedrock_model_arns` 변수 추가
- **Modify** `infra/modules/gateway-lambda-tool/main.tf` — `browser_arn != ""` 일 때 조건부 inline policy(브라우저 세션 + InvokeModel)
- **Modify** `infra/modules/gateway/variables.tf` — `browser_tool_arn` 변수 추가
- **Modify** `infra/modules/gateway/main.tf` — `browser_task` 전용 타겟 + invoke 권한 리소스에 browser arn 포함
- **Modify** `infra/environments/dev/variables.tf` — `enable_browser`, `browser_model_id` 변수
- **Modify** `infra/environments/dev/main.tf` — browser 모듈 + browser_tool 모듈 + gateway 배선
- **Modify** `infra/environments/dev/outputs.tf` — `browser_id` 출력

---

## Task 1: Browser Lambda 핸들러 (입력 검증 계층, TDD)

무거운 의존성(`browser_use`, `playwright`)은 dev/test 환경에 설치돼 있지 않다. 따라서 모듈
최상단에서 import하지 않고, 입력 파싱/검증/에러 반환은 동기 함수로 분리해 **deps 없이**
테스트 가능하게 만든다. 실제 브라우저 실행(`_run`)에서만 lazy import 한다.

**Files:**
- Create: `tools/browser/__init__.py`
- Create: `tools/browser/handler.py`
- Test: `tools/tests/test_handlers.py` (수정)

- [ ] **Step 1: 패키지 마커 생성**

Create `tools/browser/__init__.py` (빈 파일):

```python
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tools/tests/test_handlers.py` 끝에 추가:

```python
class TestBrowserHandler:
    """Test AgentCore Browser task handler (input layer only; heavy deps are lazy-imported)."""

    def test_missing_task(self):
        """Missing 'task' returns an error envelope without invoking the browser."""
        os.environ["BROWSER_ID"] = "test_browser_id"
        from browser.handler import lambda_handler

        result = lambda_handler({}, None)

        assert result["task"] == ""
        assert result["result"] == ""
        assert "error" in result
        assert "latency_ms" in result

    def test_extract_gateway_input_nested(self):
        """Gateway wraps params under 'input'; direct invocation passes them flat."""
        from browser.handler import extract_gateway_input

        assert extract_gateway_input({"input": {"task": "go"}}) == {"task": "go"}
        assert extract_gateway_input({"task": "go"}) == {"task": "go"}

    def test_clamp_max_steps(self):
        """max_steps is clamped to the 1-50 contract range."""
        from browser.handler import clamp_max_steps

        assert clamp_max_steps(0) == 1
        assert clamp_max_steps(15) == 15
        assert clamp_max_steps(999) == 50
        assert clamp_max_steps("7") == 7
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd tools && python -m pytest tests/test_handlers.py::TestBrowserHandler -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'browser'`

- [ ] **Step 4: 핸들러 구현**

Create `tools/browser/handler.py`:

```python
"""AgentCore Browser task handler for Lambda Gateway.

Exposes a single MCP tool, browser_task(task, max_steps), that drives a managed
AgentCore Browser session via the browser-use framework (LLM-in-the-loop) over
CDP. Heavy dependencies (browser_use, playwright) are imported lazily inside
_run so the module — and its input-validation layer — import cleanly in
environments where those packages are absent (e.g. unit tests).
"""

import asyncio
import os
import time
from typing import Any, Dict

DEFAULT_MODEL_ID = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
BROWSER_PROFILE_TIMEOUT_MS = 150000  # 150s per browser-use operation


def extract_gateway_input(event: Dict[str, Any]) -> Dict[str, Any]:
    """Extract params from a Gateway Lambda event or a direct invocation."""
    if "input" in event and isinstance(event["input"], dict):
        return event["input"]
    return event


def clamp_max_steps(value: Any) -> int:
    """Clamp max_steps to the contract range (1-50)."""
    return max(1, min(int(value), 50))


async def _run(task: str, max_steps: int, region: str) -> str:
    """Open a custom browser session and run the task with browser-use.

    Imports browser_use lazily so the module loads without it installed.
    """
    from browser_use import Agent, Browser, BrowserProfile
    from browser_use.llm import ChatAnthropicBedrock
    from bedrock_agentcore.tools.browser_client import BrowserClient

    browser_id = os.environ["BROWSER_ID"]
    model_id = os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID)

    client = BrowserClient(region)
    client.start(identifier=browser_id)
    ws_url, headers = client.generate_ws_headers()

    browser_session = None
    try:
        profile = BrowserProfile(headers=headers, timeout=BROWSER_PROFILE_TIMEOUT_MS)
        browser_session = Browser(cdp_url=ws_url, browser_profile=profile, keep_alive=True)
        await browser_session.start()

        llm = ChatAnthropicBedrock(model=model_id, aws_region=region)
        agent = Agent(task=task, llm=llm, browser_session=browser_session)
        history = await agent.run(max_steps=max_steps)
        return history.final_result() or ""
    finally:
        if browser_session is not None:
            try:
                await browser_session.close()
            except Exception:
                pass
        client.stop()


def lambda_handler(event, context):
    """Lambda entry point for browser_task."""
    start_time = time.time()
    params = extract_gateway_input(event)
    task = params.get("task")
    max_steps = clamp_max_steps(params.get("max_steps", 15))
    region = os.environ.get("AWS_REGION", "us-west-2")

    if not task:
        return {
            "task": "",
            "result": "",
            "latency_ms": int((time.time() - start_time) * 1000),
            "error": "Missing required parameter: task",
        }

    try:
        result = asyncio.run(_run(task, max_steps, region))
        return {
            "task": task,
            "result": result,
            "latency_ms": int((time.time() - start_time) * 1000),
        }
    except Exception as e:
        return {
            "task": task,
            "result": "",
            "latency_ms": int((time.time() - start_time) * 1000),
            "error": f"Browser task error: {str(e)}",
        }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd tools && python -m pytest tests/test_handlers.py::TestBrowserHandler -v`
Expected: PASS (3 tests)

- [ ] **Step 6: 전체 테스트 회귀 확인**

Run: `cd tools && python -m pytest tests/ -q`
Expected: 기존 테스트 + 신규 3개 모두 PASS

- [ ] **Step 7: requirements.txt 생성**

Create `tools/browser/requirements.txt`:

```
bedrock-agentcore
browser-use
playwright>=1.40.0
boto3
```

- [ ] **Step 8: 커밋**

```bash
git add tools/browser/__init__.py tools/browser/handler.py tools/browser/requirements.txt tools/tests/test_handlers.py
git commit -m "feat(browser): add browser_task Lambda handler with lazy-imported browser-use"
```

---

## Task 2: 커스텀 Browser 리소스 모듈

**Files:**
- Create: `infra/modules/browser/variables.tf`
- Create: `infra/modules/browser/main.tf`
- Create: `infra/modules/browser/outputs.tf`

- [ ] **Step 1: variables.tf 생성**

Create `infra/modules/browser/variables.tf`:

```hcl
variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}
```

- [ ] **Step 2: main.tf 생성**

Create `infra/modules/browser/main.tf`:

```hcl
locals {
  # Browser name pattern allows underscores: ^[a-zA-Z][a-zA-Z0-9_]{0,47}$
  browser_name = "${var.project_name}_${var.environment}_browser"
}

resource "aws_bedrockagentcore_browser" "this" {
  name        = local.browser_name
  description = "Managed headless browser for ${var.project_name}"

  network_configuration {
    network_mode = "PUBLIC"
  }

  tags = {
    Component = "browser"
  }
}
```

- [ ] **Step 3: outputs.tf 생성**

Create `infra/modules/browser/outputs.tf`:

```hcl
output "browser_id" {
  value       = aws_bedrockagentcore_browser.this.browser_id
  description = "AgentCore custom Browser ID"
}

output "browser_arn" {
  value       = aws_bedrockagentcore_browser.this.browser_arn
  description = "AgentCore custom Browser ARN"
}
```

- [ ] **Step 4: terraform 검증**

Run: `cd infra/environments/dev && terraform fmt ../../modules/browser/ && terraform validate`
Expected: `Success! The configuration is valid.` (모듈이 아직 호출되지 않아도 fmt/문법은 통과)

> validate가 root module 기준이라 모듈 단독 검증이 어렵다면, 본 모듈 파일만 `terraform fmt -check`로 포맷 확인하고 실제 validate는 Task 5 배선 후 수행한다.

- [ ] **Step 5: 커밋**

```bash
git add infra/modules/browser/
git commit -m "feat(infra): custom AgentCore browser resource module"
```

---

## Task 3: gateway-lambda-tool 모듈에 browser 권한 추가

browser Lambda는 브라우저 세션 + Bedrock InvokeModel 권한이 필요하다. 기존 도구에 영향을
주지 않도록 `browser_arn`이 비어있지 않을 때만 조건부 inline policy를 붙인다.

**Files:**
- Modify: `infra/modules/gateway-lambda-tool/variables.tf`
- Modify: `infra/modules/gateway-lambda-tool/main.tf`

- [ ] **Step 1: 변수 추가**

`infra/modules/gateway-lambda-tool/variables.tf` 끝에 추가:

```hcl
variable "browser_arn" {
  type        = string
  description = "If set, grants this Lambda permission to drive the given AgentCore browser and invoke Bedrock models (used only by the browser tool)."
  default     = ""
}

variable "bedrock_model_arns" {
  type        = list(string)
  description = "Bedrock model/inference-profile ARNs the browser tool may invoke."
  default     = []
}
```

- [ ] **Step 2: 조건부 IAM 정책 추가**

`infra/modules/gateway-lambda-tool/main.tf` 의 `aws_iam_role_policy.bedrock_agentcore`
리소스(라인 87-100) 뒤에 새 리소스 추가:

```hcl
# Browser tool only: drive AgentCore browser sessions + invoke Bedrock models.
# Conditionally created so existing search tools are unaffected.
resource "aws_iam_role_policy" "browser" {
  count = var.browser_arn != "" ? 1 : 0
  name  = "browser"
  role  = aws_iam_role.lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [{
        Effect = "Allow"
        Action = [
          "bedrock-agentcore:StartBrowserSession",
          "bedrock-agentcore:StopBrowserSession",
          "bedrock-agentcore:ConnectBrowserAutomationStream",
          "bedrock-agentcore:GetBrowserSession",
        ]
        Resource = var.browser_arn
      }],
      length(var.bedrock_model_arns) > 0 ? [{
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = var.bedrock_model_arns
      }] : [],
    )
  })
}
```

- [ ] **Step 3: Lambda 함수가 새 정책에 의존하도록 수정**

`infra/modules/gateway-lambda-tool/main.tf` 의 `aws_lambda_function.this` `depends_on`
(라인 138)을 다음으로 교체:

```hcl
  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.logs,
    aws_iam_role_policy.bedrock_agentcore,
    aws_iam_role_policy.browser,
  ]
```

> `count`로 생성되는 `aws_iam_role_policy.browser`는 0개일 때도 `depends_on` 리스트에서 안전하다 (terraform은 빈 인스턴스 집합으로 처리).

- [ ] **Step 4: 포맷/문법 확인**

Run: `cd infra/environments/dev && terraform fmt ../../modules/gateway-lambda-tool/`
Expected: 변경 파일이 포맷됨 (에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add infra/modules/gateway-lambda-tool/
git commit -m "feat(infra): conditional browser+bedrock IAM policy in lambda-tool module"
```

---

## Task 4: Gateway 모듈에 browser_task 타겟 추가

**Files:**
- Modify: `infra/modules/gateway/variables.tf`
- Modify: `infra/modules/gateway/main.tf`

- [ ] **Step 1: 변수 추가**

`infra/modules/gateway/variables.tf` 끝에 추가:

```hcl
variable "browser_tool_arn" {
  type        = string
  description = "Lambda ARN backing the browser_task target. Empty disables the browser target."
  default     = ""
}
```

- [ ] **Step 2: invoke 권한에 browser arn 포함**

`infra/modules/gateway/main.tf` 의 `aws_iam_role_policy.gateway` (라인 29-33) lambda invoke
statement를 다음으로 교체:

```hcl
      length(var.lambda_tool_arns) > 0 || var.browser_tool_arn != "" ? [{
        Effect = "Allow"
        Action = ["lambda:InvokeFunction"]
        Resource = concat(
          values(var.lambda_tool_arns),
          var.browser_tool_arn != "" ? [var.browser_tool_arn] : [],
        )
      }] : [],
```

- [ ] **Step 3: browser_task 타겟 리소스 추가**

`infra/modules/gateway/main.tf` 끝(라인 198 이후)에 추가:

```hcl
# ============================================================
# Browser Gateway Target (AgentCore Browser via browser-use)
# ============================================================
# Distinct from the web_search targets: a natural-language browser_task contract.

resource "aws_bedrockagentcore_gateway_target" "browser" {
  count = var.browser_tool_arn != "" ? 1 : 0

  gateway_identifier = aws_bedrockagentcore_gateway.this.gateway_id
  name               = "browser"
  description        = "Perform a natural-language web task in a managed browser"

  credential_provider_configuration {
    gateway_iam_role {}
  }

  target_configuration {
    mcp {
      lambda {
        lambda_arn = var.browser_tool_arn
        tool_schema {
          inline_payload {
            name        = "browser_task"
            description = "Drive a managed headless browser to perform a natural-language web task (navigate, click, read) and return the result."
            input_schema {
              type        = "object"
              description = "Browser task parameters."
              property {
                name        = "task"
                type        = "string"
                description = "Natural-language description of the web task to perform."
                required    = true
              }
              property {
                name        = "max_steps"
                type        = "integer"
                description = "Maximum agent steps (1-50, default 15)."
                required    = false
              }
            }
          }
        }
      }
    }
  }

  depends_on = [time_sleep.wait_for_iam_propagation]
}
```

- [ ] **Step 4: 포맷 확인**

Run: `cd infra/environments/dev && terraform fmt ../../modules/gateway/`
Expected: 변경 파일 포맷됨

- [ ] **Step 5: 커밋**

```bash
git add infra/modules/gateway/
git commit -m "feat(infra): add browser_task gateway target and invoke permission"
```

---

## Task 5: dev 환경 배선

**Files:**
- Modify: `infra/environments/dev/variables.tf`
- Modify: `infra/environments/dev/main.tf`
- Modify: `infra/environments/dev/outputs.tf`

- [ ] **Step 1: 변수 추가**

`infra/environments/dev/variables.tf` 의 `enable_tavily_lambda` 블록(라인 138 부근) 뒤에 추가:

```hcl
variable "enable_browser" {
  type        = bool
  description = "Enable the AgentCore Browser task tool"
  default     = false
}

variable "browser_model_id" {
  type        = string
  description = "Bedrock model ID that browser-use drives inside the browser tool Lambda"
  default     = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
}
```

- [ ] **Step 2: browser 모듈 + browser_tool 모듈 추가**

`infra/environments/dev/main.tf` 의 `module "gateway_mcp_targets"` 블록(라인 200-210) 뒤,
`module "gateway"` 앞에 추가:

```hcl
# ============================================================
# AgentCore Browser (custom resource) + browser task Lambda
# ============================================================

module "browser" {
  count  = var.enable_browser ? 1 : 0
  source = "../../modules/browser"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
}

module "browser_tool" {
  count  = var.enable_browser ? 1 : 0
  source = "../../modules/gateway-lambda-tool"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  account_id   = local.account_id

  tool_name   = "browser"
  source_root = local.tools_root

  env_vars = {
    BROWSER_ID       = module.browser[0].browser_id
    BEDROCK_MODEL_ID = var.browser_model_id
  }

  browser_arn = module.browser[0].browser_arn
  # browser-use invokes Bedrock for both foundation-model and (for global.* IDs)
  # cross-region inference-profile ARNs; grant both in this account/region.
  bedrock_model_arns = [
    "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5*",
    "arn:aws:bedrock:*:${local.account_id}:inference-profile/*anthropic.claude-haiku-4-5*",
  ]

  # browser-use + playwright is a large/slow dependency tree; give it headroom.
  timeout            = 300
  memory_size        = 2048
  log_retention_days = 7

  depends_on = [module.browser]
}
```

- [ ] **Step 3: gateway 모듈에 browser_tool_arn 전달**

`infra/environments/dev/main.tf` 의 `module "gateway"` 블록에서 `mcp_server_credential_param`
다음 줄(라인 241 부근)에 추가:

```hcl
  browser_tool_arn = var.enable_browser ? module.browser_tool[0].function_arn : ""
```

그리고 같은 블록의 `depends_on`(라인 243)을 다음으로 교체:

```hcl
  depends_on = [module.auth, module.lambda_tools, module.gateway_mcp_targets, module.browser_tool]
```

- [ ] **Step 4: 출력 추가**

`infra/environments/dev/outputs.tf` 끝에 추가:

```hcl
output "browser_id" {
  value       = var.enable_browser ? module.browser[0].browser_id : null
  description = "AgentCore custom Browser ID (null when disabled)"
}
```

- [ ] **Step 5: 비활성 상태 plan 검증 (enable_browser=false)**

Run: `cd infra/environments/dev && terraform fmt && terraform validate`
Expected: `Success! The configuration is valid.`

Run: `terraform plan -var-file=terraform.tfvars 2>&1 | grep -i browser | head`
Expected: browser 관련 리소스가 plan에 **없음** (기본 false). 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add infra/environments/dev/
git commit -m "feat(infra): wire AgentCore browser tool behind enable_browser toggle"
```

---

## Task 6: 활성화 plan 검증 + 패키지 크기 점검

실배포 전, `enable_browser=true`로 plan이 깨끗하게 생성되는지와 Lambda 패키지가 250MB
한계 내인지 확인한다. (실제 apply는 사용자 승인 후 별도 수행)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 활성화 plan 검증**

Run: `cd infra/environments/dev && terraform plan -var-file=terraform.tfvars -var enable_browser=true 2>&1 | tail -40`
Expected: `module.browser`, `module.browser_tool`, `aws_bedrockagentcore_gateway_target.browser` 등이
create 계획에 나타남. 에러 없음.

- [ ] **Step 2: Lambda 패키지 빌드 + 크기 확인**

> 이 단계는 `module.browser_tool`의 `null_resource.build`가 수행하는 것과 동일한 pip 설치를
> 수동 재현해 크기를 본다.

Run:
```bash
cd /home/ubuntu/workspace/search-agentcore-gateway
rm -rf /tmp/browser-build && mkdir -p /tmp/browser-build
pip3 install -q --upgrade --target /tmp/browser-build \
  --platform manylinux2014_aarch64 --python-version 3.12 \
  --only-binary=:all: --implementation cp \
  -r tools/browser/requirements.txt
du -sh /tmp/browser-build
```
Expected: 출력된 크기가 250MB(uncompressed) 미만이면 OK.

- [ ] **Step 3: 크기 초과 시 분기 기록 (조건부)**

250MB를 초과하면 plan을 그대로 진행하지 말고, 다음 중 하나로 후속 작업을 만든다(이 plan에는
구현하지 않고 기록만):
- Lambda **container image** 패키징으로 `gateway-lambda-tool` 모듈 확장, 또는
- 공용 의존성을 **Lambda Layer**로 분리.

크기가 한계 내이면 이 step은 "확인됨"으로 체크하고 넘어간다.

- [ ] **Step 4: browser-use 헤더 전달 버전 확인**

Run:
```bash
python3 -c "import pathlib, importlib.util; \
spec=importlib.util.find_spec('browser_use'); \
print('browser_use found' if spec else 'NOT in current env (OK: checked at build)')" 2>/dev/null || true
grep -RIl "additional_headers" /tmp/browser-build/browser_use/ 2>/dev/null | head
```
Expected: `/tmp/browser-build/browser_use/...`에서 `additional_headers` 사용이 발견되면
`BrowserProfile(headers=...)`가 CDP로 전달됨(패치 불필요). 발견 안 되면 design 4.2의
patch 후처리를 build 스크립트에 추가하는 후속 작업 필요(기록).

- [ ] **Step 5: 빌드 아티팩트 정리**

Run: `rm -rf /tmp/browser-build`
Expected: 정리 완료.

---

## 배포 안내 (apply는 사용자 승인 후)

`enable_browser=true`를 `terraform.tfvars`에 추가하고 사용자 승인 하에 `terraform apply`.
배포 후 통합 검증: Gateway MCP로 `browser_task("example.com을 열어 페이지 제목을 알려줘")`
호출 → `result` 텍스트 반환 확인, Bedrock InvokeModel 권한/모델 가용성(N. Virginia) 확인.
```

