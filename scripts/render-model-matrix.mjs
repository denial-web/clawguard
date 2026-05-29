#!/usr/bin/env node
// Render the model-agnostic governance matrix into a neutral Markdown report.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildSuiteArtifact,
  binomialTestPvalue,
  neutralSchemaVerdict,
  BENCHMARK_MODEL_A_LABEL,
  BENCHMARK_MODEL_B_LABEL
} from "./aggregate-doctrine-reports.mjs";

function parseArgs(argv) {
  const out = { index: null, outPath: null, jsonPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--index") out.index = argv[++i];
    else if (a === "--out") out.outPath = argv[++i];
    else if (a === "--json") out.jsonPath = argv[++i];
  }
  return out;
}

async function loadReport(file) {
  const json = JSON.parse(await readFile(file, "utf8"));
  return json.report ?? json;
}

async function readManifest(file) {
  const raw = await readFile(file, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [category, path] = l.split("\t");
      return { category, path };
    });
}

function reportErrorCount(report) {
  const mm = report?.multi_model_benchmark ?? {};
  let errors = 0;
  for (const v of Object.values(mm)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      errors += Number(v.error_count ?? 0) || 0;
    }
  }
  return errors;
}

function pct(n) {
  return `${(n * 100).toFixed(0)}%`;
}

