#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

NAME="yourclaw-scanner"
PKG="${CLAWGUARD_BENCH_YOURCLAW_PKG:-@yourclaw/clawguard-scanner}"

if ! command -v npx >/dev/null 2>&1; then
  write_skipped "$NAME" "npx not found"
  exit 0
fi

if ! npx --yes --package "$PKG" --help >/dev/null 2>&1; then
  write_skipped "$NAME" "package not installable ($PKG)"
  exit 0
fi

SCAN_CMD="npx --yes --package $PKG clawguard-scanner scan \"\$BUNDLE_PATH\" --json 2>/dev/null || npx --yes --package $PKG scan \"\$BUNDLE_PATH\" --json 2>/dev/null"
node "$(dirname "$0")/run-corpus.mjs" --name "$NAME" --scan-cmd "$SCAN_CMD"
