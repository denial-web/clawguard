#!/usr/bin/env bash
# Run yourclaw/clawguard-scanner when the package is installable.
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

runs=()
while IFS= read -r line; do
  id="$(node -pe "JSON.parse(process.argv[1]).id" "$line")"
  bundle="$(node -pe "JSON.parse(process.argv[1]).bundlePath" "$line")"
  label="$(node -pe "JSON.parse(process.argv[1]).label" "$line")"
  target="${REPO_ROOT}/${bundle}"
  set +e
  out="$(npx --yes --package "$PKG" clawguard-scanner scan "$target" --json 2>/dev/null || npx --yes --package "$PKG" scan "$target" --json 2>/dev/null)"
  code=$?
  set -e
  decision="$(echo "$out" | node -pe "
    try {
      const j=JSON.parse(process.argv[1]);
      const d=j.decision ?? j.policy?.decision ?? j.risk ?? '';
      const m={allow:'allow',block:'block',warn:'manual_review',review:'manual_review'};
      console.log(m[String(d).toLowerCase()] ?? 'unknown');
    } catch { console.log('unknown'); }
  " "$out" 2>/dev/null || echo unknown)"
  runs+=("$(node -pe "JSON.stringify({id:'$id',bundlePath:'$bundle',label:'$label',exitCode:$code,decision:'$decision'})")")
done < <(node -pe "JSON.parse(require('fs').readFileSync('$TRUTH','utf8')).entries.map(e=>JSON.stringify(e)).join('\n')")

OUT="${RESULTS_DIR}/yourclaw-scanner.json"
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
