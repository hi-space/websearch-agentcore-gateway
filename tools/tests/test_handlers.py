"""Unit tests for search handlers with mocked HTTP."""

import json
import os
from unittest.mock import patch, MagicMock

import pytest
import responses


class TestSecretsManagerResolution:
    """get_api_key() resolves from Secrets Manager when *_SECRET_ARN is set."""

    def setup_method(self):
        # Clear the warm-Lambda cache between tests.
        from _shared import identity
        identity._api_key_cache.clear()

    def teardown_method(self):
        from _shared import identity
        identity._api_key_cache.clear()
        for k in ["SERPER_SECRET_ARN"]:
            os.environ.pop(k, None)

    def test_reads_plain_string_secret(self):
        os.environ["SERPER_SECRET_ARN"] = (
            "arn:aws:secretsmanager:us-east-1:913524902871:secret:websearch-gw/dev/tool/serper-AbCdEf"
        )
        fake_client = MagicMock()
        fake_client.get_secret_value.return_value = {"SecretString": "sk-plain-123"}
        with patch("boto3.client", return_value=fake_client):
            from _shared.identity import get_api_key
            key = get_api_key("serper")
        assert key == "sk-plain-123"
        fake_client.get_secret_value.assert_called_once_with(
            SecretId="arn:aws:secretsmanager:us-east-1:913524902871:secret:websearch-gw/dev/tool/serper-AbCdEf"
        )

    def test_reads_json_secret_with_api_key_field(self):
        os.environ["SERPER_SECRET_ARN"] = (
            "arn:aws:secretsmanager:us-east-1:913524902871:secret:websearch-gw/dev/tool/serper-AbCdEf"
        )
        fake_client = MagicMock()
        fake_client.get_secret_value.return_value = {"SecretString": '{"api_key": "sk-json-456"}'}
        with patch("boto3.client", return_value=fake_client):
            from _shared.identity import get_api_key
            key = get_api_key("serper")
        assert key == "sk-json-456"

    def test_falls_back_to_env_when_no_secret_arn(self):
        os.environ.pop("SERPER_SECRET_ARN", None)
        os.environ["SERPER_API_KEY"] = "sk-env-789"
        try:
            from _shared.identity import get_api_key
            key = get_api_key("serper")
            assert key == "sk-env-789"
        finally:
            os.environ.pop("SERPER_API_KEY", None)


@pytest.fixture(autouse=True)
def setup_env():
    """Setup environment variables for tests."""
    os.environ["AWS_REGION"] = "us-east-1"
    os.environ["WORKLOAD_TOKEN"] = "test-token"
    os.environ["IDENTITY_PROVIDER_ARN"] = "arn:aws:bedrock-agentcore:us-east-1:123456789012:identity-provider/test"
    yield
    # Cleanup
    for key in ["AWS_REGION", "WORKLOAD_TOKEN", "IDENTITY_PROVIDER_ARN"]:
        if key in os.environ:
            del os.environ[key]


class TestSerperHandler:
    """Test Serper handler."""

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_success(self, mock_get_api_key):
        """Test successful Serper query."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.POST,
            "https://google.serper.dev/search",
            json={
                "organic": [
                    {
                        "title": "Result 1",
                        "link": "https://example.com/1",
                        "snippet": "Snippet 1",
                    },
                    {
                        "title": "Result 2",
                        "link": "https://example.com/2",
                        "snippet": "Snippet 2",
                    },
                ]
            },
            status=200,
        )

        from serper.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "serper"
        assert len(result["results"]) == 2
        assert result["results"][0]["title"] == "Result 1"
        assert "latency_ms" in result

    @patch("_shared.identity.get_api_key")
    def test_missing_query(self, mock_get_api_key):
        """Test handler with missing query parameter."""
        mock_get_api_key.return_value = "test-api-key"

        from serper.handler import lambda_handler

        event = {}
        result = lambda_handler(event, None)

        assert result["engine"] == "serper"
        assert len(result["results"]) == 0
        assert "error" in result

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_api_error(self, mock_get_api_key):
        """Test handler with upstream API error."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.POST,
            "https://google.serper.dev/search",
            status=500,
        )

        from serper.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "serper"
        assert len(result["results"]) == 0
        assert "error" in result


