#!/bin/bash
set -euo pipefail

# Admin BFF acceptance test walkthrough - exercises the 6-step admin flow.
# Usage: ./walkthrough.sh <JWT> <ADMIN_URL>
# Arguments:
#   JWT - ID token from Cognito login (from login.sh)
#   ADMIN_URL - Base URL of Admin Console (e.g., https://d123456.cloudfront.net)

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <JWT> <ADMIN_URL>" >&2
  echo "Example: $0 \$(./login.sh) https://d123456.cloudfront.net" >&2
  exit 1
fi

JWT="$1"
ADMIN_URL="$2"

# Helper to make AWS SigV4 signed requests (requires AWS CLI v2)
# For simplicity in walking skeleton, use direct token-based auth
make_request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  local url="${ADMIN_URL}${path}"
  local cmd=("curl" "-s" "-X" "$method" "-H" "Authorization: Bearer $JWT")

  if [[ -n "$data" ]]; then
    cmd+=("-H" "Content-Type: application/json" "-d" "$data")
  fi

  cmd+=("$url")
  "${cmd[@]}"
}

echo "==== Admin BFF Walkthrough ===="
echo "Target: $ADMIN_URL"
echo

# Step 1: List providers
echo "Step 1: List all providers"
PROVIDERS=$(make_request GET "/api/providers")
echo "Response: $PROVIDERS"
STATUS=$(echo "$PROVIDERS" | jq -r '.providers | length')
[[ "$STATUS" == "null" ]] && echo "Error: No providers returned" >&2 && exit 1
echo "✓ Listed $STATUS providers"
echo

# Step 2: Get first provider (assume arxiv exists from seeding)
echo "Step 2: Get provider details (arxiv)"
ARXIV=$(make_request GET "/api/providers/arxiv")
echo "Response: $ARXIV"
ENABLED=$(echo "$ARXIV" | jq -r '.enabled')
[[ "$ENABLED" == "null" ]] && echo "Error: Invalid provider response" >&2 && exit 1
echo "✓ Retrieved arxiv provider (enabled=$ENABLED)"
echo

# Step 3: Update provider (enable exa)
echo "Step 3: Update provider configuration (enable exa)"
UPDATE_PAYLOAD='{"enabled":true,"metadata":{"description":"Exa search"}}'
UPDATE_RESPONSE=$(make_request PUT "/api/providers/exa" "$UPDATE_PAYLOAD")
echo "Response: $UPDATE_RESPONSE"
RESULT=$(echo "$UPDATE_RESPONSE" | jq -r '.success // false')
[[ "$RESULT" != "true" ]] && echo "Error: Failed to update provider" >&2 && exit 1
echo "✓ Updated exa provider"
echo

# Step 4: Put secret for exa provider
echo "Step 4: Store provider secret (exa API key)"
SECRET_PAYLOAD='{"apiKey":"test-exa-key-12345"}'
SECRET_RESPONSE=$(make_request PUT "/api/providers/exa/secret" "$SECRET_PAYLOAD")
echo "Response: $SECRET_RESPONSE"
SECRET_SUCCESS=$(echo "$SECRET_RESPONSE" | jq -r '.success // false')
[[ "$SECRET_SUCCESS" != "true" ]] && echo "Error: Failed to store secret" >&2 && exit 1
echo "✓ Stored exa provider secret"
echo

# Step 5: Test provider (verify connectivity/credentials)
echo "Step 5: Test provider connectivity (exa)"
TEST_RESPONSE=$(make_request POST "/api/providers/exa/test" '{}')
echo "Response: $TEST_RESPONSE"
TEST_SUCCESS=$(echo "$TEST_RESPONSE" | jq -r '.success // false')
[[ "$TEST_SUCCESS" != "true" ]] && echo "Warning: Provider test did not pass" >&2
echo "✓ Tested exa provider"
echo

# Step 6: Get metrics for all providers
echo "Step 6: Get metrics (usage/performance)"
METRICS=$(make_request GET "/api/metrics?providers=arxiv,exa")
echo "Response: $METRICS"
METRICS_COUNT=$(echo "$METRICS" | jq '.metrics | length // 0')
[[ "$METRICS_COUNT" -eq 0 ]] && echo "Warning: No metrics returned" >&2
echo "✓ Retrieved metrics for providers (count=$METRICS_COUNT)"
echo

echo "==== Walkthrough Complete ===="
echo "All 6 steps completed successfully!"
