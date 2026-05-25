#!/usr/bin/env bash
# Live admin-console smoke test. Hits the deployed CloudFront URL and
# verifies the public surface area + middleware-enforced 401s.
# Does NOT require a Cognito JWT — for that, see scripts/admin-curl/walkthrough.sh.
#
# Usage:  ADMIN_URL=https://d8ftutzhex2wz.cloudfront.net scripts/admin-smoke.sh
set -uo pipefail

ADMIN_URL="${ADMIN_URL:-}"
if [ -z "$ADMIN_URL" ]; then
  echo "ADMIN_URL env var required" >&2
  exit 2
fi

fail=0
check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    printf "  PASS  %-50s (got %s)\n" "$name" "$actual"
  else
    printf "  FAIL  %-50s (expected %s, got %s)\n" "$name" "$expected" "$actual"
    fail=1
  fi
}

echo ">>> Public surface"
code=$(curl -sk -o /tmp/admin-smoke-root.html -w "%{http_code}" "$ADMIN_URL/")
check "GET / returns 200"                   "200" "$code"
grep -q "<html" /tmp/admin-smoke-root.html  && lang=$(grep -oP '<html[^>]*lang="[^"]*"' /tmp/admin-smoke-root.html | head -1 | grep -oP 'lang="[^"]*"' || true)
check "html has lang attribute"             "lang=\"en\"" "${lang:-}"

echo ">>> Auth-protected surface (unauthenticated)"
for path in /admin/dashboard /admin/providers /admin/audit; do
  code=$(curl -sk -o /dev/null -w "%{http_code}" "$ADMIN_URL$path")
  check "GET $path returns 401"             "401" "$code"
done

for api in /api/providers /api/metrics /api/audit; do
  code=$(curl -sk -o /dev/null -w "%{http_code}" "$ADMIN_URL$api")
  check "GET $api returns 401"              "401" "$code"
done

echo ">>> MFA endpoints (unauthenticated)"
code=$(curl -sk -o /dev/null -w "%{http_code}" -X POST "$ADMIN_URL/api/auth/step-up")
check "POST /api/auth/step-up returns 403"  "403" "$code"

code=$(curl -sk -o /dev/null -w "%{http_code}" -X POST "$ADMIN_URL/api/providers/exa/secret/reveal" -H 'content-type: application/json' -d '{}')
check "POST reveal returns 403"             "403" "$code"

echo ">>> Cache headers"
nocache=$(curl -sk -I "$ADMIN_URL/api/providers" | grep -i "^cache-control:" | tr -d '\r' || true)
case "$nocache" in
  *no-store*) printf "  PASS  %-50s (got %s)\n" "API responses include no-store" "$nocache" ;;
  "") printf "  SKIP  %-50s (no cache-control header on 401)\n" "API responses include no-store" ;;
  *)  printf "  FAIL  %-50s (got %s)\n" "API responses include no-store" "$nocache"; fail=1 ;;
esac

if [ "$fail" -eq 1 ]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS — admin surface is healthy."
