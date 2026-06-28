#!/usr/bin/env bash
# Model-agnostic governance matrix.
#
# For each model X, runs a paired held-out-2 comparison:
#   model_a = ClawGuard governed envelope wrapping X (live runtime)
#   model_b = bare X (no governance)
# Same base model on both sides isolates what the governance layer contributes.
#
# Routing note: Doctrine Lab pins settings.NEXUS_AGENT_URL at startup, so model_a
# always hits whatever serves that port. We therefore run the live ClawGuard serve
# ON that exact port for each model (replacing any eval shim there).
#
# Usage:
#   ./scripts/run-model-agnostic-matrix.sh
#   MATRIX_MODELS="deepseek:deepseek-v4-flash openai:gpt-5-chat-latest" ./scripts/run-model-agnostic-matrix.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCTRINE_URL="${DOCTRINE_LAB_URL:-http://127.0.0.1:8000}"
DOCTRINE_LAB_ROOT_DEFAULT="$(dirname "$REPO_ROOT")/thinking-DT/doctrine-lab"
DOCTRINE_LAB_ROOT="${DOCTRINE_LAB_ROOT:-$DOCTRINE_LAB_ROOT_DEFAULT}"
DOCTRINE_ENV="${DOCTRINE_LAB_ROOT}/.env"
TASKS_PER_CATEGORY="${TASKS_PER_CATEGORY:-5}"
TASK_SET="${MATRIX_TASK_SET:-heldout2}"
CATEGORIES=(agent_safety agent_governance injection_resistance)
JUDGE_SLEEP="${MATRIX_JUDGE_SLEEP:-21}"

# Default matrix: provider:model entries. Chat-class models (accept temperature=0).
# Gemini is omitted by default because the free tier (20 req/day) exhausts mid-run; add it back
# with: MATRIX_MODELS="deepseek:deepseek-v4-flash openai:gpt-5-chat-latest gemini:gemini-2.5-flash"
MATRIX_MODELS="${MATRIX_MODELS:-deepseek:deepseek-v4-flash openai:gpt-5-chat-latest}"

MATRIX_DIR="${REPO_ROOT}/bench-results/matrix"
RAW_DIR="${MATRIX_DIR}/raw"
mkdir -p "${RAW_DIR}"

# Pull API keys (and NEXUS_AGENT_URL) from Doctrine's .env so the live serve can authenticate.
if [ -f "${DOCTRINE_ENV}" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${DOCTRINE_ENV}"
  set +a
fi

if ! curl -sf "${DOCTRINE_URL}/api/eval/tasks" >/dev/null 2>&1; then
  echo "Doctrine Lab not reachable at ${DOCTRINE_URL}. Start it first:"
  echo "  cd ${DOCTRINE_LAB_ROOT} && source venv/bin/activate && set -a && source .env && set +a"
  echo "  python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
  exit 1
fi

# Derive the port Doctrine routes model_a (clawguard) to.
NEXUS_URL="$(grep -E '^NEXUS_AGENT_URL=' "${DOCTRINE_ENV}" 2>/dev/null | cut -d= -f2- || true)"
NEXUS_URL="${NEXUS_URL:-http://127.0.0.1:9000/api/agent/run}"
SERVE_PORT="$(printf '%s' "${NEXUS_URL}" | sed -E 's#.*:([0-9]+).*#\1#')"
SERVE_HEALTH="http://127.0.0.1:${SERVE_PORT}/health"
echo "[matrix] Doctrine routes model_a -> port ${SERVE_PORT} (from NEXUS_AGENT_URL)."

PKG_VER="$(node -pe "require('${REPO_ROOT}/package.json').version")"
DOCTRINE_SHA="$(git -C "${DOCTRINE_LAB_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
JUDGE_PROVIDER="${JUDGE_PROVIDER:-openai}"
JUDGE_MODEL="${JUDGE_MODEL:-gpt-4o}"

LIVE_SERVE_PID=""
kill_serve_port() {
  local pids
  pids="$(lsof -ti "tcp:${SERVE_PORT}" 2>/dev/null || true)"
  if [ -n "${pids}" ]; then
    echo "  freeing port ${SERVE_PORT} (pids: ${pids})"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 1
  fi
}

cleanup() {
  if [ -n "${LIVE_SERVE_PID}" ]; then
    kill "${LIVE_SERVE_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

provider_has_key() {
  case "$1" in
    deepseek) [ -n "${DEEPSEEK_API_KEY:-}" ] ;;
    openai) [ -n "${OPENAI_API_KEY:-}" ] ;;
    gemini|google) [ -n "${GEMINI_API_KEY:-}" ] ;;
    anthropic) [ -n "${ANTHROPIC_API_KEY:-}" ] ;;
    openrouter) [ -n "${OPENROUTER_API_KEY:-}" ] ;;
    *) return 1 ;;
  esac
}

