#!/usr/bin/env bash
# Drive synthetic CloudWatch metric values to push the v1 SearchGateway alarms into ALARM state.
# Used for runbook drills and SNS subscription smoke-tests; does NOT affect real traffic.
#
# Usage:
#   AWS_REGION=us-east-1 ./scripts/ops/force-alarms.sh
#
# What it does:
#   - Publishes 10 synthetic SearchGateway/Errors data points (Provider=arxiv, Status=UPSTREAM_ERROR)
#     above the alarm threshold (5 in 1×5min) so ArxivUpstreamErrors transitions to ALARM.
#   - Polls the alarm state until ALARM or 5min timeout.
#   - Prints the Topic ARN that was notified so you can verify SNS delivery.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
NAMESPACE="${ALARM_NAMESPACE:-SearchGateway}"
ALARM_NAME="${ALARM_NAME:-}"
PROVIDER="${ALARM_PROVIDER:-arxiv}"
STATUS="${ALARM_STATUS:-UPSTREAM_ERROR}"
COUNT="${ALARM_COUNT:-10}"

if [[ -z "${ALARM_NAME}" ]]; then
  ALARM_NAME=$(aws --region "${REGION}" cloudwatch describe-alarms \
    --query "MetricAlarms[?MetricName=='Errors' && Namespace=='${NAMESPACE}'].AlarmName | [0]" \
    --output text)
fi

if [[ -z "${ALARM_NAME}" || "${ALARM_NAME}" == "None" ]]; then
  echo "ERROR: no alarm found for namespace=${NAMESPACE} metric=Errors" >&2
  exit 1
fi

echo "→ Forcing alarm: ${ALARM_NAME} (region=${REGION})"
echo "→ Publishing ${COUNT} synthetic ${NAMESPACE}/Errors points (Provider=${PROVIDER}, Status=${STATUS})"

for _ in $(seq 1 "${COUNT}"); do
  aws --region "${REGION}" cloudwatch put-metric-data \
    --namespace "${NAMESPACE}" \
    --metric-name Errors \
    --value 1 \
    --unit Count \
    --dimensions "Provider=${PROVIDER},Status=${STATUS}"
done

echo "→ Waiting up to 5 minutes for alarm to transition to ALARM…"
DEADLINE=$(( $(date +%s) + 300 ))
while (( $(date +%s) < DEADLINE )); do
  STATE=$(aws --region "${REGION}" cloudwatch describe-alarms \
    --alarm-names "${ALARM_NAME}" \
    --query 'MetricAlarms[0].StateValue' --output text)
  echo "  alarm state: ${STATE}"
  if [[ "${STATE}" == "ALARM" ]]; then
    echo "✓ Alarm reached ALARM state"
    aws --region "${REGION}" cloudwatch describe-alarms \
      --alarm-names "${ALARM_NAME}" \
      --query 'MetricAlarms[0].{Reason:StateReason,Topics:AlarmActions}' --output json
    exit 0
  fi
  sleep 30
done

echo "✗ Timed out waiting for ${ALARM_NAME} to enter ALARM state" >&2
exit 2
