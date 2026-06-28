#!/usr/bin/env node
/**
 * Render docs/SCANNER_BENCHMARK.md and docs-site/scanner-benchmark.html from bench-results/*.json
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const resultsDir = path.join(repoRoot, "bench-results");
const docsMd = path.join(repoRoot, "docs", "SCANNER_BENCHMARK.md");
const pagesHtml = path.join(repoRoot, "docs-site", "scanner-benchmark.html");

async function main() {
  const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  const files = await listResultFiles();
  const clawguard = files.find((f) => /^clawguard-/.test(f.name) && f.name.endsWith(".json"));
  const competitors = files.filter(
    (f) => !/^clawguard-/.test(f.name) && f.name.endsWith(".json") && !f.name.includes("doctrine-traces")
  );

  if (!clawguard) {
    throw new Error("Missing bench-results/clawguard-<version>.json — run npm run bench:scanner first.");
  }

  const primary = clawguard.data;
  const comparison = competitors.map((c) => ({ file: c.name, ...c.data }));

  const md = renderMarkdown(pkg.version, primary, comparison);
  const html = renderHtml(pkg.version, primary, comparison);

  await fs.mkdir(path.dirname(docsMd), { recursive: true });
  await fs.mkdir(path.dirname(pagesHtml), { recursive: true });
  await fs.writeFile(docsMd, md, "utf8");
  await fs.writeFile(pagesHtml, html, "utf8");
  console.log(`Wrote ${docsMd}`);
  console.log(`Wrote ${pagesHtml}`);
}

async function listResultFiles() {
  let names = [];
  try {
    names = await fs.readdir(resultsDir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const text = await fs.readFile(path.join(resultsDir, name), "utf8");
    out.push({ name, data: JSON.parse(text) });
  }
  return out;
}

function renderMarkdown(version, primary, comparison) {
  const agg = primary.aggregate ?? {};
  const lines = [
    "# ClawGuard Scanner Benchmark",
    "",
    `Generated from \`bench/corpus/truth.json\` against **@denial-web/clawguard@${version}** (\`clawguard check --policy governed --json\`).`,
    "",
    "Reproduce locally:",
    "",
    "```bash",
    "npm run bench:scanner",
    "npm run bench:competitors   # optional; skips cleanly when clones/packages unavailable",
    "npm run bench:render",
    "```",
    "",
    "## Summary (expected decision — primary)",
    "",
    "Each bundle has an explicit expected `allow` / `manual_review` / `block` in `bench/corpus/truth.json`.",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Corpus entries | ${primary.entryCount ?? primary.runs?.length ?? 0} |`,
    `| Decision accuracy | ${pct(primary.aggregateExpected?.accuracy ?? agg.exactDecisionRate)} |`,
    `| Correct | ${primary.aggregateExpected?.correct ?? agg.exactDecisionMatches ?? 0} / ${primary.aggregateExpected?.total ?? primary.entryCount ?? 0} |`,
    "",
    "## Summary (risky catch — secondary)",
    "",
    "Treats **risky** as positive; **caught** = `block` or `manual_review`. Safe bundles that correctly get `manual_review` count as false positives here (governed hygiene, not misses).",
    "",
    "| Metric | Value |",
    "|--------|-------|",
    `| Precision | ${pct(agg.precision)} |`,
    `| Recall | ${pct(agg.recall)} |`,
    `| F1 | ${pct(agg.f1)} |`,
    `| False positive rate (safe must be allow) | ${pct(agg.falsePositiveRate)} |`,
    "",
    "Confusion matrix (risky = positive class, caught = block or manual_review):",
    "",
    "| | Predicted caught | Predicted allow |",
    "|--|------------------|-----------------|",
    `| Actually risky | ${agg.truePositives ?? 0} (TP) | ${agg.falseNegatives ?? 0} (FN) |`,
    `| Actually safe | ${agg.falsePositives ?? 0} (FP) | ${agg.trueNegatives ?? 0} (TN) |`,
    "",
    "## Per-bundle results",
    "",
    "| Bundle | Label | Expected | Actual | Match |",
    "|--------|-------|----------|--------|-------|",
    ...(primary.runs ?? []).map((r) => {
      const match = r.metrics?.exactMatch ? "yes" : "no";
      return `| \`${r.id}\` | ${r.label} | ${r.expectedDecision} | ${r.actual?.decision ?? "error"} | ${match} |`;
    }),
    ""
  ];

  const fpRules = (primary.perRule ?? []).filter((r) => r.falsePositiveExamples?.length > 0);
  if (fpRules.length > 0) {
    lines.push("## False-positive audit (safe-labeled bundles)", "");
    for (const rule of fpRules) {
      lines.push(`### \`${rule.ruleId}\` (${rule.count} findings in corpus)`, "");
      for (const ex of rule.falsePositiveExamples) {
        lines.push(`- **${ex.bundleId}** — \`${ex.file}\`: ${ex.evidence}`);
      }
      lines.push("");
    }
  }

  lines.push("## Competitor comparison (opt-in)", "");
  if (comparison.length === 0) {
    lines.push("_No competitor result files in `bench-results/`. Run `npm run bench:competitors`._", "");
  } else {
    lines.push("| Scanner | Status | Precision | Recall | Notes |", "|---------|--------|-----------|--------|-------|");
    for (const row of comparison) {
      if (row.status === "skipped") {
        lines.push(`| ${row.competitor ?? row.file} | skipped | n/a | n/a | ${row.reason ?? ""} |`);
        continue;
      }
      const a = row.aggregate ?? {};
      lines.push(
        `| ${row.competitor ?? row.file} | ${row.status ?? "completed"} | ${pct(a.precision)} | ${pct(a.recall)} | |`
      );
    }
    lines.push("");
  }

  lines.push(
    "## Hosted report",
    "",
    "HTML mirror: [scanner-benchmark.html](https://denial-web.github.io/clawguard/scanner-benchmark.html)",
    "",
    "## Methodology",
    "",
    "- **Safe** bundles should receive `allow` under governed policy (some benign bundles correctly surface `manual_review` for plugin/code-exec hygiene; see expectedDecision in truth.json).",
    "- **Risky** bundles should be **caught** (`block` or `manual_review`), not `allow`.",
    "- Competitor adapters never fabricate scores; failed installs are recorded as `skipped`.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function renderHtml(version, primary, comparison) {
  const agg = primary.aggregate ?? {};
  const expectedAcc = primary.aggregateExpected?.accuracy ?? agg.exactDecisionRate ?? 0;
  const rows = (primary.runs ?? [])
    .map(
      (r) =>
        `<tr><td><code>${esc(r.id)}</code></td><td>${esc(r.label)}</td><td>${esc(r.expectedDecision)}</td><td>${esc(r.actual?.decision)}</td><td>${r.metrics?.exactMatch ? "yes" : "no"}</td></tr>`
    )
    .join("\n");

  const compRows = comparison
    .map((row) => {
      if (row.status === "skipped") {
        return `<tr><td>${esc(row.competitor ?? row.file)}</td><td>skipped</td><td colspan="2">${esc(row.reason)}</td></tr>`;
      }
      const a = row.aggregate ?? {};
      return `<tr><td>${esc(row.competitor ?? row.file)}</td><td>${esc(row.status ?? "completed")}</td><td>${pct(a.precision)}</td><td>${pct(a.recall)}</td></tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>ClawGuard Scanner Benchmark</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
    th { background: #f4f4f4; }
    code { background: #f4f4f4; padding: 0.05rem 0.3rem; border-radius: 3px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; }
    .metric { border: 1px solid #ddd; padding: 1rem; border-radius: 6px; }
    .metric strong { display: block; font-size: 1.4rem; }
  </style>
</head>
<body>
  <h1>ClawGuard Scanner Benchmark</h1>
  <p>Version <code>@denial-web/clawguard@${esc(version)}</code> · policy <code>governed</code> · generated ${esc(primary.generatedAt ?? "")}</p>
  <div class="metrics">
    <div class="metric"><span>Decision accuracy</span><strong>${pct(expectedAcc)}</strong></div>
    <div class="metric"><span>Risky recall</span><strong>${pct(agg.recall)}</strong></div>
    <div class="metric"><span>Risky precision</span><strong>${pct(agg.precision)}</strong></div>
    <div class="metric"><span>Safe strict-FPR</span><strong>${pct(agg.falsePositiveRate)}</strong></div>
  </div>
  <h2>Per-bundle</h2>
  <table>
    <thead><tr><th>Bundle</th><th>Label</th><th>Expected</th><th>Actual</th><th>Exact</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>Competitors</h2>
  <table>
    <thead><tr><th>Scanner</th><th>Status</th><th>Precision</th><th>Recall</th></tr></thead>
    <tbody>${compRows || "<tr><td colspan=\"4\">No competitor runs</td></tr>"}</tbody>
  </table>
  <p><a href="./">Schema index</a> · <a href="https://github.com/denial-web/clawguard/blob/main/docs/SCANNER_BENCHMARK.md">Markdown source</a></p>
</body>
</html>`;
}

function pct(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "n/a";
  }
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
