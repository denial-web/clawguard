#!/usr/bin/env bash
# Run superglue-ai/clawguardian when clone + CLI are available.
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
if [ -f "$WORKDIR/package.json" ]; then
  if [ -f "$WORKDIR/src/cli.js" ]; then
    SCAN_CMD="node $WORKDIR/src/cli.js"
  elif [ -f "$WORKDIR/dist/cli.js" ]; then
    SCAN_CMD="node $WORKDIR/dist/cli.js"
  fi
fi

if [ -z "$SCAN_CMD" ]; then
  write_skipped "$NAME" "no CLI entrypoint found in clone"
  exit 0
fi

(cd "$WORKDIR" && npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts 2>/dev/null) || true

runs=()
while IFS= read -r line; do
  id="$(node -pe "JSON.parse(process.argv[1]).id" "$line")"
  bundle="$(node -pe "JSON.parse(process.argv[1]).bundlePath" "$line")"
  label="$(node -pe "JSON.parse(process.argv[1]).label" "$line")"
  target="${REPO_ROOT}/${bundle}"
  set +e
  out="$($SCAN_CMD scan "$target" --json 2>/dev/null || $SCAN_CMD check "$target" --json 2>/dev/null)"
  code=$?
  set -e
  decision="$(echo "$out" | node -pe "
    try {
      const j=JSON.parse(process.argv[1]);
      const d=j.decision ?? j.policy?.decision ?? j.result ?? '';
      const m={allow:'allow',block:'block',warn:'manual_review',review:'manual_review'};
      console.log(m[String(d).toLowerCase()] ?? 'unknown');
    } catch { console.log('unknown'); }
  " "$out" 2>/dev/null || echo unknown)"
  runs+=("$(node -pe "JSON.stringify({id:'$id',bundlePath:'$bundle',label:'$label',exitCode:$code,decision:'$decision'})")")
done < <(node -pe "JSON.parse(require('fs').readFileSync('$TRUTH','utf8')).entries.map(e=>JSON.stringify(e)).join('\n')")

OUT="${RESULTS_DIR}/superglue-clawguardian.json"
node -pe "
const runs=process.argv.slice(1).map(JSON.parse);
const tp=runs.filter(r=>r.label==='risky'&&r.decision!=='allow').length;
const fn=runs.filter(r=>r.label==='risky'&&r.decision==='allow').length;
const fp=runs.filter(r=>r.label==='safe'&&r.decision!=='allow').length;
const tn=runs.filter(r=>r.label==='safe'&&r.decision==='allow').length;
const precision=tp+fp?tp/(tp+fp):1;
const recall=tp+fn?tp/(tp+fn):1;
JSON.stringify({
  schemaVersion:'clawguard.scanner-benchmark.v1',
  status:'completed',
  competitor:'$NAME',
  generatedAt:new Date().toISOString(),
  aggregate:{truePositives:tp,falsePositives:fp,trueNegatives:tn,falseNegatives:fn,precision:Math.round(precision*1000)/1000,recall:Math.round(recall*1000)/1000},
  runs
},null,2)
" "${runs[@]}" >"$OUT"
echo "Wrote $OUT"
