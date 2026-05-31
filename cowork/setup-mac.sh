#!/bin/bash
# macOS setup automation for Cowork 3P client integration with AgentCore Gateway.
# Idempotent: reads terraform output → authenticates via Cognito → stores JWT →
# renders mobileconfig → installs profile → configures managedMcpServers.
#
# Usage:
#   ./setup-mac.sh                 # Interactive setup
#   ./setup-mac.sh --force-login   # Force re-authentication
#   ./setup-mac.sh --gateway-url https://... # Override gateway URL
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TF_DIR="$REPO_ROOT/infra"

# Configuration directories
STORE_DIR="$HOME/.websearch-gw"
TOKEN_STORE="$STORE_DIR/tokens.json"
CONFIG_ENV="$STORE_DIR/config.env"
PROFILE_DIR="$STORE_DIR/profiles"
HEADERS_HELPER="$STORE_DIR/agentcore-token.sh"

# Cowork config library (macOS managed preference)
CONFIG_LIBRARY="$HOME/Library/Application Support/Claude-3p/configLibrary"

# OAuth callback
CALLBACK_PORT=8976
CALLBACK_URL="http://127.0.0.1:${CALLBACK_PORT}/callback"
SCOPES="openid email profile"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $*"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $*"
}

log_section() {
  echo ""
  echo -e "${GREEN}=== $* ===${NC}"
  echo ""
}

# Validate inputs
GATEWAY_URL_OVERRIDE=""
FORCE_LOGIN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --force-login)
      FORCE_LOGIN=true
      shift
      ;;
    --gateway-url)
      GATEWAY_URL_OVERRIDE="$2"
      shift 2
      ;;
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
done

log_section "Cowork 3P Client Setup (macOS)"

# --- Step 1: Gather values from Terraform or user input ---

log_info "Reading Terraform outputs..."
COGNITO_DOMAIN=""          # full OAuth domain URL (token endpoint base)
CLIENT_ID=""               # M2M client id
CLIENT_SECRET=""           # M2M client secret
SCOPE=""                   # OAuth scope for the client_credentials grant
GATEWAY_URL=""
REGION=""

# Try to read from terraform output in multiple locations
for tf_path in "$TF_DIR/environments/dev" "$TF_DIR" "$REPO_ROOT"; do
  if [ -d "$tf_path/.terraform" ]; then
    pushd "$tf_path" > /dev/null
    # Use the full domain URL and the M2M client (not the web client, which has no secret).
    COGNITO_DOMAIN=$(terraform output -raw cognito_domain_url 2>/dev/null || echo "")
    CLIENT_ID=$(terraform output -raw auth_m2m_client_id 2>/dev/null || echo "")
    CLIENT_SECRET=$(terraform output -raw auth_m2m_client_secret 2>/dev/null || echo "")
    SCOPE=$(terraform output -raw auth_m2m_scope 2>/dev/null || echo "")
    GATEWAY_URL=$(terraform output -raw gateway_url 2>/dev/null || echo "")
    REGION=$(terraform output -raw region 2>/dev/null || echo "")
    popd > /dev/null
    [ -n "$COGNITO_DOMAIN" ] && break
  fi
done

# Prompt for missing values
if [ -z "$COGNITO_DOMAIN" ]; then
  read -rp "Cognito domain URL (https://xxx.auth.region.amazoncognito.com): " COGNITO_DOMAIN
fi
if [ -z "$CLIENT_ID" ]; then
  read -rp "Cognito M2M client ID: " CLIENT_ID
fi
if [ -z "$CLIENT_SECRET" ]; then
  read -rsp "Cognito M2M client secret: " CLIENT_SECRET; echo
fi
if [ -z "$SCOPE" ]; then
  SCOPE="agentcore/invoke"
fi

# Override gateway URL if provided
if [ -n "$GATEWAY_URL_OVERRIDE" ]; then
  GATEWAY_URL="$GATEWAY_URL_OVERRIDE"
fi
if [ -z "$GATEWAY_URL" ]; then
  read -rp "Gateway URL (https://gateway.example.com): " GATEWAY_URL
fi
if [ -z "$REGION" ]; then
  read -rp "AWS region (ap-northeast-2): " REGION
fi

