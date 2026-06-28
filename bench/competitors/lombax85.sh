#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

NAME="lombax85-clawguard"
WORKDIR="${CLAWGUARD_BENCH_CLONE_DIR:-/tmp/clawguard-bench-clones}/lombax85-clawguard"
REPO="https://github.com/lombax85/clawguard.git"

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
  SCAN_CMD="node \"$WORKDIR/src/cli.js\" scan \"\$BUNDLE_PATH\" --json"
elif [ -f "$WORKDIR/bin/clawguard.js" ]; then
  SCAN_CMD="node \"$WORKDIR/bin/clawguard.js\" scan \"\$BUNDLE_PATH\" --json"
fi

if [ -z "$SCAN_CMD" ]; then
  write_skipped "$NAME" "lombax85/clawguard is an outbound MITM proxy, not a skill-bundle scanner (no scan CLI)"
  exit 0
fi

node "$(dirname "$0")/run-corpus.mjs" --name "$NAME" --scan-cmd "$SCAN_CMD"
