"""API key retrieval for Lambda search tools.

Lambda gateway targets carry their own outbound API key. Terraform injects it as
an engine-specific environment variable (e.g. SERPER_API_KEY) sourced from
tfvars / the AgentCore Identity seed. This is distinct from MCP *server* targets
(Tavily/Brave), where the gateway injects credentials from the token vault using
the workload identity token — Lambda targets do not receive a workload token.

For defense in depth we still support the AgentCore Identity data-plane
(GetResourceApiKey) as a fallback when a workload token is present in the
environment, but the primary path is the direct env var.
"""

import os
from typing import Optional

_api_key_cache = {}

# Maps a provider name to the environment variable Terraform injects.
_ENV_VAR_BY_PROVIDER = {
    "serper": "SERPER_API_KEY",
    "exa": "EXA_API_KEY",
    "perplexity": "PERPLEXITY_API_KEY",
    "tavily": "TAVILY_API_KEY",
    "tavily_lambda": "TAVILY_API_KEY",
    "brave": "BRAVE_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "firecrawl": "FIRECRAWL_API_KEY",
    "you": "YOU_API_KEY",
}


def _from_env(provider_name: str) -> Optional[str]:
    """Read the engine-specific API key env var, if present."""
    env_var = _ENV_VAR_BY_PROVIDER.get(provider_name)
    if env_var:
        value = os.environ.get(env_var)
        if value:
            return value
    return None


def _from_identity_provider(provider_name: str) -> Optional[str]:
    """Fallback: fetch the key from the AgentCore Identity token vault.

    Only usable when a workload token is available (MCP-style invocation).
    """
    workload_token = os.environ.get("WORKLOAD_TOKEN")
    identity_provider_arn = os.environ.get("IDENTITY_PROVIDER_ARN")

    if not workload_token or not identity_provider_arn:
        return None

    # Imported lazily so the primary env-var path doesn't require boto3.
    import boto3

    client = boto3.client(
        "bedrock-agentcore",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
    )
    response = client.get_resource_api_key(
        identityProviderArn=identity_provider_arn,
        workloadToken=workload_token,
        resourceIdentifier=provider_name,
    )
    return response.get("apiKey")


def get_api_key(provider_name: str) -> Optional[str]:
    """Retrieve the API key for a search provider.

    Resolution order:
      1. Cached value (per warm Lambda).
      2. Engine-specific environment variable (primary for Lambda targets).
      3. AgentCore Identity GetResourceApiKey (fallback, requires workload token).

    Args:
        provider_name: Provider identifier (e.g. 'serper', 'exa', 'perplexity').

    Returns:
        The API key string, or None if it cannot be resolved.

    Raises:
        RuntimeError: If the identity-provider fallback is attempted and fails.
    """
    if provider_name in _api_key_cache:
        return _api_key_cache[provider_name]

    api_key = _from_env(provider_name)

    if not api_key:
        try:
            api_key = _from_identity_provider(provider_name)
        except Exception as e:
            raise RuntimeError(
                f"Failed to retrieve API key for {provider_name}: {str(e)}"
            )

    if api_key:
        _api_key_cache[provider_name] = api_key

    return api_key
