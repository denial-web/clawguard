#!/usr/bin/env node
/**
 * Render docs/AGENT_BENCHMARK_v<version>.md from bench-results/.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

async function loadJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function pct(x) {
  return `${(Number(x || 0) * 100).toFixed(1)}%`;
}

function fmtScore(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) {
    return "—";
  }
  return Number(x).toFixed(2);
}

function normalizeDoctrine(raw) {
  if (!raw) {
    return null;
  }
  if (raw.in_distribution || raw.heldout) {
    return raw;
  }
  return { in_distribution: raw, heldout: null };
}

function localSection(local) {
  if (!local) {
    return [
      "## Local deterministic replay",
      "",
      "_Not generated. Run `npm run bench:agent` to produce `bench-results/agent-local.json`._",
      ""
    ].join("\n");
  }
  const wins = local.wins ?? { A: 0, B: 0, tie: 0 };
  const rows = (local.comparisons ?? [])
    .map((c) => `| ${c.task.category} | ${c.winner} | ${c.scoreA} | ${c.scoreB} |`)
    .join("\n");
  return [
    "## Local deterministic replay",
    "",
    "Compares the ClawGuard **eval shim** (regex-based, not the live LLM runtime) against a naive",
    "always-comply baseline using a structural safety score. Deterministic; no API keys.",
    "",
    `| Metric | ${local.model_a} | ${local.model_b} |`,
    "|--------|--------------|--------------|",
    `| Wins | ${wins.A} | ${wins.B} |`,
    `| Win rate | ${pct(local.win_rate_a)} | ${pct(local.win_rate_b)} |`,
    `| Ties | ${wins.tie} | — |`,
    `| Tasks | ${local.total_tasks} | ${local.total_tasks} |`,
    "",
    "### Per-task (structural safety score)",
    "",
    "| Category | Winner | ClawGuard score | Baseline score |",
    "|----------|--------|-----------------|----------------|",
    rows,
    "",
    "Regenerate: `npm run bench:agent`",
    ""
  ].join("\n");
}

function doctrineSuiteTable(suite, label) {
  if (!suite?.aggregate) {
    return [`### ${label}`, "", "_Not generated._", ""].join("\n");
  }
  const agg = suite.aggregate;
  const perCategory = (suite.per_category ?? [])
    .map((c) => {
      const sig = Number.isFinite(c.p_value) ? c.p_value.toFixed(4) : "n/a";
      const sigMark = c.statistically_significant ? "yes" : "no";
      return `| ${c.category} | ${c.wins_a} | ${c.wins_b} | ${c.ties} | ${fmtScore(c.avg_score_a)} | ${fmtScore(c.avg_score_b)} | ${sig} | ${sigMark} |`;
    })
    .join("\n");

  const pNote = agg.statistically_significant
    ? `Aggregate p=${agg.p_value} (significant at α=0.05 on decisive games only).`
    : `Aggregate p=${agg.p_value} — **not significant** at α=0.05 (decisive n=${agg.decisive_comparisons}, ties excluded from p-value).`;

  return [
    `### ${label}`,
    "",
    `| Metric | ${suite.model_a} | ${suite.model_b} |`,
    "|--------|---------------------|---------------------|",
    `| Wins | ${agg.wins_a} | ${agg.wins_b} |`,
    `| Win rate (of all tasks) | ${pct(agg.win_rate_a)} | ${pct(agg.win_rate_b)} |`,
    `| Ties | ${agg.ties} | — |`,
    `| Avg judge score | ${fmtScore(agg.avg_score_a)} | ${fmtScore(agg.avg_score_b)} |`,
    `| Tasks | ${agg.total_comparisons} | ${agg.total_comparisons} |`,
    `| Verdict | ${agg.verdict ?? "—"} | — |`,
    "",
    pNote,
    "",
    "| Category | A wins | B wins | Ties | A avg | B avg | p-value | sig? |",
    "|----------|--------|--------|------|-------|-------|---------|------|",
    perCategory,
    ""
  ].join("\n");
}

function doctrineSection(doctrineRaw) {
  const doctrine = normalizeDoctrine(doctrineRaw);
  if (!doctrine) {
    return [
      "## Doctrine Lab LLM-judge (vs `gpt-4o`)",
      "",
      "_Not generated. Start Doctrine Lab on `:8000`, configure judge keys, run",
      "`./scripts/run-agent-benchmark.sh`._",
      ""
    ].join("\n");
  }
  const judge = doctrine.doctrine_lab ?? doctrine.in_distribution?.doctrine_lab ?? {};
  const heldout = doctrine.heldout;
  const inDist = doctrine.in_distribution;

  const headline =
    heldout?.aggregate != null
      ? `**Headline (held-out paraphrases):** ClawGuard ${heldout.aggregate.wins_a}–${heldout.aggregate.wins_b}–${heldout.aggregate.ties} (n=${heldout.aggregate.total_comparisons}). Skeptics should weight this row over in-distribution prompts.`
      : inDist?.aggregate != null
        ? `**Latest in-distribution run:** ${inDist.aggregate.wins_a}–${inDist.aggregate.wins_b}–${inDist.aggregate.ties} (n=${inDist.aggregate.total_comparisons}).`
        : "";

  return [
    "## Doctrine Lab LLM-judge (vs `gpt-4o`)",
    "",
    "Eval mode uses `bin/clawguard-agent-serve.mjs` with the **deterministic regex eval shim**,",
    "not the live governed LLM runtime. Both competitors receive the same governance JSON schema",
    "in the category system prompt. Methodology: OpenAI `gpt-4o` at **temperature 0.0**,",
    "position-debiased judge, **symmetric blinding** of `model` / `runtime_attestation` /",
    "`policy_version` before scoring.",
    "",
    `- Doctrine Lab commit: \`${judge.sha ?? "unknown"}\``,
    `- Shim URL: \`${judge.serve_url ?? "unknown"}\``,
    `- Judge: \`${judge.judge_provider ?? "unknown"}\` / \`${judge.judge_model ?? "unknown"}\``,
    "",
    headline,
    "",
    doctrineSuiteTable(inDist, "In-distribution prompts (co-designed with eval-shim regexes)"),
    doctrineSuiteTable(heldout, "Held-out paraphrases (not 1:1 with shim regexes)"),
    "",
    "Regenerate: `./scripts/run-agent-benchmark.sh`",
    ""
  ].join("\n");
}

function header(version) {
  return [
    `# ClawGuard governance-schema compliance benchmark (v${version})`,
    "",
    "Measures **governance JSON schema fidelity** — not general model intelligence or live-runtime",
    "quality. Two signals:",
    "",
    "1. **Local replay** — deterministic eval shim vs naive always-comply baseline (structural score).",
    "2. **Doctrine Lab** — head-to-head vs `gpt-4o` with shared schema, blinded judge inputs,",
    "   in-distribution and held-out prompt suites.",
    "",
    "Artifacts: `bench-results/agent-local.json`, `bench-results/agent-doctrine.json`.",
    "Rendered by `scripts/render-agent-benchmark.js` — do not hand-edit.",
    ""
  ].join("\n");
}

function footer() {
  return [
    "## How to reproduce",
    "",
    "```bash",
    "npm run bench:agent",
    "npm run agent:serve",
    "./scripts/run-agent-benchmark.sh",
    "```",
    "",
    "## Honest framing",
    "",
    "- **What is measured:** schema compliance and governance-metadata completeness under",
    "  adversarial prompts, judged by an LLM (`gpt-4o-mini` by default).",
    "- **What is not measured:** production ClawGuard agent quality, latency, or tool-use safety.",
    "- **Eval shim:** regex rules in `src/agent/eval-shim.js`; in-distribution prompts overlap",
    "  those patterns. Held-out paraphrases test generalization without re-tuning regexes.",
    "- **Fairness controls:** temperature 0.0 for both sides, symmetric metadata blinding,",
    "  p-values on decisive games only (ties excluded). No category reached p<0.05 unless",
    "  your re-run says otherwise — treat win rates as directional.",
    "- **Do not use as a marketing headline.** Publish re-runs with your own keys and tasks.",
    ""
  ].join("\n");
}

async function main() {
  const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const local = await loadJson(path.join(repoRoot, "bench-results", "agent-local.json"));
  const doctrine = await loadJson(path.join(repoRoot, "bench-results", "agent-doctrine.json"));

  const md = [header(pkg.version), localSection(local), doctrineSection(doctrine), footer()].join("\n");
  const outPath = path.join(repoRoot, "docs", "AGENT_BENCHMARK_v1.0.0-beta.9.md");
  await writeFile(outPath, md, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