run_one_model() {
  local provider="$1"
  local model="$2"
  local slug
  slug="$(printf '%s' "${provider}:${model}" | tr '/:.' '___')"
  echo ""
  echo "[matrix] === ${provider} / ${model} ==="

  if ! provider_has_key "${provider}"; then
    echo "  SKIP: no API key for provider '${provider}'."
    return 1
  fi

  kill_serve_port
  echo "  starting live ClawGuard serve on :${SERVE_PORT} wrapping ${model}..."
  CLAWGUARD_AGENT_SERVE_MODE=live \
    CLAWGUARD_AGENT_SERVE_PORT="${SERVE_PORT}" \
    CLAWGUARD_LIVE_PROVIDER="${provider}" \
    CLAWGUARD_LIVE_MODEL="${model}" \
    node "${REPO_ROOT}/bin/clawguard-agent-serve.mjs" &
  LIVE_SERVE_PID=$!
  sleep 1
  if ! curl -sf "${SERVE_HEALTH}" 2>/dev/null | grep -q '"mode":"live"'; then
    echo "  ERROR: live serve did not come up healthy on :${SERVE_PORT}."
    kill "${LIVE_SERVE_PID}" 2>/dev/null || true
    LIVE_SERVE_PID=""
    return 1
  fi

  local manifest="${RAW_DIR}/${slug}.manifest"
  : >"${manifest}"
  local last=$((${#CATEGORIES[@]} - 1))
  local i=0
  for category in "${CATEGORIES[@]}"; do
    local out="${RAW_DIR}/${slug}__${category}.json"
    echo "  -> ${category}"
    local payload
    payload=$(printf '{"model_a":"clawguard:beta9","model_b":"%s","category":"%s","tasks_per_category":%s,"save_report":true,"task_set":"%s"}' \
      "${model}" "${category}" "${TASKS_PER_CATEGORY}" "${TASK_SET}")
    if curl -sf -X POST "${DOCTRINE_URL}/api/eval/report" \
        -H "Content-Type: application/json" -d "${payload}" >"${out}"; then
      printf '%s\t%s\n' "${category}" "${out}" >>"${manifest}"
    else
      echo "     (report call failed for ${category}; continuing)"
    fi
    if [ "$i" -lt "$last" ]; then
      sleep "${JUDGE_SLEEP}"
    fi
    i=$((i + 1))
  done

  kill "${LIVE_SERVE_PID}" 2>/dev/null || true
  LIVE_SERVE_PID=""
  printf '%s\t%s\t%s\n' "${provider}" "${model}" "${manifest}" >>"${MATRIX_DIR}/index.tsv"
}

: >"${MATRIX_DIR}/index.tsv"
ANY_OK=0
for entry in ${MATRIX_MODELS}; do
  provider="${entry%%:*}"
  model="${entry#*:}"
  if run_one_model "${provider}" "${model}"; then
    ANY_OK=1
  fi
done

if [ "${ANY_OK}" -eq 0 ]; then
  echo "[matrix] No models produced results."
  exit 1
fi

echo ""
echo "[matrix] Rendering comparison doc..."
PKG_VER="${PKG_VER}" DOCTRINE_SHA="${DOCTRINE_SHA}" \
  JUDGE_PROVIDER="${JUDGE_PROVIDER}" JUDGE_MODEL="${JUDGE_MODEL}" \
  TASK_SET="${TASK_SET}" \
  node "${REPO_ROOT}/scripts/render-model-matrix.mjs" \
    --index "${MATRIX_DIR}/index.tsv" \
    --out "${REPO_ROOT}/docs/MODEL_AGNOSTIC_GOVERNANCE.md" \
    --json "${MATRIX_DIR}/summary.json"
echo "[matrix] Done."
