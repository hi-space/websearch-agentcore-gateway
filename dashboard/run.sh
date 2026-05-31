#!/usr/bin/env bash
#
# run.sh — 대시보드 로컬 실행 스크립트
#
# 사용법:
#   ./run.sh          # dev 모드 (next dev --webpack, 기본)
#   ./run.sh prod     # prod 모드 (next build && next start)
#
# ⚠️ dev 는 webpack 모드를 쓴다 (package.json 의 "dev" 스크립트).
#    Next 16.2.6 의 Turbopack + @tailwindcss/postcss 조합은 첫 요청 시
#    postcss child_process 를 회수 없이 무한 fork → 메모리 폭증(수십 GB)
#    → OOM 으로 이어진다. 2026-05-31 실측으로 확정된 버그. webpack 모드는
#    postcss 워커를 띄우지 않아 안전(워커 0개, 메모리 ~2GB).
#    Turbopack 으로 돌려보려면 `pnpm dev:turbo` 사용(메모리 감시 필수).
#
# 안전장치 2가지:
#   1) 실행 전 포트 3000 점유 프로세스 정리 (중복 dev 서버 누적 방지)
#   2) 실행 중 postcss 워커 수 감시 → 임계 초과 시 서버 자동 종료(OOM 차단)

set -euo pipefail

# 스크립트가 있는 디렉터리(=dashboard)로 이동 — 어디서 호출하든 동작
cd "$(dirname "$(readlink -f "$0")")"

MODE="${1:-dev}"
PORT="${PORT:-3000}"

# ── pnpm 확인 ────────────────────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ pnpm 을 찾을 수 없습니다. (nvm 환경이라면 'nvm use' 후 다시 실행)" >&2
  exit 1
fi

# ── .env.local 확인 ──────────────────────────────────────────
if [ ! -f .env.local ]; then
  echo "⚠️  .env.local 이 없습니다. .env.example 을 복사해 값을 채우세요:"
  echo "    cp .env.example .env.local"
  exit 1
fi

# ── 포트 3000 점유 프로세스 정리 (중복 dev 서버 방지) ────────
existing_pids="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
if [ -n "$existing_pids" ]; then
  echo "⚠️  포트 $PORT 를 점유 중인 기존 프로세스 발견: $existing_pids"
  echo "    → 종료합니다 (중복 dev 서버 누적 방지)"
  # shellcheck disable=SC2086
  kill $existing_pids 2>/dev/null || true
  sleep 2
  # 여전히 살아있으면 강제 종료
  still="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
  if [ -n "$still" ]; then
    # shellcheck disable=SC2086
    kill -9 $still 2>/dev/null || true
    sleep 1
  fi
fi

# ── 의존성 설치 (lockfile 기준, 누락 시에만) ─────────────────
if [ ! -d node_modules ]; then
  echo "📦 node_modules 가 없어 의존성을 설치합니다..."
  pnpm install --frozen-lockfile
fi

# postcss 워커 폭증 시 dev 서버 트리 전체를 종료하는 안전장치.
# (Turbopack 버그 회귀나 dev:turbo 사용 시 OOM 으로 번지기 전에 차단)
MAX_POSTCSS_WORKERS="${MAX_POSTCSS_WORKERS:-80}"
watch_workers() {
  local server_pid="$1"
  while kill -0 "$server_pid" 2>/dev/null; do
    local n
    n="$(ps -eo args 2>/dev/null | grep -c '[p]ostcss.js')"
    if [ "${n:-0}" -gt "$MAX_POSTCSS_WORKERS" ]; then
      echo "" >&2
      echo "🚨 postcss 워커 ${n}개 감지 (임계 ${MAX_POSTCSS_WORKERS}) — 메모리 폭증 방지를 위해 서버를 종료합니다." >&2
      # 서버 트리 + 고아 postcss 워커 정리
      ps -eo pid,args 2>/dev/null \
        | grep -E "next dev|next-server|bin/next|[p]ostcss.js" | grep -v grep \
        | awk '{print $1}' | while read -r pid; do kill -9 "$pid" 2>/dev/null; done
      exit 1
    fi
    sleep 3
  done
}

# ── 실행 ─────────────────────────────────────────────────────
# 메모리 상한은 package.json scripts 의 NODE_OPTIONS 로 이미 적용됨
case "$MODE" in
  dev)
    echo "🚀 dev 서버 시작 — webpack 모드 (http://localhost:$PORT)"
    # 백그라운드로 띄우고 워커 감시 가드를 붙인다.
    pnpm dev --port "$PORT" &
    SERVER_PID=$!
    # 서버 종료 시 자식까지 정리
    trap 'kill -9 "$SERVER_PID" 2>/dev/null; ps -eo pid,args | grep "[p]ostcss.js" | awk "{print \$1}" | xargs -r kill -9 2>/dev/null; exit 0' INT TERM
    watch_workers "$SERVER_PID" &
    wait "$SERVER_PID"
    ;;
  prod)
    echo "🏗️  프로덕션 빌드..."
    pnpm build
    echo "🚀 prod 서버 시작 (http://localhost:$PORT)"
    exec pnpm start --port "$PORT"
    ;;
  *)
    echo "❌ 알 수 없는 모드: '$MODE' (dev | prod 중 하나)" >&2
    exit 1
    ;;
esac
