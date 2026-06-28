#!/usr/bin/env bash
# Capture the full ClawGuard agent benchmark.
#
# Artifacts in bench-results/:
#   - agent-local.json       (deterministic structural-safety replay)
#   - agent-doctrine.json    (LLM-judge: eval shim suites + optional heldout2_live)
#
# Optional live runtime (held-out-2 only, ~$0.50–1 API):
#   BENCH_INCLUDE_LIVE=1 OPENAI_API_KEY=... ./scripts/run-agent-benchmark.sh
#
# Then scripts/render-agent-benchmark.js folds both into docs/AGENT_BENCHMARK_v*.md.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCTRINE_URL="${DOCTRINE_LAB_URL:-http://127.0.0.1:8000}"
SERVE_PORT="${CLAWGUARD_AGENT_SERVE_PORT:-9000}"
SERVE_URL="http://127.0.0.1:${SERVE_PORT}/api/agent/run"
SERVE_HEALTH="http://127.0.0.1:${SERVE_PORT}/health"
DOCTRINE_LAB_ROOT_DEFAULT="$(dirname "$REPO_ROOT")/thinking-DT/doctrine-lab"
DOCTRINE_LAB_ROOT="${DOCTRINE_LAB_ROOT:-$DOCTRINE_LAB_ROOT_DEFAULT}"
BENCH_DIR="${REPO_ROOT}/bench-results"
LOCAL_JSON="${BENCH_DIR}/agent-local.json"
DOCTRINE_JSON="${BENCH_DIR}/agent-doctrine.json"
CATEGORIES=(agent_safety agent_governance injection_resistance)
TASKS_PER_CATEGORY="${TASKS_PER_CATEGORY:-5}"
TASK_SETS=(in_distribution heldout heldout2)
BENCH_BASELINE_MODEL="${BENCH_BASELINE_MODEL:-gpt-4o}"
BENCH_INCLUDE_LIVE="${BENCH_INCLUDE_LIVE:-0}"
BENCH_ONLY_LIVE="${BENCH_ONLY_LIVE:-0}"
LIVE_PORT="${CLAWGUARD_AGENT_SERVE_PORT_LIVE:-9001}"
LIVE_HEALTH="http://127.0.0.1:${LIVE_PORT}/health"
LIVE_URL="http://127.0.0.1:${LIVE_PORT}/api/agent/run"
LIVE_SERVE_PID=""

mkdir -p "${BENCH_DIR}"

if [ "${BENCH_ONLY_LIVE}" != "1" ]; then
  echo "[1/4] Running local deterministic replay..."
  node "${REPO_ROOT}/scripts/agent-benchmark-local.js"
else
  echo "[1/4] Skipping local replay (BENCH_ONLY_LIVE=1)."
  export BENCH_INCLUDE_LIVE=1
fi

if ! curl -sf "${DOCTRINE_URL}/api/eval/tasks" >/dev/null 2>&1; then
  echo "Doctrine Lab not reachable at ${DOCTRINE_URL}; skipping LLM-judge run."
  echo "Rendering doc from local replay only..."
  rm -f "${DOCTRINE_JSON}"
  node "${REPO_ROOT}/scripts/render-agent-benchmark.js"
  exit 0
fi

SERVE_PID=""
if curl -sf "${SERVE_HEALTH}" >/dev/null 2>&1; then
  echo "[2/4] Using existing clawguard-agent-serve at ${SERVE_URL}"
else
  echo "[2/4] Starting clawguard-agent-serve on port ${SERVE_PORT}..."
  CLAWGUARD_AGENT_SERVE_MODE=eval node "${REPO_ROOT}/bin/clawguard-agent-serve.mjs" &
  SERVE_PID=$!
  trap 'if [ -n "${SERVE_PID}" ]; then kill "${SERVE_PID}" 2>/dev/null || true; fi' EXIT
  sleep 1
  curl -sf "${SERVE_HEALTH}" >/dev/null
fi

export NEXUS_AGENT_URL="${SERVE_URL}"

DOCTRINE_SHA="$(git -C "${DOCTRINE_LAB_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
DOCTRINE_ENV="${DOCTRINE_LAB_ROOT}/.env"
JUDGE_PROVIDER="$(grep -E '^JUDGE_PROVIDER=' "${DOCTRINE_ENV}" 2>/dev/null | cut -d= -f2- || true)"
JUDGE_MODEL="$(grep -E '^JUDGE_MODEL=' "${DOCTRINE_ENV}" 2>/dev/null | cut -d= -f2- || true)"
JUDGE_PROVIDER="${JUDGE_PROVIDER:-gemini}"
JUDGE_MODEL="${JUDGE_MODEL:-configured default}"

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
  if [ -n "${SERVE_PID}" ]; then
    kill "${SERVE_PID}" 2>/dev/null || true
  fi
  if [ -n "${LIVE_SERVE_PID}" ]; then
    kill "${LIVE_SERVE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

PKG_VER="$(node -pe "require('${REPO_ROOT}/package.json').version")"
if [ "${BENCH_ONLY_LIVE}" != "1" ]; then
  rm -f "${DOCTRINE_JSON}"
fi

live_provider_has_key() {
  local provider="${CLAWGUARD_LIVE_PROVIDER:-openai}"
  case "${provider}" in
    mock) return 0 ;;
    openai|openrouter) [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${OPENROUTER_API_KEY:-}" ] ;;
    gemini|google) [ -n "${GEMINI_API_KEY:-}" ] ;;
    anthropic) [ -n "${ANTHROPIC_API_KEY:-}" ] ;;
    deepseek) [ -n "${DEEPSEEK_API_KEY:-}" ] ;;
    ollama) return 0 ;;
    *) return 1 ;;
  esac
}

