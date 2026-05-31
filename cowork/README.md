# Cowork 3P Client Setup

Automated setup for Claude Cowork 3P (Claude Desktop) with AgentCore Gateway integration.

## Overview

This directory contains automation to configure Claude Cowork (Claude Desktop running in third-party platform mode) to use the AgentCore Gateway for web search and other tools via MCP servers.

**What you get:**
- Seamless JWT authentication via Cognito M2M credentials
- Automatic token refresh with 900s caching (headersHelper)
- managedMcpServers configuration for AgentCore Gateway connector
- Support for both macOS and Windows

**Prerequisites:**
- Claude Desktop installed
- AWS account with Bedrock access
- AgentCore Gateway deployed (terraform outputs available)
- Cognito M2M credentials configured

## Quick Start

### macOS

```bash
cd cowork
chmod +x setup-mac.sh agentcore-token.sh
./setup-mac.sh
```

This will:
1. Read terraform outputs (or prompt for manual entry)
2. Authenticate via Cognito M2M client credentials
3. Store JWT tokens in `~/.websearch-gw/tokens.json` (chmod 600)
4. Install `agentcore-token.sh` helper to `~/.websearch-gw/agentcore-token.sh`
5. Render and install the mobileconfig profile
6. Configure managedMcpServers in Cowork's configLibrary

**Then restart Cowork:**
```bash
# Quit and reopen
cmd+Q
# Reopen from Applications
```

### Windows

```powershell
cd cowork
.\setup-windows.ps1
```

This will:
1. Read terraform outputs (or prompt for manual entry)
2. Authenticate via Cognito M2M client credentials
3. Store JWT tokens in `%USERPROFILE%\.websearch-gw\tokens.json`
4. Copy `agentcore-token.ps1` helper
5. Render and apply registry settings
6. Configure managedMcpServers in Cowork's configLibrary

**Then restart Cowork:**
```powershell
# Close Cowork completely
# Reopen from Start menu
```

## Configuration

### What Gets Stored

After setup, the following files are created in your user home directory:

**macOS:**
- `~/.websearch-gw/config.env` — Cognito domain, client ID, gateway URL
- `~/.websearch-gw/tokens.json` — JWT tokens (chmod 600, user-only)
- `~/.websearch-gw/agentcore-token.sh` — Token refresh helper
- `~/.websearch-gw/profiles/cowork-3p.mobileconfig` — MDM profile

**Windows:**
- `%USERPROFILE%\.websearch-gw\config.env` — Cognito domain, client ID, gateway URL
- `%USERPROFILE%\.websearch-gw\tokens.json` — JWT tokens
- `%USERPROFILE%\.websearch-gw\agentcore-token.ps1` — Token refresh helper
- `%USERPROFILE%\.websearch-gw\profiles\cowork-3p.reg` — Registry import file

### How It Works

1. **Initial Authentication:**
   - Setup scripts exchange M2M client credentials for JWT via Cognito
   - Token is stored locally with expiry time

2. **Runtime Token Refresh:**
   - Cowork calls `headersHelper` (agentcore-token.sh/ps1) before each MCP request
   - If token expires in next 60 seconds, helper refreshes it
   - Returns JSON header: `{"Authorization":"Bearer <token>"}`

3. **MCP Server Registration:**
   - managedMcpServers config points Cowork at gateway URL
   - Uses headersHelper for authentication
   - 900s TTL caching to avoid excessive refreshes

## Architecture

```
Claude Cowork
    ↓ (uses managedMcpServers config)
    ↓
Gateway URL (HTTPS)
    ↑ (includes Authorization header)
    ↑
headersHelper script (agentcore-token.sh/ps1)
    ↑ (checks token expiry)
    ↑
tokens.json (JWT tokens)
    ↑ (refreshes if needed via Cognito)
    ↑
Cognito M2M Flow
    ↑
config.env (CLIENT_ID, CLIENT_SECRET, SCOPE, COGNITO_DOMAIN)
```

## Commands

### Setup (Interactive)

**macOS:**
```bash
./setup-mac.sh
```

**Windows:**
```powershell
.\setup-windows.ps1
```

### Force Re-authentication

**macOS:**
```bash
./setup-mac.sh --force-login
```

**Windows:**
```powershell
.\setup-windows.ps1 -ForceLogin
```

### Override Gateway URL

**macOS:**
```bash
./setup-mac.sh --gateway-url https://custom.gateway.example.com
```

**Windows:**
```powershell
.\setup-windows.ps1 -GatewayUrl https://custom.gateway.example.com
```

### Manual Token Refresh (Debugging)

**macOS:**
```bash
~/.websearch-gw/agentcore-token.sh        # Print JSON header
~/.websearch-gw/agentcore-token.sh --raw  # Print raw token
```

