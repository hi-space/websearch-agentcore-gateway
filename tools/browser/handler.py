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