class TestExaHandler:
    """Test Exa handler."""

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_success(self, mock_get_api_key):
        """Test successful Exa query."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.POST,
            "https://api.exa.ai/search",
            json={
                "results": [
                    {
                        "title": "Result 1",
                        "url": "https://example.com/1",
                        "text": "Snippet 1",
                    },
                ]
            },
            status=200,
        )

        from exa.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "exa"
        assert len(result["results"]) == 1

    @patch("_shared.identity.get_api_key")
    def test_missing_api_key(self, mock_get_api_key):
        """Test handler with missing API key."""
        mock_get_api_key.return_value = None

        from exa.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "exa"
        assert len(result["results"]) == 0
        assert "error" in result


class TestDuckDuckGoHandler:
    """Test DuckDuckGo handler."""

    @patch("ddgs.DDGS")
    def test_success(self, mock_ddgs):
        """Test successful DuckDuckGo query."""
        mock_instance = MagicMock()
        mock_instance.text.return_value = [
            {
                "title": "Result 1",
                "href": "https://example.com/1",
                "body": "Snippet 1",
            },
        ]
        mock_ddgs.return_value = mock_instance

        from duckduckgo.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "duckduckgo"
        assert len(result["results"]) == 1

    def test_missing_query(self):
        """Test handler with missing query parameter."""
        from duckduckgo.handler import lambda_handler

        event = {}
        result = lambda_handler(event, None)

        assert result["engine"] == "duckduckgo"
        assert len(result["results"]) == 0
        assert "error" in result


class TestPerplexityHandler:
    """Test Perplexity handler."""

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_success(self, mock_get_api_key):
        """Test successful Perplexity query."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.POST,
            "https://api.perplexity.ai/chat/completions",
            json={
                "citations": [
                    "https://example.com/1",
                    "https://example.com/2",
                ]
            },
            status=200,
        )

        from perplexity.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "perplexity"
        assert len(result["results"]) >= 1

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_upstream_error(self, mock_get_api_key):
        """Test handler with upstream API error."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.POST,
            "https://api.perplexity.ai/chat/completions",
            status=503,
        )

        from perplexity.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "perplexity"
        assert len(result["results"]) == 0
        assert "error" in result


class TestBraveHandler:
    """Test Brave handler."""

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_success(self, mock_get_api_key):
        """Test successful Brave query."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.GET,
            "https://api.search.brave.com/res/v1/web/search",
            json={
                "web": {
                    "results": [
                        {
                            "title": "Result 1",
                            "url": "https://example.com/1",
                            "description": "Snippet 1",
                        },
                        {
                            "title": "Result 2",
                            "url": "https://example.com/2",
                            "description": "Snippet 2",
                        },
                    ]
                }
            },
            status=200,
        )

        from brave.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "brave"
        assert len(result["results"]) == 2
        assert result["results"][0]["title"] == "Result 1"
        assert result["results"][0]["snippet"] == "Snippet 1"

    @patch("_shared.identity.get_api_key")
    def test_missing_query(self, mock_get_api_key):
        """Test handler with missing query parameter."""
        mock_get_api_key.return_value = "test-api-key"

        from brave.handler import lambda_handler

        event = {}
        result = lambda_handler(event, None)

        assert result["engine"] == "brave"
        assert len(result["results"]) == 0
        assert "error" in result

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_api_error(self, mock_get_api_key):
        """Test handler with upstream API error."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.GET,
            "https://api.search.brave.com/res/v1/web/search",
            status=500,
        )

        from brave.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "brave"
        assert len(result["results"]) == 0
        assert "error" in result


class TestAnthropicHandler:
    """Test Anthropic Claude built-in web search handler."""

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_success(self, mock_get_api_key):
        """Test successful Anthropic query (results + answer)."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.POST,
            "https://api.anthropic.com/v1/messages",
            json={
                "content": [
                    {
                        "type": "web_search_tool_result",
                        "content": [
                            {
                                "type": "web_search_result",
                                "title": "Result 1",
                                "url": "https://example.com/1",
                                "page_age": "2 days ago",
                            },
                        ],
                    },
                    {"type": "text", "text": "Here is a summary."},
                ]
            },
            status=200,
        )

        from anthropic.handler import lambda_handler

        event = {"query": "test search"}
        result = lambda_handler(event, None)

        assert result["engine"] == "anthropic"
        assert len(result["results"]) == 1
        assert result["results"][0]["title"] == "Result 1"
        assert result["answer"] == "Here is a summary."

    @patch("_shared.identity.get_api_key")
    def test_missing_query(self, mock_get_api_key):
        """Test handler with missing query parameter."""
        mock_get_api_key.return_value = "test-api-key"

        from anthropic.handler import lambda_handler

        result = lambda_handler({}, None)

        assert result["engine"] == "anthropic"
        assert len(result["results"]) == 0
        assert "error" in result

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_api_error(self, mock_get_api_key):
        """Test handler with upstream API error."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.POST,
            "https://api.anthropic.com/v1/messages",
            status=500,
        )

        from anthropic.handler import lambda_handler

        result = lambda_handler({"query": "test search"}, None)

        assert result["engine"] == "anthropic"
        assert len(result["results"]) == 0
        assert "error" in result


class TestFirecrawlHandler:
    """Test Firecrawl handler."""

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_success(self, mock_get_api_key):
        """Test successful Firecrawl query."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.POST,
            "https://api.firecrawl.dev/v1/search",
            json={
                "data": [
                    {
                        "title": "Result 1",
                        "url": "https://example.com/1",
                        "description": "Snippet 1",
                    },
                ]
            },
            status=200,
        )

        from firecrawl.handler import lambda_handler

        result = lambda_handler({"query": "test search"}, None)

        assert result["engine"] == "firecrawl"
        assert len(result["results"]) == 1
        assert result["results"][0]["snippet"] == "Snippet 1"

    @patch("_shared.identity.get_api_key")
    def test_missing_api_key(self, mock_get_api_key):
        """Test handler with missing API key."""
        mock_get_api_key.return_value = None

        from firecrawl.handler import lambda_handler

        result = lambda_handler({"query": "test search"}, None)

        assert result["engine"] == "firecrawl"
        assert len(result["results"]) == 0
        assert "error" in result