**Windows:**
```powershell
& "$env:USERPROFILE\.websearch-gw\agentcore-token.ps1"        # Print JSON header
& "$env:USERPROFILE\.websearch-gw\agentcore-token.ps1" -Raw   # Print raw token
```

### Uninstall

**macOS:**
```bash
./uninstall-mac.sh
```

**Windows:**
```powershell
.\uninstall-windows.ps1
```

## Troubleshooting

### "Gateway URL validation failed"

**Error:** `Invalid gateway URL: ... (must start with http:// or https://)`

**Fix:** Ensure the gateway URL includes the protocol (`https://`, not `example.com`).

### "Token exchange failed"

**Error:** `Token exchange failed: {"error":"invalid_client"}`

**Possible causes:**
- Client ID is incorrect
- M2M credentials not configured in Cognito
- Client does not have client_credentials grant type enabled

**Fix:** Verify credentials in Terraform outputs or Cognito console.

### Cowork shows "Cannot connect to gateway"

**Possible causes:**
- Gateway URL is incorrect or unreachable
- Network firewall blocking connection
- Token has expired and refresh failed

**Fix:**
1. Verify gateway URL is correct: `curl https://<gateway-url>/health`
2. Check token: `~/.websearch-gw/agentcore-token.sh` (macOS) or `agentcore-token.ps1` (Windows)
3. Re-run setup: `./setup-mac.sh --force-login` or `.\setup-windows.ps1 -ForceLogin`

### MCP connector doesn't appear in Cowork

**Possible causes:**
- Cowork cache not cleared
- managedMcpServers not configured properly
- Profile not installed

**Fix:**
1. Restart Cowork (Cmd+Q / close completely)
2. Re-run setup
3. Check configuration in Cowork settings

### "headersHelper not found" on restart

**Fix:** Reinstall headersHelper:
```bash
# macOS
mkdir -p ~/.websearch-gw
cp agentcore-token.sh ~/.websearch-gw/
chmod 755 ~/.websearch-gw/agentcore-token.sh

# Windows
mkdir "$env:USERPROFILE\.websearch-gw" -Force
Copy-Item agentcore-token.ps1 "$env:USERPROFILE\.websearch-gw\" -Force
```

## Idempotency

All setup scripts are **idempotent** — running them multiple times is safe:
- Existing tokens are reused if still valid
- Existing config is overwritten
- Existing profiles are updated
- Duplicate managedMcpServers entries are not created

To force re-authentication:
```bash
rm ~/.websearch-gw/tokens.json
./setup-mac.sh  # or setup-windows.ps1
```

## Security Considerations

### Token Storage

- **macOS:** `~/.websearch-gw/tokens.json` has `chmod 600` (user-only read/write)
- **Windows:** Token file is stored in user AppData (user-only by default)

### Credential Refresh

- Tokens refresh **60 seconds before expiry** to avoid mid-request failures
- M2M client credentials are only used to obtain tokens; they are never stored locally
- All communication with Cognito uses HTTPS

### Network Security

- Gateway URL must use HTTPS (validation enforced)
- MCP server connection uses authenticated headers
- JWT tokens include standard exp/iat claims

### Management

- Use MDM (Jamf, Intune, Mosyle) to deploy profiles at scale
- Registry settings (Windows) are managed via Group Policy
- Tokens are automatically refreshed before expiry

## Platform-Specific Quirks

### macOS

- mobileconfig installed via `open` command (native handler)
- Managed preference stored in `/Library/Managed\ Preferences/<user>/com.anthropic.claudefordesktop`
- headersHelper must be executable (`chmod 755`)
- Requires restart of Cowork (not just reload) for profile to take effect

### Windows

- Registry entries stored in `HKEY_CURRENT_USER\SOFTWARE\Policies\Claude`
- .reg file imported via `reg.exe import` command
- headersHelper script must be in PowerShell's PATH or fully qualified
- Array values in registry stored as JSON-encoded strings

## References

- [Claude Cowork 3P Setup (AWS Blog)](https://aws.amazon.com/blogs/machine-learning/from-developer-desks-to-the-whole-organization-running-claude-cowork-in-amazon-bedrock/)
- [Anthropic Claude Cowork Documentation](https://support.claude.com/en/articles/14680741-install-and-configure-claude-cowork-with-third-party-platforms)
- [AgentCore Gateway Documentation](/docs/COWORK_3P.md)

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section above
2. Verify Terraform outputs: `cd infra && terraform output`
3. Check logs: `~/.websearch-gw/config.env` and `~/.websearch-gw/tokens.json`
4. Review AgentCore Gateway health: `curl https://<gateway-url>/health`
