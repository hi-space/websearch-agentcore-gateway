#!/usr/bin/env bash
#
# gen-env.sh — terraform output 으로부터 dashboard/.env.local 을 재생성
#
# 사용법:
#   ./gen-env.sh              # infra/environments/dev 의 output 으로 .env.local 생성
#
# 인프라를 새 리전(예: us-east-1)으로 배포한 뒤 실행하면, Gateway/Cognito/ARN 등
# 새로 생성된 실제 값들로 .env.local 전체를 다시 채운다.
# JUDGE_* 정적 설정은 기존 .env.local 값이 있으면 보존, 없으면 기본값을 쓴다.

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

TF_DIR="${TF_DIR:-../infra/environments/dev}"

# 기존 JUDGE 설정 보존 (없으면 기본값)
judge_enabled="$(grep -E '^NEXT_PUBLIC_JUDGE_ENABLED=' .env.local 2>/dev/null | head -1 | cut -d= -f2-)"
judge_relevance="$(grep -E '^JUDGE_RELEVANCE_EVALUATOR_ID=' .env.local 2>/dev/null | head -1 | cut -d= -f2-)"
judge_authority="$(grep -E '^JUDGE_AUTHORITY_EVALUATOR_ID=' .env.local 2>/dev/null | head -1 | cut -d= -f2-)"
judge_enabled="${judge_enabled:-1}"  # us-east-1 은 Evaluate API 지원 리전 → 기본 활성

o() { terraform -chdir="$TF_DIR" output -raw "$1"; }

REGION="$(o region)"
GATEWAY_ID="$(o gateway_id)"
GATEWAY_URL="$(o gateway_url)"
GATEWAY_ARN="$(o gateway_arn)"
COGNITO_DOMAIN="$(o cognito_domain)"
COGNITO_CLIENT_ID="$(o cognito_client_id)"
M2M_CLIENT_ID="$(o auth_m2m_client_id)"
M2M_CLIENT_SECRET="$(o auth_m2m_client_secret)"
M2M_SCOPE="$(o auth_m2m_scope)"
TOKEN_ENDPOINT="$(o cognito_domain_url)/oauth2/token"

cat > .env.local <<EOF
NEXT_PUBLIC_COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
NEXT_PUBLIC_COGNITO_DOMAIN=${COGNITO_DOMAIN}
NEXT_PUBLIC_GATEWAY_ID=${GATEWAY_ID}
NEXT_PUBLIC_GATEWAY_URL=${GATEWAY_URL}
NEXT_PUBLIC_REGION=${REGION}

# LLM judge (AgentCore Evaluation) — 1이면 playground에 "AI 품질 평가" 버튼 노출.
NEXT_PUBLIC_JUDGE_ENABLED=${judge_enabled}
# 검색 품질 LLM 평가자 id (create-evaluators.sh 출력). 미설정 시 해당 축은 평가 안 됨.
JUDGE_RELEVANCE_EVALUATOR_ID=${judge_relevance}
JUDGE_AUTHORITY_EVALUATOR_ID=${judge_authority}

# Server-only (NOT exposed to browser) — used by API routes for real M2M auth + AWS SDK
COGNITO_M2M_CLIENT_ID=${M2M_CLIENT_ID}
COGNITO_M2M_CLIENT_SECRET=${M2M_CLIENT_SECRET}
COGNITO_TOKEN_ENDPOINT=${TOKEN_ENDPOINT}
COGNITO_M2M_SCOPE=${M2M_SCOPE}
GATEWAY_ARN=${GATEWAY_ARN}
EOF

echo "✅ .env.local 재생성 완료 (region=${REGION})"
