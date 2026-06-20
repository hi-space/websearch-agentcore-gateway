"""SearXNG metasearch handler for Lambda Gateway.

Unlike the API-key engines, SearXNG is a self-hosted instance reached over the
network. Terraform injects the instance base URL as SEARXNG_URL (the internal
ALB DNS name); there is no API key.
"""

import os
import time
from typing import Any, Dict

import requests

from _shared.response import normalize_response
from _shared.search_params import apply_searxng
from _shared.otel import create_span
from _shared.caller_identity import extract_caller_identity


def extract_gateway_input(event: Dict[str, Any]) -> Dict[str, str]:
    """Extract query parameters from Gateway Lambda event or direct invocation."""
    if "input" in event and isinstance(event["input"], dict):
        return event["input"]
    return event


def lambda_handler(event, context):
    """Lambda handler for SearXNG metasearch."""
    start_time = time.time()
    import json as _json
    _ident = extract_caller_identity(event)
    print(_json.dumps({"event": "caller_identity", "engine": "searxng", **_ident}))

    try:
        input_params = extract_gateway_input(event)
        query = input_params.get("query") or input_params.get("q")
        num_results = int(input_params.get("num_results", 10))
        country = input_params.get("country", "")
        freshness = input_params.get("freshness", "")

        if not query:
            return {
                "results": [],
                "engine": "searxng",
                "latency_ms": int((time.time() - start_time) * 1000),
                "error": "Missing required parameter: query",
            }

        base_url = os.environ.get("SEARXNG_URL")
        if not base_url:
            return {
                "results": [],
                "engine": "searxng",
                "latency_ms": int((time.time() - start_time) * 1000),
                "error": "SEARXNG_URL not configured",
            }

        # Clamp num_results to contract limits
        num_results = max(1, min(num_results, 20))

        with create_span("query_searxng"):
            params = {
                "q": query,
                "format": "json",
            }
            apply_searxng(params, freshness, country)

            # If the SearXNG instance is later locked down, inject a shared-secret
            # header here (e.g. headers={"X-Searxng-Token": os.environ["SEARXNG_TOKEN"]}).
            response = requests.get(
                f"{base_url.rstrip('/')}/search",
                params=params,
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

        # SearXNG returns a flat results array; it has no per-result publish date
        # or favicon. Snippet text lives under "content".
        raw_results = data.get("results", [])[:num_results]
        results = []
        for item in raw_results:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": item.get("content", ""),
                "score": item.get("score"),
            })

        latency_ms = int((time.time() - start_time) * 1000)
        return normalize_response(results, "searxng", latency_ms)

    except requests.exceptions.RequestException as e:
        latency_ms = int((time.time() - start_time) * 1000)
        return {
            "results": [],
            "engine": "searxng",
            "latency_ms": latency_ms,
            "error": f"SearXNG API error: {str(e)}",
        }
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        return {
            "results": [],
            "engine": "searxng",
            "latency_ms": latency_ms,
            "error": f"Handler error: {str(e)}",
        }
