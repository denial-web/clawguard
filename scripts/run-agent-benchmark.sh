#!/usr/bin/env bash
# Capture Doctrine Lab agent benchmark when GEMINI_API_KEY and services are available.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCTRINE_URL="${DOCTRINE_LAB_URL:-http://127.0.0.1:8000}"
SERVE_PORT="${CLAWGUARD_AGENT_SERVE_PORT:-9000}"
OUT_MD="${REPO_ROOT}/docs/AGENT_BENCHMARK_v1.0.0-beta.9.md"
REPORT_DIR="${DOCTRINE_LAB_REPORT_DIR:-/tmp/doctrine-lab-reports}"

if ! curl -sf "${DOCTRINE_URL}/api/eval/tasks" >/dev/null 2>&1; then
  echo "Doctrine Lab not reachable at ${DOCTRINE_URL}; generating local replay instead."
  node "${REPO_ROOT}/scripts/agent-benchmark-local.js"
  exit 0
fi

echo "Starting clawguard agent serve on port ${SERVE_PORT}..."
CLAWGUARD_AGENT_SERVE_MODE=eval node "${REPO_ROOT}/bin/clawguard-agent-serve.mjs" &
SERVE_PID=$!
trap 'kill ${SERVE_PID} 2>/dev/null || true' EXIT
sleep 1

export NEXUS_AGENT_URL="http://127.0.0.1:${SERVE_PORT}/api/agent/run"

echo "Running clawguard_beta9_safety preset..."
curl -sf -X POST "${DOCTRINE_URL}/api/eval/preset/clawguard_beta9_safety" -H "Content-Type: application/json" -d '{}' >/tmp/clawguard-preset.json

echo "Generating report (gpt-4o head-to-head)..."
curl -sf -X POST "${DOCTRINE_URL}/api/eval/report" \
  -H "Content-Type: application/json" \
  -d '{"model_a":"clawguard:beta9","model_b":"gpt-4o","save_report":true}' >/tmp/clawguard-report.json

DOCTRINE_SHA="$(git -C "${DOCTRINE_LAB_ROOT:-$(dirname "$REPO_ROOT")/thinking-DT/doctrine-lab}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
PKG_VER="$(node -pe "require('${REPO_ROOT}/package.json').version")"

if [ -f "${REPORT_DIR}/benchmark_report.md" ]; then
  {
    echo "# ClawGuard Agent Benchmark (v${PKG_VER})"
    echo ""
    echo "## How this was generated"
    echo ""
    echo "- Doctrine Lab preset: \`clawguard_beta9_safety\`"
    echo "- Doctrine Lab commit: \`${DOCTRINE_SHA}\`"
    echo "- ClawGuard shim: \`bin/clawguard-agent-serve.mjs\` at \`${NEXUS_AGENT_URL}\`"
    echo "- Judge: Gemini via Doctrine Lab (\`GEMINI_API_KEY\` required)"
    echo ""
    cat "${REPORT_DIR}/benchmark_report.md"
  } >"${OUT_MD}"
  echo "Wrote ${OUT_MD} from Doctrine Lab report"
else
  echo "Doctrine Lab report files not found; falling back to local replay."
  node "${REPO_ROOT}/scripts/agent-benchmark-local.js"
fi
