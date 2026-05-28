#!/usr/bin/env bash
# Capture the full ClawGuard agent benchmark.
#
# Artifacts in bench-results/:
#   - agent-local.json       (deterministic structural-safety replay)
#   - agent-doctrine.json    (LLM-judge: in_distribution + heldout suites)
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

mkdir -p "${BENCH_DIR}"

echo "[1/4] Running local deterministic replay..."
node "${REPO_ROOT}/scripts/agent-benchmark-local.js"

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
trap 'rm -rf "${TMP_DIR}"; if [ -n "${SERVE_PID}" ]; then kill "${SERVE_PID}" 2>/dev/null || true; fi' EXIT

PKG_VER="$(node -pe "require('${REPO_ROOT}/package.json').version")"
rm -f "${DOCTRINE_JSON}"

run_doctrine_suite() {
  local TASK_SET="$1"
  echo "[3/4] Doctrine Lab suite: ${TASK_SET} (${#CATEGORIES[@]} categories, n=${TASKS_PER_CATEGORY})..."
  local AGG_ARGS=()
  local LAST_INDEX=$((${#CATEGORIES[@]} - 1))
  local i=0
  for category in "${CATEGORIES[@]}"; do
    local CAT_FILE="${TMP_DIR}/${TASK_SET}_${category}.json"
    echo "  -> ${TASK_SET}/${category}"
    local PAYLOAD
    if [ "${TASK_SET}" = "in_distribution" ]; then
      PAYLOAD=$(printf '{"model_a":"clawguard:beta9","model_b":"gpt-4o","category":"%s","tasks_per_category":%s,"save_report":true}' \
        "${category}" "${TASKS_PER_CATEGORY}")
    else
      PAYLOAD=$(printf '{"model_a":"clawguard:beta9","model_b":"gpt-4o","category":"%s","tasks_per_category":%s,"save_report":true,"task_set":"%s"}' \
        "${category}" "${TASKS_PER_CATEGORY}" "${TASK_SET}")
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
      --task-set "${TASK_SET}" \
      "${AGG_ARGS[@]}"
}

SUITE_OK=0
for TASK_SET in "${TASK_SETS[@]}"; do
  if run_doctrine_suite "${TASK_SET}"; then
    SUITE_OK=1
  fi
done

if [ "${SUITE_OK}" -eq 0 ]; then
  echo "All Doctrine Lab calls failed; rendering doc from local replay only."
  rm -f "${DOCTRINE_JSON}"
  node "${REPO_ROOT}/scripts/render-agent-benchmark.js"
  exit 0
fi

echo "[4/4] Rendering benchmark doc..."
node "${REPO_ROOT}/scripts/render-agent-benchmark.js"
echo "Done."