class TestYouHandler:
    """Test You.com handler."""

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_success(self, mock_get_api_key):
        """Test successful You.com query."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.GET,
            "https://ydc-index.io/v1/search",
            json={
                "results": {
                    "web": [
                        {
                            "title": "Result 1",
                            "url": "https://example.com/1",
                            "snippets": ["Snippet 1", "Snippet 1b"],
                        },
                    ]
                }
            },
            status=200,
        )

        from you.handler import lambda_handler

        result = lambda_handler({"query": "test search"}, None)

        assert result["engine"] == "you"
        assert len(result["results"]) == 1
        assert result["results"][0]["snippet"] == "Snippet 1"

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_api_error(self, mock_get_api_key):
        """Test handler with upstream API error."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.GET,
            "https://ydc-index.io/v1/search",
            status=429,
        )

        from you.handler import lambda_handler

        result = lambda_handler({"query": "test search"}, None)

        assert result["engine"] == "you"
        assert len(result["results"]) == 0
        assert "error" in result


class TestTavilyLambdaHandler:
    """Test Lambda-backed Tavily handler."""

    @responses.activate
    @patch("_shared.identity.get_api_key")
    def test_success(self, mock_get_api_key):
        """Test successful Tavily query (results + answer)."""
        mock_get_api_key.return_value = "test-api-key"

        responses.add(
            responses.POST,
            "https://api.tavily.com/search",
            json={
                "answer": "A short answer.",
                "results": [
                    {
                        "title": "Result 1",
                        "url": "https://example.com/1",
                        "content": "Snippet 1",
                        "score": 0.9,
                    },
                ],
            },
            status=200,
        )

        from tavily_lambda.handler import lambda_handler

        result = lambda_handler({"query": "test search"}, None)

        assert result["engine"] == "tavily_lambda"
        assert len(result["results"]) == 1
        assert result["results"][0]["score"] == 0.9
        assert result["answer"] == "A short answer."

    @patch("_shared.identity.get_api_key")
    def test_missing_query(self, mock_get_api_key):
        """Test handler with missing query parameter."""
        mock_get_api_key.return_value = "test-api-key"

        from tavily_lambda.handler import lambda_handler

        result = lambda_handler({}, None)

        assert result["engine"] == "tavily_lambda"
        assert len(result["results"]) == 0
        assert "error" in result


