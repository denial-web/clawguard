#!/usr/bin/env node
/**
 * Run clawguard check over bench/corpus/truth.json and write bench-results/clawguard-<version>.json
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const truthPath = path.join(repoRoot, "bench", "corpus", "truth.json");
const resultsDir = path.join(repoRoot, "bench-results");
const cliPath = path.join(repoRoot, "src", "cli.js");

const args = process.argv.slice(2);
const policyFlag = args.find((a) => a.startsWith("--policy="));
const policy = policyFlag ? policyFlag.split("=")[1] : "governed";
const exportDoctrine = args.includes("--export-doctrine") || process.env.CLAWGUARD_DOCTRINE_EXPORT === "1";
const doctrineUrl = process.env.CLAWGUARD_DOCTRINE_URL ?? "http://127.0.0.1:8000";

async function main() {
  const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  const truth = JSON.parse(await fs.readFile(truthPath, "utf8"));
  const runs = [];

  for (const entry of truth.entries) {
    const bundlePath = path.join(repoRoot, entry.bundlePath);
    const check = await runCheck(bundlePath, policy);
    const metrics = classifyEntry(entry, check);
    runs.push({
      id: entry.id,
      bundlePath: entry.bundlePath,
      label: entry.label,
      expectedDecision: entry.expectedDecision,
      reason: entry.reason,
      actual: check,
      metrics
    });
  }

  const aggregate = computeAggregate(runs);
  const aggregateExpected = computeExpectedMatch(runs);
  const result = {
    schemaVersion: "clawguard.scanner-benchmark.v1",
    generatedAt: new Date().toISOString(),
    tool: "@denial-web/clawguard",
    version: pkg.version,
    policy,
    corpus: truthPath.replace(`${repoRoot}/`, ""),
    entryCount: runs.length,
    aggregate,
    aggregateExpected,
    runs,
    perRule: computePerRule(runs)
  };

  await fs.mkdir(resultsDir, { recursive: true });
  const outFile = path.join(resultsDir, `clawguard-${pkg.version}.json`);
  await fs.writeFile(outFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outFile}`);
  console.log(
    `Risky-catch: precision=${aggregate.precision} recall=${aggregate.recall} | Expected-match accuracy=${aggregateExpected.accuracy}`
  );

  if (exportDoctrine) {
    const traces = buildDoctrineTraces(runs, pkg.version);
    const tracePath = path.join(resultsDir, `doctrine-traces-${pkg.version}.json`);
    await fs.writeFile(tracePath, `${JSON.stringify(traces, null, 2)}\n`, "utf8");
    console.log(`Wrote ${tracePath} (${traces.entries.length} entries)`);
    const delivery = await trySendDoctrine(traces);
    if (delivery) {
      console.log(`Doctrine Lab import: sent=${delivery.sent} status=${delivery.status ?? "n/a"}`);
    }
  }

  const baselinePath = path.join(repoRoot, "bench", "baseline.json");
  let baseline = null;
  try {
    baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
  } catch {
    // no baseline yet
  }

  if (baseline?.aggregate) {
    const regress = checkRegression(aggregate, baseline.aggregate);
    if (regress.length > 0) {
      console.warn("Regression vs baseline:");
      for (const line of regress) {
        console.warn(`  - ${line}`);
      }
      if (process.env.CLAWGUARD_BENCH_FAIL_ON_REGRESSION === "1") {
        process.exit(1);
      }
    }
  } else {
    await fs.writeFile(
      baselinePath,
      `${JSON.stringify({ version: pkg.version, aggregate, updatedAt: result.generatedAt }, null, 2)}\n`,
      "utf8"
    );
    console.log(`Wrote baseline ${baselinePath}`);
  }
}

function runCheck(target, policyPreset) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliPath, "check", target, "--policy", policyPreset, "--json"],
      { cwd: repoRoot, env: process.env }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      try {
        const payload = JSON.parse(stdout);
        resolve({
          exitCode: code ?? 1,
          decision: payload.decision,
          risk: payload.risk,
          summary: payload.summary,
          findingSummary: payload.findingSummary,
          findings: payload.findings ?? [],
          schemaVersion: payload.schemaVersion
        });
      } catch (error) {
        reject(new Error(`check failed for ${target}: ${error.message}\n${stderr}\n${stdout}`));
      }
    });
  });
}

function classifyEntry(entry, check) {
  const actual = check.decision;
  const expected = entry.expectedDecision;
  const exactMatch = actual === expected;
  const caughtRisky =
    entry.label === "risky" && (actual === "block" || actual === "manual_review");
  const safeAllowed = entry.label === "safe" && actual === "allow";
  const falsePositive = entry.label === "safe" && !safeAllowed;
  const falseNegative = entry.label === "risky" && actual === "allow";

  return {
    exactMatch,
    caughtRisky,
    safeAllowed,
    falsePositive,
    falseNegative
  };
}

function computeExpectedMatch(runs) {
  const correct = runs.filter((r) => r.metrics.exactMatch).length;
  const total = runs.length;
  return {
    correct,
    total,
    accuracy: total ? round(correct / total) : 1
  };
}

function computeAggregate(runs) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let exact = 0;

  for (const run of runs) {
    const { label } = run;
    const { falsePositive, exactMatch, caughtRisky, safeAllowed } = run.metrics;
    if (exactMatch) {
      exact += 1;
    }
    if (label === "risky") {
      if (caughtRisky) {
        tp += 1;
      } else {
        fn += 1;
      }
    } else if (label === "safe") {
      if (safeAllowed) {
        tn += 1;
      } else if (falsePositive) {
        fp += 1;
      }
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const falsePositiveRate = tn + fp > 0 ? fp / (tn + fp) : 0;

  return {
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    exactDecisionMatches: exact,
    exactDecisionRate: runs.length ? exact / runs.length : 0,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    falsePositiveRate: round(falsePositiveRate)
  };
}

function computePerRule(runs) {
  const rules = {};

  for (const run of runs) {
    for (const finding of run.actual.findings ?? []) {
      const ruleId = finding.ruleId ?? "unknown";
      if (!rules[ruleId]) {
        rules[ruleId] = { ruleId, count: 0, falsePositiveExamples: [] };
      }
      rules[ruleId].count += 1;
      if (run.label === "safe" && run.metrics.falsePositive) {
        rules[ruleId].falsePositiveExamples.push({
          bundleId: run.id,
          file: finding.file,
          evidence: finding.evidence
        });
      }
    }
  }

  return Object.values(rules).sort((a, b) => b.count - a.count);
}

function buildDoctrineTraces(runs, version) {
  const entries = [];

  for (const run of runs) {
    if (run.label !== "risky" || run.actual.decision === "allow") {
      continue;
    }
    const top = run.actual.findings?.[0];
    entries.push({
      prompt: `ClawGuard scanner blocked ${run.bundlePath}: ${run.actual.summary}`,
      response: JSON.stringify({
        decision: run.actual.decision === "block" ? "refuse" : "escalate",
        reasoning: run.actual.summary,
        risk_level: run.actual.risk ?? "high",
        action_type: "skill_install",
        requires_approval: run.actual.decision === "manual_review"
      }),
      failure_type: mapRuleToFailureType(top?.ruleId),
      critic_scores: {
        safety_compliance: 1,
        governance_awareness: 1,
        risk_reasoning: 0.9,
        structural: 1
      },
      trace_id: `clawguard-bench:${run.id}`
    });
  }

  const batchHash = createHash("sha256")
    .update(JSON.stringify(entries.map((e) => e.trace_id)))
    .digest("hex")
    .slice(0, 12);

  return {
    dataset_name: `ClawGuard ${version} scanner blocks`,
    batch_id: `clawguard-scanner-${batchHash}`,
    category: "agent_safety",
    language: "en",
    source: "clawguard",
    source_runtime: `clawguard:${version}`,
    origin: "synthetic",
    entries
  };
}

function mapRuleToFailureType(ruleId) {
  const map = {
    "remote-code-execution": "unsafe_tool_call",
    "credential-access": "protected_asset_violation",
    "clawhub-source-drift": "forged_provenance",
    "clawhub-missing-origin": "audit_metadata_gap",
    "mcp-shell-execution": "unsafe_tool_call",
    "dependency-install-script": "unsafe_tool_call"
  };
  return map[ruleId] ?? "unsafe_tool_call";
}

async function trySendDoctrine(traces) {
  if (traces.entries.length === 0) {
    return { sent: false, reason: "no entries" };
  }
  const endpoint = new URL("/api/datasets/import", doctrineUrl);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(endpoint.hostname)) {
    console.warn("Skipping Doctrine send: URL must be loopback");
    return null;
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(traces)
    });
    const body = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { text: body };
    }
    return { sent: response.ok, status: response.status, response: parsed };
  } catch (error) {
    console.warn(`Doctrine Lab import skipped: ${error.message}`);
    return { sent: false, error: error.message };
  }
}

function checkRegression(current, baseline) {
  const lines = [];
  const threshold = Number(process.env.CLAWGUARD_BENCH_REGRESSION_DELTA ?? "0.05");
  if (baseline.precision - current.precision > threshold) {
    lines.push(`precision dropped ${round(baseline.precision - current.precision)}`);
  }
  if (baseline.recall - current.recall > threshold) {
    lines.push(`recall dropped ${round(baseline.recall - current.recall)}`);
  }
  return lines;
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
