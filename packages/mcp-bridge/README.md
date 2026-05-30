# @search-gateway/mcp-bridge

Local MCP bridge that lets Claude Desktop (or any stdio MCP client) reach the
project's AgentCore Gateway over authenticated HTTPS.

```
Claude Desktop ──stdio MCP──▶ mcp-bridge ──HTTPS+Bearer──▶ AgentCore Gateway
                                  ▲
                                  │ Cognito PKCE / refresh
                                  ▼
                              OS keychain
```

## What it does

1. On first start, opens a browser to Cognito Hosted UI and runs the OAuth 2.1
   PKCE flow against a loopback redirect (`127.0.0.1:33991-33995`).
2. Persists the access + refresh tokens in the OS keychain (macOS Keychain,
   Windows DPAPI, Linux secret-service via `keytar`).
3. Refreshes the access token automatically ~60s before expiry.
4. On a 401 from Gateway, force-refreshes once and retries the same call.
5. If the refresh token is revoked, restarts PKCE on the next call.

Refresh tokens never appear in environment variables, log lines, or files —
they live only in the keychain. Refresh-token rotation is enabled on the
Cognito user client, so each `/oauth2/token` call returns a fresh refresh
token; the previous one is invalidated after a 30s grace window. The bridge
threads the new value through automatically.

## Configuration (Claude Desktop `mcp.json`)

```json
{
  "mcpServers": {
    "search-gateway": {
      "command": "npx",
      "args": ["-y", "@search-gateway/mcp-bridge"],
      "env": {
        "GATEWAY_URL": "https://<gateway>.bedrock-agentcore.<region>.amazonaws.com/mcp",
        "COGNITO_DOMAIN": "https://agentcore-admin-<account>.auth.<region>.amazoncognito.com",
        "COGNITO_CLIENT_ID": "<GatewayUserClientId from CDK output>",
        "COGNITO_REGION": "<region>",
        "COGNITO_SCOPE": "gateway/invoke openid email profile",
        "BRIDGE_PROFILE": "default"
      }
    }
  }
}
```

`COGNITO_SCOPE` and `BRIDGE_PROFILE` are optional. `BRIDGE_PROFILE` lets one
machine talk to multiple Gateways with separate keychain entries.

## Development

```bash
pnpm --filter @search-gateway/mcp-bridge build
pnpm --filter @search-gateway/mcp-bridge test
```
