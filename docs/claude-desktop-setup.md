# Claude Desktop ↔ AgentCore Gateway setup

This guide wires Claude Desktop to the project's AgentCore Gateway via the
`@search-gateway/mcp-bridge` local MCP bridge, with Cognito-issued JWTs that
auto-refresh in the background.

## Identity model

```
[ Optional federation IdP — IAM Identity Center / Okta / Azure AD ]
                       │ SAML / OIDC
                       ▼
              [ Cognito User Pool ]
   ┌──────────────────────┴──────────────────────┐
   │                      │                      │
gateway-user           gateway-m2m           admin-console
(PKCE, Hosted UI)   (client_credentials)    (PKCE, Hosted UI)
   │                      │
   └──── access token ────┴──▶ AgentCore Gateway (CUSTOM_JWT)
                                    │
                                    ▼
                             search-router Lambda
```

- **`gateway-user`** — humans on Claude Desktop. The bridge runs OAuth 2.1
  PKCE in their browser, stores tokens in the OS keychain, and refreshes them
  silently every hour.
- **`gateway-m2m`** — CI / batch / scripts. Holds a `client_secret` in
  Secrets Manager (CDK output: `GatewayM2mClientSecretArn`).
- **`admin-console`** — the existing admin Hosted-UI client. Only needs the
  `gateway/invoke` scope if you also want the playground to call Gateway
  directly (off by default, see "Optional admin playground" below).

## Step 1 — Deploy

```bash
pnpm install
pnpm -r build
pnpm --filter infra exec -- cdk deploy SearchGatewayStack-v1-0
pnpm --filter infra exec -- cdk deploy AdminConsoleStack-v1-0
```

Note the following CDK outputs from `SearchGatewayStack-v1-0`:

| Output | Used as |
| --- | --- |
| `GatewayUrl` *(advertise the MCP endpoint, see CloudWatch)* | `GATEWAY_URL` env in mcp.json |
| `HostedUiBaseUrl` | `COGNITO_DOMAIN` |
| `GatewayUserClientId` | `COGNITO_CLIENT_ID` |
| `GatewayM2mClientId` | M2M scripts |
| `GatewayM2mClientSecretArn` | M2M scripts |
| `GatewayScope` | `COGNITO_SCOPE` (default already includes it) |

## Step 2 — Create a user

```bash
aws cognito-idp admin-create-user \
  --user-pool-id "$(aws cloudformation describe-stacks --stack-name SearchGatewayStack-v1-0 \
       --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)" \
  --username alice@example.com \
  --user-attributes Name=email,Value=alice@example.com Name=email_verified,Value=true \
  --temporary-password "<temp>"
```