start_live_serve() {
  if curl -sf "${LIVE_HEALTH}" 2>/dev/null | grep -q '"mode":"live"'; then
    echo "[live] Using existing clawguard-agent-serve (live) at ${LIVE_URL}"
    return 0
  fi
  echo "[live] Starting clawguard-agent-serve on port ${LIVE_PORT} (mode=live)..."
  CLAWGUARD_AGENT_SERVE_MODE=live \
    CLAWGUARD_AGENT_SERVE_PORT="${LIVE_PORT}" \
    CLAWGUARD_LIVE_PROVIDER="${CLAWGUARD_LIVE_PROVIDER:-openai}" \
    CLAWGUARD_LIVE_MODEL="${CLAWGUARD_LIVE_MODEL:-}" \
    node "${REPO_ROOT}/bin/clawguard-agent-serve.mjs" &
  LIVE_SERVE_PID=$!
  sleep 1
  curl -sf "${LIVE_HEALTH}" >/dev/null
}

run_doctrine_suite() {
  local TASK_SET="$1"
  local AGG_LABEL="${2:-${TASK_SET}}"
  echo "[bench] Doctrine Lab suite: ${TASK_SET} -> ${AGG_LABEL} (${#CATEGORIES[@]} categories, n=${TASKS_PER_CATEGORY})..."
  local AGG_ARGS=()
  local LAST_INDEX=$((${#CATEGORIES[@]} - 1))
  local i=0
  for category in "${CATEGORIES[@]}"; do
    local CAT_FILE="${TMP_DIR}/${TASK_SET}_${category}.json"
    echo "  -> ${TASK_SET}/${category}"
    local PAYLOAD
    if [ "${TASK_SET}" = "in_distribution" ]; then
      PAYLOAD=$(printf '{"model_a":"clawguard:beta9","model_b":"%s","category":"%s","tasks_per_category":%s,"save_report":true}' \
        "${BENCH_BASELINE_MODEL}" "${category}" "${TASKS_PER_CATEGORY}")
    else
      PAYLOAD=$(printf '{"model_a":"clawguard:beta9","model_b":"%s","category":"%s","tasks_per_category":%s,"save_report":true,"task_set":"%s"}' \
        "${BENCH_BASELINE_MODEL}" "${category}" "${TASKS_PER_CATEGORY}" "${TASK_SET}")
    fi
    if curl -sf -X POST "${DOCTRINE_URL}/api/eval/report" \
        -H "Content-Type: application/json" \
        -d "${PAYLOAD}" >"${CAT_FILE}"; then
      AGG_ARGS+=("--input" "${category}=${CAT_FILE}")
    else
      echo "     (curl failed for ${category}; continuing)"
    fi
    if [ "$i" -lt "$LAST_INDEX" ]; then
      sleep 21
    fi
    i=$((i + 1))
  done

  if [ "${#AGG_ARGS[@]}" -eq 0 ]; then
    echo "  All calls failed for ${TASK_SET}."
    return 1
  fi

  JUDGE_PROVIDER="${JUDGE_PROVIDER}" JUDGE_MODEL="${JUDGE_MODEL}" \
    DOCTRINE_SHA="${DOCTRINE_SHA}" SERVE_URL="${NEXUS_AGENT_URL}" PKG_VER="${PKG_VER}" \
    node "${REPO_ROOT}/scripts/aggregate-doctrine-reports.mjs" \
      --out "${DOCTRINE_JSON}" \
      --task-set "${AGG_LABEL}" \
      "${AGG_ARGS[@]}"
}

SUITE_OK=0
if [ "${BENCH_ONLY_LIVE}" = "1" ]; then
  if [ -f "${DOCTRINE_JSON}" ]; then
    SUITE_OK=1
    echo "[bench] Reusing existing ${DOCTRINE_JSON} for eval suites; running live held-out-2 only."
  else
    echo "BENCH_ONLY_LIVE=1 requires existing ${DOCTRINE_JSON} (run full benchmark first)."
    exit 1
  fi
else
  for TASK_SET in "${TASK_SETS[@]}"; do
    if run_doctrine_suite "${TASK_SET}"; then
      SUITE_OK=1
    fi
  done
fi

if [ "${BENCH_INCLUDE_LIVE}" = "1" ] && [ "${SUITE_OK}" -eq 1 ]; then
  if live_provider_has_key; then
    start_live_serve
    PREV_NEXUS="${NEXUS_AGENT_URL}"
    export NEXUS_AGENT_URL="${LIVE_URL}"
    if run_doctrine_suite "heldout2" "heldout2_live"; then
      echo "[live] heldout2_live suite complete."
    else
      echo "[live] heldout2_live suite failed (see errors above)."
    fi
    export NEXUS_AGENT_URL="${PREV_NEXUS}"
  else
    echo "[live] Skipping live runtime benchmark: no API key for CLAWGUARD_LIVE_PROVIDER=${CLAWGUARD_LIVE_PROVIDER:-openai}."
    echo "       Set OPENAI_API_KEY (or GEMINI_API_KEY / ANTHROPIC_API_KEY) or use CLAWGUARD_LIVE_PROVIDER=mock."
  fi
fi

if [ "${SUITE_OK}" -eq 0 ]; then
  echo "All Doctrine Lab calls failed; rendering doc from local replay only."
  rm -f "${DOCTRINE_JSON}"
  node "${REPO_ROOT}/scripts/render-agent-benchmark.js"
  exit 0
fi

echo "[final] Rendering benchmark doc..."
node "${REPO_ROOT}/scripts/render-agent-benchmark.js"
echo "Done."
