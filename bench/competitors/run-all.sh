#!/usr/bin/env bash
set -euo pipefail
DIR="$(dirname "$0")"
chmod +x "$DIR"/*.sh 2>/dev/null || true
"$DIR/lombax85.sh" || true
"$DIR/yourclaw.sh" || true
"$DIR/superglue.sh" || true
