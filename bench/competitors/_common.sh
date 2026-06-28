#!/usr/bin/env bash
# Shared helpers for competitor scanner adapters.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRUTH="${REPO_ROOT}/bench/corpus/truth.json"
RESULTS_DIR="${REPO_ROOT}/bench-results"
POLICY="${CLAWGUARD_BENCH_POLICY:-governed}"

mkdir -p "$RESULTS_DIR"

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-'
}

write_skipped() {
  local name="$1"
  local reason="$2"
  local out="${RESULTS_DIR}/$(slugify "$name")-skipped.json"
  cat >"$out" <<EOF
{
  "schemaVersion": "clawguard.scanner-benchmark.v1",
  "status": "skipped",
  "competitor": "$name",
  "reason": "$reason",
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  echo "Skipped $name: $reason (wrote $out)"
}

normalize_decision() {
  local raw="${1:-}"
  local lower
  lower="$(echo "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    allow|pass|ok|safe|clean) echo "allow" ;;
    block|deny|reject|fail|failed|critical) echo "block" ;;
    warn|warning|review|manual_review|manual|sandbox) echo "manual_review" ;;
    *) echo "unknown" ;;
  esac
}
