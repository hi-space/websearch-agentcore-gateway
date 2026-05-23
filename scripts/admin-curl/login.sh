#!/bin/bash
set -euo pipefail

# Cognito login script - obtains JWT token for admin BFF acceptance testing.
# Usage: ./login.sh > token.jwt
# Environment variables required:
#   COGNITO_USER_POOL_ID - The Cognito user pool ID (e.g., us-west-2_xxxxx)
#   COGNITO_CLIENT_ID - The Cognito app client ID
#   ADMIN_USERNAME - Username for admin user
#   ADMIN_PASSWORD - Password for admin user

# Validate required environment variables
if [[ -z "${COGNITO_USER_POOL_ID:-}" ]]; then
  echo "Error: COGNITO_USER_POOL_ID environment variable is not set" >&2
  exit 1
fi

if [[ -z "${COGNITO_CLIENT_ID:-}" ]]; then
  echo "Error: COGNITO_CLIENT_ID environment variable is not set" >&2
  exit 1
fi

if [[ -z "${ADMIN_USERNAME:-}" ]]; then
  echo "Error: ADMIN_USERNAME environment variable is not set" >&2
  exit 1
fi

if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  echo "Error: ADMIN_PASSWORD environment variable is not set" >&2
  exit 1
fi

# Extract region from user pool ID (format: region_xxxxx)
REGION="${COGNITO_USER_POOL_ID%_*}"

# Call Cognito admin-initiate-auth to get ID token
RESPONSE=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --client-id "$COGNITO_CLIENT_ID" \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters "USERNAME=$ADMIN_USERNAME,PASSWORD=$ADMIN_PASSWORD" \
  --region "$REGION")

# Extract the ID token from the response
ID_TOKEN=$(echo "$RESPONSE" | jq -r '.AuthenticationResult.IdToken')

if [[ -z "$ID_TOKEN" || "$ID_TOKEN" == "null" ]]; then
  echo "Error: Failed to obtain ID token from Cognito" >&2
  echo "Response: $RESPONSE" >&2
  exit 1
fi

# Output the token (caller will redirect to file if needed)
echo "$ID_TOKEN"
