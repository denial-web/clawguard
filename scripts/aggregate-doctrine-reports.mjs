#!/usr/bin/env node
/**
 * Aggregate Doctrine Lab per-category report responses into a single JSON
 * artifact for the ClawGuard agent benchmark.
 *
 * Usage:
 *   aggregate-doctrine-reports.mjs --out <path> <category1.json> ...
 *
 * Each input file is the raw response from POST /api/eval/report
 * shaped { status, report }. We pull report.summary, report.average_scores,
 * report.confidence_intervals, report.head_to_head.detailed_results, etc.
 */
import { readFile, writeFile } from "node:fs/promises";

function parseArgs(argv) {
  const out = { inputs: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      out.outPath = argv[i + 1];
      i += 1;
    } else if (arg === "--input") {
      const spec = argv[i + 1] ?? "";
      const [category, file] = spec.split("=");
      if (!category || !file) {
        throw new Error(`--input expects category=path, got: ${spec}`);
      }
      out.inputs.push({ category, file });
      i += 1;
    } else {
      out.inputs.push({ category: null, file: arg });
    }
  }
  return out;
}

function asNum(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function loadReport(file) {
  const raw = await readFile(file, "utf8");
  const json = JSON.parse(raw);
  return json.report ?? json;
}

function summarizeCategory(report, fallbackCategory) {
  const summary = report?.summary ?? {};
  const avg = report?.average_scores ?? {};
  const h2h = report?.head_to_head ?? {};
  const wins_a = asNum(summary.wins_a, 0);
  const wins_b = asNum(summary.wins_b, 0);
  const ties = asNum(summary.ties, 0);
  const computedTotal = wins_a + wins_b + ties;
  const total = asNum(summary.total_comparisons, computedTotal);
  return {
    category: report?.category ?? summary.category ?? fallbackCategory ?? null,
    total_comparisons: total,
    wins_a,
    wins_b,
    ties,
    win_rate_a: total > 0 ? wins_a / total : 0,
    win_rate_b: total > 0 ? wins_b / total : 0,
    avg_score_a: asNum(avg.model_a, 0),
    avg_score_b: asNum(avg.model_b, 0),
    p_value: asNum(summary.p_value, NaN),
    statistically_significant: summary.statistically_significant === true,
    verdict: summary.verdict ?? h2h.verdict ?? null
  };
}

function buildAggregate(perCategory) {
  const totals = {
    total_comparisons: 0,
    wins_a: 0,
    wins_b: 0,
    ties: 0,
    score_sum_a: 0,
    score_sum_b: 0
  };
  for (const c of perCategory) {
    totals.total_comparisons += c.total_comparisons;
    totals.wins_a += c.wins_a;
    totals.wins_b += c.wins_b;
    totals.ties += c.ties;
    totals.score_sum_a += c.avg_score_a * c.total_comparisons;
    totals.score_sum_b += c.avg_score_b * c.total_comparisons;
  }
  const n = totals.total_comparisons || 1;
  return {
    total_comparisons: totals.total_comparisons,
    wins_a: totals.wins_a,
    wins_b: totals.wins_b,
    ties: totals.ties,
    win_rate_a: totals.wins_a / n,
    win_rate_b: totals.wins_b / n,
    avg_score_a: totals.score_sum_a / n,
    avg_score_b: totals.score_sum_b / n
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outPath || args.inputs.length === 0) {
    console.error("usage: aggregate-doctrine-reports.mjs --out <path> <file1.json> [file2.json ...]");
    process.exit(2);
  }

  const reports = [];
  for (const { category, file } of args.inputs) {
    const report = await loadReport(file);
    reports.push({ source: file, category, report });
  }

  const perCategory = reports.map(({ category, report }) => summarizeCategory(report, category));
  const aggregate = buildAggregate(perCategory);

  const detail = reports.map(({ source, category, report }) => ({
    source,
    category: report?.category ?? category ?? null,
    summary: summarizeCategory(report, category),
    confidence_intervals: report?.confidence_intervals ?? null,
    per_task: (report?.head_to_head?.detailed_results ?? []).map((row) => ({
      task_id: row.task_id,
      category: row.category,
      winner: row.winner,
      score_a: asNum(row.score_a, null),
      score_b: asNum(row.score_b, null)
    }))
  }));

  const out = {
    generated_at: new Date().toISOString(),
    package_version: process.env.PKG_VER ?? null,
    doctrine_lab: {
      sha: process.env.DOCTRINE_SHA ?? null,
      serve_url: process.env.SERVE_URL ?? null,
      judge_provider: process.env.JUDGE_PROVIDER ?? null,
      judge_model: process.env.JUDGE_MODEL ?? null
    },
    model_a: "clawguard:beta9",
    model_b: "gpt-4o",
    categories: perCategory.map((c) => c.category).filter(Boolean),
    aggregate,
    per_category: perCategory,
    detail
  };

  await writeFile(args.outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${args.outPath}`);
  console.log(
    `Aggregate: A=${aggregate.wins_a}, B=${aggregate.wins_b}, ties=${aggregate.ties}` +
      ` (n=${aggregate.total_comparisons})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
