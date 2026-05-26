#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

NAME="superglue-clawguardian"
WORKDIR="${CLAWGUARD_BENCH_CLONE_DIR:-/tmp/clawguard-bench-clones}/clawguardian"
REPO="https://github.com/superglue-ai/clawguardian.git"

if ! command -v node >/dev/null 2>&1; then
  write_skipped "$NAME" "node not found"
  exit 0
fi

if [ ! -d "$WORKDIR/.git" ]; then
  if ! git clone --depth 1 "$REPO" "$WORKDIR" 2>/dev/null; then
    write_skipped "$NAME" "git clone failed ($REPO)"
    exit 0
  fi
fi

SCAN_CMD=""
if [ -f "$WORKDIR/src/cli.js" ]; then
  (cd "$WORKDIR" && npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts 2>/dev/null) || true
  SCAN_CMD="node \"$WORKDIR/src/cli.js\" scan \"\$BUNDLE_PATH\" --json 2>/dev/null || node \"$WORKDIR/src/cli.js\" check \"\$BUNDLE_PATH\" --json 2>/dev/null"
elif [ -f "$WORKDIR/dist/cli.js" ]; then
  SCAN_CMD="node \"$WORKDIR/dist/cli.js\" scan \"\$BUNDLE_PATH\" --json"
fi

if [ -z "$SCAN_CMD" ]; then
  write_skipped "$NAME" "no CLI entrypoint found in clone"
  exit 0
fi

node "$(dirname "$0")/run-corpus.mjs" --name "$NAME" --scan-cmd "$SCAN_CMD"
