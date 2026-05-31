#!/bin/bash
# Cowork 3P headersHelper for managedMcpServers.
# Reads JWT from storage, refreshes if needed (60s before expiry),
# returns JSON with Authorization header.
#
# Called by Cowork via headersHelper directive in managedMcpServers config.
# Outputs: {"Authorization":"Bearer <access_token>"}
#
# Usage:
#   ./agentcore-token.sh             # Print JSON header (called by Cowork)
#   ./agentcore-token.sh --raw       # Print raw token (debugging)
set -euo pipefail

STORE_DIR="$HOME/.websearch-gw"
TOKEN_STORE="$STORE_DIR/tokens.json"
CONFIG_ENV="$STORE_DIR/config.env"

# Validation: Check for required files
if [ ! -f "$CONFIG_ENV" ]; then
  printf '{"error":"Missing config: %s. Run setup-mac.sh first"}\n' "$CONFIG_ENV" >&2
  exit 1
fi

if [ ! -f "$TOKEN_STORE" ]; then
  printf '{"error":"No tokens found. Run setup-mac.sh"}\n' >&2
  exit 1
fi

# Load configuration
source "$CONFIG_ENV"

# Check if token refresh is needed (within 60 seconds of expiry).
# Pass the store path as argv[1] (delimiter is quoted, so $TOKEN_STORE wouldn't expand).
NEED_REFRESH=$(python3 - "$TOKEN_STORE" << 'PYEOF'
import json
import time
import sys

try:
    with open(sys.argv[1]) as f:
        token_data = json.load(f)
    expires_at = token_data.get('expires_at', 0)
    current_time = time.time()

    # Refresh if expiring within 60 seconds
    if current_time >= expires_at - 60:
        print('yes')
    else:
        print('no')
except (FileNotFoundError, json.JSONDecodeError, ValueError, KeyError) as e:
    print(f'error: {e}', file=sys.stderr)
    print('yes')
PYEOF
)

if [ "$NEED_REFRESH" = "yes" ]; then
  # Token is expired or about to expire; refresh using M2M client credentials
  # tr -d '\n' strips the line wrapping GNU base64 adds at 76 chars, which would
  # otherwise corrupt the Authorization header.
  BASIC_AUTH=$(printf '%s:%s' "$CLIENT_ID" "$CLIENT_SECRET" | base64 | tr -d '\n')
  REFRESH_RESP=$(curl -s -X POST "${COGNITO_DOMAIN}/oauth2/token" \
    -H "Authorization: Basic ${BASIC_AUTH}" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&scope=${SCOPE:-agentcore/invoke}")

  # Update token store
  python3 << PYEOF
import json
import time
import sys

refresh_resp = json.loads('''$REFRESH_RESP''')
if 'access_token' not in refresh_resp:
    print(f"ERROR: Token refresh failed: {json.dumps(refresh_resp)}", file=sys.stderr)
    sys.exit(1)

# Read existing token data
with open("$TOKEN_STORE") as f:
    token_data = json.load(f)

# Update access token and expiry
token_data['access_token'] = refresh_resp['access_token']
token_data['expires_at'] = time.time() + refresh_resp.get('expires_in', 3600)

# Write back
with open("$TOKEN_STORE", "w") as f:
    json.dump(token_data, f)
PYEOF

  if [ $? -ne 0 ]; then
    printf '{"error":"Token refresh failed"}\n' >&2
    exit 1
  fi
fi

# Read current access token from store.
# Pass the path as argv[1]: the heredoc delimiter is quoted, so $TOKEN_STORE
# would not be expanded inside the Python body.
ACCESS_TOKEN=$(python3 - "$TOKEN_STORE" << 'PYEOF'
import json
import sys

with open(sys.argv[1]) as f:
    token_data = json.load(f)
print(token_data['access_token'])
PYEOF
)

# Parse --raw flag for debugging
if [ "${1:-}" = "--raw" ]; then
  printf '%s\n' "$ACCESS_TOKEN"
else
  # Output JSON header for Cowork
  printf '{"Authorization":"Bearer %s"}\n' "$ACCESS_TOKEN"
fi