# Validate gateway URL
if ! [[ "$GATEWAY_URL" =~ ^https?:// ]]; then
  log_error "Invalid gateway URL: $GATEWAY_URL (must start with http:// or https://)"
  exit 1
fi

log_info "Configuration:"
log_info "  Cognito domain: $COGNITO_DOMAIN"
log_info "  Client ID:      $CLIENT_ID (M2M)"
log_info "  Gateway URL:    $GATEWAY_URL"
log_info "  Region:         $REGION"

# --- Step 2: Create directories and store config ---

log_info "Creating configuration directories..."
mkdir -p "$STORE_DIR"
mkdir -p "$PROFILE_DIR"
chmod 700 "$STORE_DIR"

# Set perms before writing so the secret is never briefly world-readable.
touch "$CONFIG_ENV"
chmod 600 "$CONFIG_ENV"
cat > "$CONFIG_ENV" << EOF
COGNITO_DOMAIN="$COGNITO_DOMAIN"
CLIENT_ID="$CLIENT_ID"
CLIENT_SECRET="$CLIENT_SECRET"
SCOPE="$SCOPE"
GATEWAY_URL="$GATEWAY_URL"
REGION="$REGION"
EOF
log_info "Wrote $CONFIG_ENV"

# --- Step 3: Install headersHelper script ---

log_info "Installing headersHelper to $HEADERS_HELPER..."
cp "$SCRIPT_DIR/agentcore-token.sh" "$HEADERS_HELPER"
chmod 755 "$HEADERS_HELPER"
log_info "Installed $HEADERS_HELPER"

# --- Step 4: Obtain or refresh JWT tokens ---

TOKEN_EXPIRED=true
if [ -f "$TOKEN_STORE" ] && [ "$FORCE_LOGIN" != "true" ]; then
  # Check if token is still valid (not expiring in next 60 seconds)
  EXPIRED=$(python3 << 'PYEOF'
import json, time, sys
try:
    with open(sys.argv[1]) as f:
        t = json.load(f)
    exp_time = t.get('expires_at', 0)
    # Token is valid if it expires more than 60 seconds from now
    print('no' if time.time() < exp_time - 60 else 'yes')
except (FileNotFoundError, json.JSONDecodeError, ValueError):
    print('yes')
PYEOF
  "$TOKEN_STORE" 2>/dev/null || echo "yes")

  if [ "$EXPIRED" = "no" ]; then
    log_info "Valid tokens found. Skipping authentication."
    TOKEN_EXPIRED=false
  fi
fi

if [ "$TOKEN_EXPIRED" = "true" ]; then
  log_section "Authenticating with Cognito (M2M Client Credentials)"

  # Exchange M2M client credentials for access token
  log_info "Exchanging client credentials for access token..."

  # Encode client_id:client_secret in base64 for Basic Auth.
  # `tr -d '\n'` strips line wrapping that GNU base64 adds at 76 chars, which
  # would otherwise corrupt the Authorization header.
  BASIC_AUTH=$(printf '%s:%s' "$CLIENT_ID" "$CLIENT_SECRET" | base64 | tr -d '\n')

  RESP=$(curl -s -X POST "${COGNITO_DOMAIN}/oauth2/token" \
    -H "Authorization: Basic ${BASIC_AUTH}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&scope=${SCOPE}")

  # Parse response and store token
  python3 << PYEOF
import json, time, sys
resp = json.loads('''$RESP''')
if 'access_token' not in resp:
    print("ERROR: Token exchange failed", file=sys.stderr)
    print(json.dumps(resp, indent=2), file=sys.stderr)
    sys.exit(1)

tokens = {
    "access_token": resp["access_token"],
    "expires_at": time.time() + resp.get("expires_in", 3600),
    "token_type": resp.get("token_type", "Bearer"),
}

with open("$TOKEN_STORE", "w") as f:
    json.dump(tokens, f, indent=2)

import os
os.chmod("$TOKEN_STORE", 0o600)
print("Tokens saved to $TOKEN_STORE (expires in {:.0f} seconds)".format(resp.get("expires_in", 3600)))
PYEOF

  if [ $? -ne 0 ]; then
    log_error "Failed to obtain access token"
    exit 1
  fi
fi

# --- Step 5: Render and install mobileconfig ---

log_section "Installing Cowork Configuration Profile"

ACCESS_TOKEN=$(python3 << 'PYEOF'
import json
with open("$TOKEN_STORE") as f:
    t = json.load(f)
print(t['access_token'])
PYEOF
)

log_info "Rendering mobileconfig template..."
python3 << PYEOF
import uuid
import json
from pathlib import Path

# Read template
template_path = Path("$SCRIPT_DIR/templates/cowork-3p.mobileconfig.tmpl")
if not template_path.exists():
    print("ERROR: Template not found: {}".format(template_path), file=__import__('sys').stderr)
    exit(1)

with open(template_path) as f:
    template = f.read()

# Generate UUIDs for mobileconfig
payload_uuid = str(uuid.uuid4()).upper()
profile_uuid = str(uuid.uuid4()).upper()

# Substitute placeholders
config = template.format(
    payload_uuid=payload_uuid,
    profile_uuid=profile_uuid,
    gateway_url="$GATEWAY_URL",
    headers_helper="$HEADERS_HELPER",
)

# Write to temporary profile
profile_path = Path("$PROFILE_DIR/cowork-3p.mobileconfig")
with open(profile_path, "w") as f:
    f.write(config)

print(f"Rendered mobileconfig: {profile_path}")
PYEOF

if [ $? -ne 0 ]; then
  log_error "Failed to render mobileconfig"
  exit 1
fi

# --- Step 6: Install mobileconfig profile ---

log_info "Installing mobileconfig profile (may prompt for admin password)..."
open "$PROFILE_DIR/cowork-3p.mobileconfig" 2>/dev/null || {
  log_warn "Failed to open mobileconfig with default handler"
  log_info "Manual installation: open $PROFILE_DIR/cowork-3p.mobileconfig"
}

# Poll for profile installation (up to 60 seconds)
log_info "Waiting for profile installation..."
for i in $(seq 1 60); do
  # Check if profile is installed by looking for managed preference
  if defaults read /Library/Managed\ Preferences/"$(whoami)"/com.anthropic.claudefordesktop 2>/dev/null | grep -q "inferenceBedrockRegion"; then
    log_info "Profile installed successfully!"
    break
  fi
  if [ $i -eq 60 ]; then
    log_warn "Profile installation timeout. Install manually or restart System Preferences."
  fi
  sleep 1
done

# --- Step 7: Configure managedMcpServers in configLibrary (Cowork 3P local config) ---

log_section "Configuring Managed MCP Servers"

python3 << PYEOF
import json
import os
from pathlib import Path

config_lib = Path("$CONFIG_LIBRARY")
config_lib.mkdir(parents=True, exist_ok=True)

meta_path = config_lib / "_meta.json"
try:
    with open(meta_path) as f:
        meta = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    meta = {"entries": []}

# Get or create profile UUID
profile_id = meta.get("appliedId")
if not profile_id:
    import uuid
    profile_id = str(uuid.uuid4())
    meta["appliedId"] = profile_id
    meta["entries"] = [{"id": profile_id, "name": "Default"}]

# Load or create profile config
profile_path = config_lib / f"{profile_id}.json"
try:
    with open(profile_path) as f:
        profile = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    profile = {}

# Add/update managedMcpServers entry for gateway
profile["managedMcpServers"] = [
    {
        "url": "$GATEWAY_URL",
        "transport": "http",
        "name": "AgentCore Gateway",
        "headersHelper": "$HEADERS_HELPER",
        "headersHelperTtlSec": 900,
    }
]

# Write configs
with open(profile_path, "w") as f:
    json.dump(profile, f, indent=2)

with open(meta_path, "w") as f:
    json.dump(meta, f, indent=2)

print(f"Configured managedMcpServers in {profile_path}")
PYEOF

if [ $? -ne 0 ]; then
  log_error "Failed to configure managedMcpServers"
  exit 1
fi

# --- Step 8: Restart Cowork and clear caches ---

log_section "Finalizing Setup"

log_info "Clearing Cowork caches..."
rm -f "$HOME/Library/Application Support/Claude-3p/plugin-settings.json" 2>/dev/null || true
rm -f ~/.claude/mcp-needs-auth-cache.json 2>/dev/null || true
find "$HOME/Library/Application Support/Claude-3p/" -name ".credentials.json" -delete 2>/dev/null || true

# Delete macOS keychain entries (credential cache)
security delete-generic-password -s "Claude Code-credentials" 2>/dev/null || true
security delete-generic-password -s "Claude-credentials" 2>/dev/null || true

log_info "Caches cleared"

# --- Success ---

log_section "Setup Complete!"
echo ""
echo "Next steps:"
echo "  1. If using MDM, deploy the mobileconfig profile:"
echo "     → Located at: $PROFILE_DIR/cowork-3p.mobileconfig"
echo ""
echo "  2. Restart Cowork:"
echo "     → Cmd+Q to quit"
echo "     → Reopen Cowork"
echo ""
echo "  3. Verify setup:"
echo "     → Look for 'AgentCore Gateway' in Customize > Connectors"
echo "     → Try a test search query"
echo ""
echo "Configuration stored at:"
echo "  → $CONFIG_ENV"
echo "  → $TOKEN_STORE"
echo "  → $HEADERS_HELPER"
echo ""

exit 0