class TestSearxngHandler:
    """Test SearXNG handler (no API key; reads SEARXNG_URL)."""

    @responses.activate
    def test_success(self):
        """Test successful SearXNG query."""
        os.environ["SEARXNG_URL"] = "http://searxng.internal"

        responses.add(
            responses.GET,
            "http://searxng.internal/search",
            json={
                "results": [
                    {
                        "title": "Result 1",
                        "url": "https://example.com/1",
                        "content": "Snippet 1",
                        "score": 1.5,
                    },
                    {
                        "title": "Result 2",
                        "url": "https://example.com/2",
                        "content": "Snippet 2",
                    },
                ]
            },
            status=200,
        )

        from searxng.handler import lambda_handler

        result = lambda_handler({"query": "test search"}, None)

        assert result["engine"] == "searxng"
        assert len(result["results"]) == 2
        assert result["results"][0]["title"] == "Result 1"
        assert result["results"][0]["snippet"] == "Snippet 1"
        assert result["results"][0]["score"] == 1.5

        del os.environ["SEARXNG_URL"]

    def test_missing_query(self):
        """Test handler with missing query parameter."""
        os.environ["SEARXNG_URL"] = "http://searxng.internal"

        from searxng.handler import lambda_handler

        result = lambda_handler({}, None)

        assert result["engine"] == "searxng"
        assert len(result["results"]) == 0
        assert "error" in result

        del os.environ["SEARXNG_URL"]

    def test_missing_url(self):
        """Test handler when SEARXNG_URL is not configured."""
        os.environ.pop("SEARXNG_URL", None)

        from searxng.handler import lambda_handler

        result = lambda_handler({"query": "test search"}, None)

        assert result["engine"] == "searxng"
        assert len(result["results"]) == 0
        assert "error" in result

    @responses.activate
    def test_api_error(self):
        """Test handler with upstream API error."""
        os.environ["SEARXNG_URL"] = "http://searxng.internal"

        responses.add(
            responses.GET,
            "http://searxng.internal/search",
            status=500,
        )

        from searxng.handler import lambda_handler

        result = lambda_handler({"query": "test search"}, None)

        assert result["engine"] == "searxng"
        assert len(result["results"]) == 0
        assert "error" in result

        del os.environ["SEARXNG_URL"]


class TestResponseNormalization:
    """Test response normalization utilities."""

    def test_normalize_response(self):
        """Test response normalization."""
        from _shared.response import normalize_response

        results = [
            {
                "title": "Test",
                "url": "https://example.com",
                "snippet": "Test snippet",
                "score": 0.95,
            }
        ]

        response = normalize_response(results, "serper", 100)

        assert response["engine"] == "serper"
        assert response["latency_ms"] == 100
        assert len(response["results"]) == 1
        assert response["results"][0]["score"] == 0.95
        assert "answer" not in response

    def test_normalize_response_with_answer(self):
        """Answer field is included only when provided."""
        from _shared.response import normalize_response

        response = normalize_response([], "tavily_lambda", 50, answer="hello")

        assert response["answer"] == "hello"


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