If you wired federation (`CognitoConstruct`'s `federation` prop), users
sign in via the corporate IdP instead and the admin-create-user step is
skipped.

## Step 3 — Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the OS-equivalent path:

```json
{
  "mcpServers": {
    "search-gateway": {
      "command": "npx",
      "args": ["-y", "@search-gateway/mcp-bridge"],
      "env": {
        "GATEWAY_URL": "https://<gateway-id>.bedrock-agentcore.<region>.amazonaws.com/mcp",
        "COGNITO_DOMAIN": "https://agentcore-admin-<account>.auth.<region>.amazoncognito.com",
        "COGNITO_CLIENT_ID": "<GatewayUserClientId>",
        "COGNITO_REGION": "<region>"
      }
    }
  }
}
```

Restart Claude Desktop. On the first tool call:

1. The bridge opens a browser tab to Cognito Hosted UI.
2. After login, Cognito redirects to `http://127.0.0.1:33991/callback` (or
   the next free port in 33991-33995).
3. The bridge stores `{access, refresh, expAt}` in the OS keychain under
   service `search-gateway-mcp-bridge`, account `default`.
4. Subsequent tool calls go straight through with no UI.

## Step 4 — Verify auto-refresh

```bash
# macOS keychain inspection (no secret value shown)
security find-generic-password -s search-gateway-mcp-bridge -a default -g
```

To force a refresh: revoke the access token in Cognito (`admin-user-global-sign-out`)
and run a Claude tool call. The first call returns 401 from Gateway, the
bridge force-refreshes once, and the call succeeds — visible only in the
bridge's stderr log.

If the *refresh token* is revoked (password change, logout-everywhere), the
next call triggers a full PKCE login again.

## Headless / CI usage (M2M)

```bash
SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "$(aws cloudformation describe-stacks --stack-name SearchGatewayStack-v1-0 \
       --query "Stacks[0].Outputs[?OutputKey=='GatewayM2mClientSecretArn'].OutputValue" --output text)" \
  --query SecretString --output text)

CID="$(aws cloudformation describe-stacks --stack-name SearchGatewayStack-v1-0 \
        --query "Stacks[0].Outputs[?OutputKey=='GatewayM2mClientId'].OutputValue" --output text)"

DOMAIN="$(aws cloudformation describe-stacks --stack-name SearchGatewayStack-v1-0 \
          --query "Stacks[0].Outputs[?OutputKey=='HostedUiBaseUrl'].OutputValue" --output text)"

TOKEN=$(curl -s -X POST "$DOMAIN/oauth2/token" \
  -H 'content-type: application/x-www-form-urlencoded' \
  -u "$CID:$SECRET" \
  -d 'grant_type=client_credentials&scope=gateway/invoke' \
  | jq -r .access_token)

curl -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' \
     -X POST "$GATEWAY_URL" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

M2M tokens are 1 hour, no refresh — re-mint on each batch run.

## Optional — federation (IAM Identity Center, Okta, Azure AD)

Pass `federation` to `CognitoConstruct` from `SearchStack`:

```ts
new CognitoConstruct(this, 'Cognito', {
  federation: {
    type: 'oidc',
    providerName: 'iam-identity-center',
    issuerUrl: 'https://identitycenter.<region>.amazonaws.com/ssoins-XXXX',
    clientId: '<idp-client-id>',
    clientSecret: SecretValue.secretsManager('idp/sso-client-secret'),
    scopes: ['openid', 'email', 'profile']
  }
});
```

Federated users land in the same Cognito user pool and can call the bridge
unchanged — no per-user provisioning step.

## Per-user quotas

Quotas are partitioned by the principal of the inbound JWT — each Cognito user
gets their own RPM/daily counter, so one noisy user can't burn the global
allowance.

- A **Gateway Request Interceptor Lambda** (deployed as part of `SearchStack`)
  runs between JWT validation and the target Lambda. It decodes the Bearer
  token, extracts the `sub` claim, and injects it into the tool arguments as
  `__principal`.
- The `search-router` reads `__principal` and uses it as the DynamoDB partition
  key for the quota counter (`principal#<sub>#provider#<provider>`).
- M2M tokens have no user `sub`; the interceptor falls through to the literal
  `service` principal so headless workloads share a single quota bucket
  separate from any individual user.

This pattern follows the AWS sample
[aws-samples/sample-agentcore-multi-tenant](https://github.com/aws-samples/sample-agentcore-multi-tenant)
— Gateway exposes only `bedrockAgentCoreToolName` on `clientContext.custom`,
not arbitrary JWT claims, so identity propagation requires an interceptor.

## Optional — admin playground via Gateway

To make the admin console call Gateway directly (instead of search-router
Lambda), pass `gatewayScope: search.gatewayScope` to `AdminConsoleStack` in
`infra/bin/app.ts`. This adds `gateway/invoke` to the admin OAuth client.

You also have to add the admin OAuth client id to Gateway's `allowedClients`
(currently `[gatewayUser, gatewayM2m]`). Doing so introduces a cross-stack
reference from `SearchStack` → `AdminConsoleStack` and is left for a future
revision.

## Rotation & lifecycle notes

- Cognito does not auto-rotate app-client secrets. The `gateway-m2m` secret
  is stored in Secrets Manager so operators can rotate via the Cognito API
  and call `PutSecretValue` to push the new value. v1 leaves rotation manual.
- `gateway-user` access tokens are 1h, refresh tokens 8h — short enough that
  a stolen refresh token can't quietly persist for weeks.
- `enableTokenRevocation` is on for all clients, so signing a user out via
  `admin-user-global-sign-out` propagates to the bridge on the next call.
