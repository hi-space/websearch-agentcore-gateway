"""Constants for search handlers."""

# Gateway Lambda environment and configuration
DEFAULT_AWS_REGION = "ap-northeast-2"
DEFAULT_NUM_RESULTS = 10
MAX_NUM_RESULTS = 20
MIN_NUM_RESULTS = 1

# Search result schema fields (required and optional)
REQUIRED_RESULT_FIELDS = ["title", "url", "snippet"]
OPTIONAL_RESULT_FIELDS = ["score", "published_at"]

# HTTP timeouts (seconds)
DEFAULT_HTTP_TIMEOUT = 10
PERPLEXITY_HTTP_TIMEOUT = 30
