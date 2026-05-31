"""Brave Search API handler for Lambda Gateway."""

import json
import time
from typing import Any, Dict

import requests

from _shared.identity import get_api_key
from _shared.response import normalize_response
from _shared.otel import create_span


def extract_gateway_input(event: Dict[str, Any]) -> Dict[str, str]:
    """Extract query parameters from Gateway Lambda event or direct invocation."""
    if "input" in event and isinstance(event["input"], dict):
        return event["input"]
    return event


def lambda_handler(event, context):
    """Lambda handler for Brave independent web search."""
    start_time = time.time()

    try:
        # Extract input from event
        input_params = extract_gateway_input(event)
        query = input_params.get("query") or input_params.get("q")
        num_results = int(input_params.get("num_results", 10))
        country = input_params.get("country", "")

        if not query:
            return {
                "results": [],
                "engine": "brave",
                "latency_ms": int((time.time() - start_time) * 1000),
                "error": "Missing required parameter: query",
            }

        # Clamp num_results to contract limits
        num_results = max(1, min(num_results, 20))

        # Get API key from AgentCore Identity
        with create_span("get_brave_api_key"):
            api_key = get_api_key("brave")
            if not api_key:
                raise RuntimeError("Brave API key not available")

        # Query Brave Search API
        with create_span("query_brave"):
            headers = {
                "X-Subscription-Token": api_key,
                "Accept": "application/json",
            }
            params = {
                "q": query,
                "count": num_results,
            }
            if country:
                params["country"] = country

            response = requests.get(
                "https://api.search.brave.com/res/v1/web/search",
                params=params,
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

        # Parse results
        raw_results = data.get("web", {}).get("results", [])
        results = []
        for item in raw_results:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": item.get("description", ""),
            })

        latency_ms = int((time.time() - start_time) * 1000)
        return normalize_response(results, "brave", latency_ms)

    except requests.exceptions.RequestException as e:
        latency_ms = int((time.time() - start_time) * 1000)
        return {
            "results": [],
            "engine": "brave",
            "latency_ms": latency_ms,
            "error": f"Brave API error: {str(e)}",
        }
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        return {
            "results": [],
            "engine": "brave",
            "latency_ms": latency_ms,
            "error": f"Handler error: {str(e)}",
        }
