#!/usr/bin/env bash
# Capture the full ClawGuard agent benchmark.
#
# Two artifacts are written into bench-results/:
#   - agent-local.json     (deterministic structural-safety replay vs naive-comply)
#   - agent-doctrine.json  (Doctrine Lab LLM-judge head-to-head vs gpt-4o)
#
# Then scripts/render-agent-benchmark.js folds both into docs/AGENT_BENCHMARK_v*.md.
#
# Doctrine Lab must be reachable on $DOCTRINE_LAB_URL (default http://127.0.0.1:8000)
# with GEMINI_API_KEY or OPENAI_API_KEY configured in its .env. If Doctrine Lab is
# down, only the local replay artifact is produced.
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

mkdir -p "${BENCH_DIR}"

echo "[1/3] Running local deterministic replay..."
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
  echo "[2/3] Using existing clawguard-agent-serve at ${SERVE_URL}"
else
  echo "[2/3] Starting clawguard-agent-serve on port ${SERVE_PORT}..."
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

echo "[3/3] Running Doctrine Lab reports across ${#CATEGORIES[@]} categories..."
AGG_ARGS=()
LAST_INDEX=$((${#CATEGORIES[@]} - 1))
for i in "${!CATEGORIES[@]}"; do
  category="${CATEGORIES[$i]}"
  CAT_FILE="${TMP_DIR}/${category}.json"
  echo "  -> ${category} (n=${TASKS_PER_CATEGORY})"
  PAYLOAD=$(printf '{"model_a":"clawguard:beta9","model_b":"gpt-4o","category":"%s","tasks_per_category":%s,"save_report":true}' \
    "${category}" "${TASKS_PER_CATEGORY}")
  if ! curl -sf -X POST "${DOCTRINE_URL}/api/eval/report" \
      -H "Content-Type: application/json" \
      -d "${PAYLOAD}" >"${CAT_FILE}"; then
    echo "     (curl failed for ${category}; continuing)"
    continue
  fi
  AGG_ARGS+=("--input" "${category}=${CAT_FILE}")
  if [ "$i" -lt "$LAST_INDEX" ]; then
    # Doctrine Lab rate-limits /api/eval/report to 3/minute. Stay under it.
    sleep 21
  fi
done

if [ "${#AGG_ARGS[@]}" -eq 0 ]; then
  echo "All Doctrine Lab calls failed; rendering doc from local replay only."
  rm -f "${DOCTRINE_JSON}"
  node "${REPO_ROOT}/scripts/render-agent-benchmark.js"
  exit 0
fi

PKG_VER="$(node -pe "require('${REPO_ROOT}/package.json').version")"
JUDGE_PROVIDER="${JUDGE_PROVIDER}" JUDGE_MODEL="${JUDGE_MODEL}" \
  DOCTRINE_SHA="${DOCTRINE_SHA}" SERVE_URL="${NEXUS_AGENT_URL}" PKG_VER="${PKG_VER}" \
  node "${REPO_ROOT}/scripts/aggregate-doctrine-reports.mjs" \
    --out "${DOCTRINE_JSON}" "${AGG_ARGS[@]}"

node "${REPO_ROOT}/scripts/render-agent-benchmark.js"
echo "Done."