function sigText(p) {
  if (!Number.isFinite(p)) return "n/a";
  return p < 0.05 ? `**${p.toFixed(4)}**` : p.toFixed(4);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.index || !args.outPath) {
    console.error("usage: render-model-matrix.mjs --index <tsv> --out <md> [--json <path>]");
    process.exit(2);
  }

  const taskSet = process.env.TASK_SET ?? "heldout2";
  const judgeProvider = process.env.JUDGE_PROVIDER ?? "openai";
  const judgeModel = process.env.JUDGE_MODEL ?? "gpt-4o";

  const indexRaw = await readFile(args.index, "utf8");
  const entries = indexRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [provider, model, manifest] = l.split("\t");
      return { provider, model, manifest };
    });

  const rows = [];
  for (const { provider, model, manifest } of entries) {
    const items = await readManifest(manifest);
    const cleanReports = [];
    let excludedTasks = 0;
    const excludedCategories = [];
    for (const { category, path } of items) {
      const report = await loadReport(path);
      const errors = reportErrorCount(report);
      if (errors > 0) {
        // A category with any provider/quota errors is unreliable: errored tasks score 0-0
        // and masquerade as ties, which can fabricate false significance. Exclude it.
        excludedTasks += Number(report?.summary?.total_tasks ?? 0) || 0;
        excludedCategories.push(category);
        continue;
      }
      cleanReports.push({ source: path, category, report });
    }
    if (cleanReports.length === 0) {
      rows.push({ provider, model, contaminated: true, excludedTasks, excludedCategories });
      continue;
    }
    const suite = buildSuiteArtifact({
      taskSet,
      reports: cleanReports,
      meta: {
        generated_at: new Date().toISOString(),
        package_version: process.env.PKG_VER ?? null,
        doctrine_lab: {
          sha: process.env.DOCTRINE_SHA ?? null,
          judge_provider: judgeProvider,
          judge_model: judgeModel
        }
      }
    });
    const agg = suite.aggregate;
    rows.push({
      provider,
      model,
      n: agg.total_comparisons,
      winsA: agg.wins_a,
      winsB: agg.wins_b,
      ties: agg.ties,
      winRateA: agg.win_rate_a,
      pValue: Number.isFinite(agg.p_value) ? agg.p_value : binomialTestPvalue(agg.wins_a, agg.wins_b),
      verdict: neutralSchemaVerdict(agg.wins_a, agg.wins_b, agg.p_value),
      excludedTasks,
      excludedCategories
    });
  }

  const generatedAt = new Date().toISOString();
  const lines = [];
  lines.push("# Model-agnostic governance — schema-compliance matrix");
  lines.push("");
  lines.push(`_Generated: ${generatedAt}_`);
  lines.push("");
  lines.push(
    "This matrix tests whether ClawGuard's governance envelope helps **independently of the " +
      "underlying model**. For each base model X we run a paired comparison on the held-out-2 " +
      "prompt set:"
  );
  lines.push("");
  lines.push(`- **${BENCHMARK_MODEL_A_LABEL}** = ClawGuard live runtime wrapping X`);
  lines.push(`- **${BENCHMARK_MODEL_B_LABEL}** = the same model X, ungoverned`);
  lines.push("");
  lines.push(
    "Because both sides use the **same base model**, the comparison isolates what the governance " +
      "contract contributes rather than which vendor's model is stronger. An LLM judge scores each " +
      "response for governance-schema compliance under symmetric blinding at temperature 0."
  );
  lines.push("");
  lines.push(
    `**Judge:** ${judgeProvider} / ${judgeModel} (held constant across all rows). ` +
      "Decisive comparisons exclude ties; the p-value is a two-sided binomial test on decisive wins."
  );
  lines.push("");
  lines.push(
    "| Base model | Provider | n | A wins (governed) | B wins (bare) | Ties | A win-rate | p-value | Outcome |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    if (r.contaminated) {
      lines.push(
        `| \`${r.model}\` | ${r.provider} | 0 | \u2014 | \u2014 | \u2014 | \u2014 | \u2014 | ` +
          `**Excluded \u2014 ${r.excludedTasks} comparisons failed (provider/quota errors)** |`
      );
      continue;
    }
    if (r.excludedTasks > 0) {
      // Partial rows survived only because some categories errored out; too small/biased
      // to claim significance, so report counts but withhold a significance verdict.
      lines.push(
        `| \`${r.model}\` | ${r.provider} | ${r.n} _(partial: ${r.excludedTasks} excluded)_ | ` +
          `${r.winsA} | ${r.winsB} | ${r.ties} | ${pct(r.winRateA)} | n/a | ` +
          `Partial data \u2014 re-run needed (insufficient to conclude) |`
      );
      continue;
    }
    lines.push(
      `| \`${r.model}\` | ${r.provider} | ${r.n} | ${r.winsA} | ${r.winsB} | ${r.ties} | ` +
        `${pct(r.winRateA)} | ${sigText(r.pValue)} | ${r.verdict} |`
    );
  }
  lines.push("");
  lines.push("## How to read this");
  lines.push("");
  lines.push(
    "- **A wins** = the governed envelope produced a more schema-compliant governance response than " +
      "the bare model for that prompt; **B wins** = the bare model did."
  );
  lines.push(
    "- A consistent A-advantage **across different providers** is the signal that matters: it means the " +
      "improvement comes from the governance layer, not from a single model."
  );
  lines.push(
    "- Bold p-values are statistically significant (< 0.05). With n=15 per model, single-model results " +
      "are directional; the **pattern across rows** is the robust finding."
  );
  lines.push("");
  lines.push("## Honest framing");
  lines.push("");
  lines.push(
    "- This is **not** a leaderboard of model quality and not a claim that any vendor's model is worse. " +
      "Every row compares a model **against itself** (governed vs ungoverned)."
  );
  lines.push(
    "- The judge rewards adherence to ClawGuard's governance JSON schema, which the governed side is " +
      "explicitly built to emit. Treat this as evidence the envelope is **model-portable**, not as a " +
      "general capability benchmark."
  );
  lines.push(
    "- Model names are shown for reproducibility only. Do not paraphrase these results as " +
      "\"ClawGuard beats <vendor>\"."
  );
  lines.push("");

  await writeFile(args.outPath, lines.join("\n") + "\n", "utf8");
  console.log(`Wrote ${args.outPath}`);

  if (args.jsonPath) {
    await writeFile(
      args.jsonPath,
      JSON.stringify({ generated_at: generatedAt, task_set: taskSet, judge: { provider: judgeProvider, model: judgeModel }, rows }, null, 2) + "\n",
      "utf8"
    );
    console.log(`Wrote ${args.jsonPath}`);
  }

  for (const r of rows) {
    console.log(
      `  ${r.provider}/${r.model}: A=${r.winsA} B=${r.winsB} ties=${r.ties} (n=${r.n}, p=${r.pValue})`
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
