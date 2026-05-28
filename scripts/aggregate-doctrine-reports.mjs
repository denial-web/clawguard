#!/usr/bin/env node
/**
 * Aggregate Doctrine Lab per-category report responses into a single JSON
 * artifact for the ClawGuard agent benchmark.
 *
 * Usage:
 *   aggregate-doctrine-reports.mjs --out <path> [--task-set <name>]
 *     --input category=path ...
 */
import { readFile, writeFile } from "node:fs/promises";

function parseArgs(argv) {
  const out = { inputs: [], taskSet: "in_distribution" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      out.outPath = argv[i + 1];
      i += 1;
    } else if (arg === "--task-set") {
      out.taskSet = argv[i + 1] ?? "in_distribution";
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

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
  return sign * y;
}

/** Binomial test (decisive wins only; ties excluded from denominator). */
export function binomialTestPvalue(winsA, winsB) {
  const total = winsA + winsB;
  if (total === 0) {
    return 1;
  }
  const pHat = winsA / total;
  const z = (pHat - 0.5) / Math.sqrt(0.25 / total);
  return Math.round(2 * (1 - normalCdf(Math.abs(z))) * 1_000_000) / 1_000_000;
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
  const decisive = asNum(summary.decisive_comparisons, wins_a + wins_b);
  const p_value = Number.isFinite(summary.p_value)
    ? summary.p_value
    : binomialTestPvalue(wins_a, wins_b);
  const statistically_significant = summary.statistically_significant === true || p_value < 0.05;
  let verdict = summary.verdict ?? h2h.verdict ?? null;
  if (verdict && !statistically_significant && /significantly better/i.test(verdict)) {
    verdict = verdict.replace(/significantly better/gi, "directionally better");
  }
  return {
    category: report?.category ?? summary.category ?? fallbackCategory ?? null,
    total_comparisons: total,
    decisive_comparisons: decisive,
    wins_a,
    wins_b,
    ties,
    win_rate_a: total > 0 ? wins_a / total : 0,
    win_rate_b: total > 0 ? wins_b / total : 0,
    avg_score_a: asNum(avg.model_a, 0),
    avg_score_b: asNum(avg.model_b, 0),
    p_value,
    statistically_significant,
    verdict
  };
}

function buildAggregate(perCategory) {
  const totals = {
    total_comparisons: 0,
    decisive_comparisons: 0,
    wins_a: 0,
    wins_b: 0,
    ties: 0,
    score_sum_a: 0,
    score_sum_b: 0
  };
  for (const c of perCategory) {
    totals.total_comparisons += c.total_comparisons;
    totals.decisive_comparisons += c.decisive_comparisons;
    totals.wins_a += c.wins_a;
    totals.wins_b += c.wins_b;
    totals.ties += c.ties;
    totals.score_sum_a += c.avg_score_a * c.total_comparisons;
    totals.score_sum_b += c.avg_score_b * c.total_comparisons;
  }
  const n = totals.total_comparisons || 1;
  const p_value = binomialTestPvalue(totals.wins_a, totals.wins_b);
  const statistically_significant = p_value < 0.05;
  let verdict = null;
  if (totals.wins_a > totals.wins_b && statistically_significant) {
    verdict = "clawguard:beta9 is significantly better";
  } else if (totals.wins_a > totals.wins_b) {
    verdict = "clawguard:beta9 is directionally better";
  } else if (totals.wins_b > totals.wins_a && statistically_significant) {
    verdict = "gpt-4o is significantly better";
  } else if (totals.wins_b > totals.wins_a) {
    verdict = "gpt-4o is directionally better";
  } else {
    verdict = "No significant difference";
  }
  return {
    total_comparisons: totals.total_comparisons,
    decisive_comparisons: totals.decisive_comparisons,
    wins_a: totals.wins_a,
    wins_b: totals.wins_b,
    ties: totals.ties,
    win_rate_a: totals.wins_a / n,
    win_rate_b: totals.wins_b / n,
    avg_score_a: totals.score_sum_a / n,
    avg_score_b: totals.score_sum_b / n,
    p_value,
    statistically_significant,
    verdict
  };
}

export function buildSuiteArtifact({ taskSet, reports, meta }) {
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

  return {
    task_set: taskSet,
    generated_at: meta.generated_at,
    package_version: meta.package_version,
    doctrine_lab: meta.doctrine_lab,
    model_a: "clawguard:beta9",
    model_b: "gpt-4o",
    categories: perCategory.map((c) => c.category).filter(Boolean),
    aggregate,
    per_category: perCategory,
    detail
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outPath || args.inputs.length === 0) {
    console.error(
      "usage: aggregate-doctrine-reports.mjs --out <path> [--task-set name] --input category=path ..."
    );
    process.exit(2);
  }

  const reports = [];
  for (const { category, file } of args.inputs) {
    const report = await loadReport(file);
    reports.push({ source: file, category, report });
  }

  const suite = buildSuiteArtifact({
    taskSet: args.taskSet,
    reports,
    meta: {
      generated_at: new Date().toISOString(),
      package_version: process.env.PKG_VER ?? null,
      doctrine_lab: {
        sha: process.env.DOCTRINE_SHA ?? null,
        serve_url: process.env.SERVE_URL ?? null,
        judge_provider: process.env.JUDGE_PROVIDER ?? null,
        judge_model: process.env.JUDGE_MODEL ?? null,
        temperature_openai: 0,
        judge_blinding: true
      }
    }
  });

  let existing = null;
  try {
    existing = JSON.parse(await readFile(args.outPath, "utf8"));
  } catch {
    existing = null;
  }

  const out =
    existing && (existing.in_distribution || existing.heldout)
      ? { ...existing }
      : existing && existing.aggregate
        ? { in_distribution: existing, heldout: null }
        : { in_distribution: null, heldout: null };

  if (args.taskSet === "heldout") {
    out.heldout = suite;
  } else {
    out.in_distribution = suite;
  }
  out.generated_at = new Date().toISOString();
  out.package_version = process.env.PKG_VER ?? null;
  out.doctrine_lab = suite.doctrine_lab;

  await writeFile(args.outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${args.outPath} (${args.taskSet})`);
  const agg = suite.aggregate;
  console.log(
    `  ${args.taskSet}: A=${agg.wins_a}, B=${agg.wins_b}, ties=${agg.ties}` +
      ` (n=${agg.total_comparisons}, decisive=${agg.decisive_comparisons}, p=${agg.p_value})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
