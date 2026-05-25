#!/usr/bin/env bash
# v1.0 ship-readiness aggregate gate.
# Runs the same checks CI runs and prints a single PASS/FAIL summary.
#
# Usage:  scripts/v1-ship-check.sh [--skip-synth]
#
# Exit code is non-zero if ANY gate fails.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_SYNTH=0
for arg in "$@"; do
  case "$arg" in
    --skip-synth) SKIP_SYNTH=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

declare -a GATE_NAMES=()
declare -a GATE_RESULTS=()

run_gate() {
  local name="$1"; shift
  printf "\n>>> %s\n" "$name"
  if "$@"; then
    GATE_NAMES+=("$name"); GATE_RESULTS+=("PASS")
  else
    GATE_NAMES+=("$name"); GATE_RESULTS+=("FAIL")
  fi
}

run_gate "lint"          pnpm -s lint
run_gate "typecheck"     pnpm -s typecheck
run_gate "tests (pkgs)"  pnpm -rs test
run_gate "admin asset"   bash -c '[ -f packages/admin-console/dist/packages/admin-console/lambda-entry.mjs ] || pnpm -s --filter admin-console build:lambda'

if [ "$SKIP_SYNTH" -eq 0 ]; then
  run_gate "cdk synth (incl. cdk-nag)" bash -c 'cd infra && pnpm -s exec cdk synth --quiet'
fi

printf "\n========== v1 ship-check summary ==========\n"
fail=0
for i in "${!GATE_NAMES[@]}"; do
  printf "  %-30s %s\n" "${GATE_NAMES[$i]}" "${GATE_RESULTS[$i]}"
  [ "${GATE_RESULTS[$i]}" = "FAIL" ] && fail=1
done
printf "===========================================\n"

if [ "$fail" -eq 1 ]; then
  echo "RESULT: FAIL — fix the gates above before shipping." >&2
  exit 1
fi
echo "RESULT: PASS — ready to ship."
