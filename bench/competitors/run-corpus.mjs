#!/usr/bin/env node
/**
 * Shared corpus runner for competitor adapters.
 * Usage: node run-corpus.mjs --name <id> --scan-cmd <shell command template>
 *   Template receives BUNDLE_PATH env var for each entry.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const truthPath = path.join(repoRoot, "bench", "corpus", "truth.json");
const resultsDir = path.join(repoRoot, "bench-results");

function parseArgs(argv) {
  let name = "competitor";
  let scanCmd = "";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--name" && argv[i + 1]) {
      name = argv[++i];
    } else if (argv[i] === "--scan-cmd" && argv[i + 1]) {
      scanCmd = argv[++i];
    }
  }
  if (!scanCmd) {
    throw new Error("--scan-cmd required");
  }
  return { name, scanCmd };
}

function normalizeDecision(raw) {
  const lower = String(raw ?? "").toLowerCase();
  if (["allow", "pass", "ok", "safe", "clean"].includes(lower)) {
    return "allow";
  }
  if (["block", "deny", "reject", "fail", "failed", "critical"].includes(lower)) {
    return "block";
  }
  if (["warn", "warning", "review", "manual_review", "manual", "sandbox"].includes(lower)) {
    return "manual_review";
  }
  return "unknown";
}

function parseDecision(stdout) {
  try {
    const j = JSON.parse(stdout);
    const d = j.decision ?? j.policy?.decision ?? j.result ?? j.level ?? "";
    return normalizeDecision(d);
  } catch {
    return "unknown";
  }
}

function runScan(scanCmd, bundlePath) {
  return new Promise((resolve) => {
    const child = spawn(scanCmd, {
      shell: true,
      cwd: repoRoot,
      env: { ...process.env, BUNDLE_PATH: bundlePath }
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c) => {
      stdout += c;
    });
    child.stderr?.on("data", (c) => {
      stderr += c;
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr, decision: parseDecision(stdout) });
    });
  });
}

function aggregate(runs) {
  const tp = runs.filter((r) => r.label === "risky" && r.decision !== "allow").length;
  const fn = runs.filter((r) => r.label === "risky" && r.decision === "allow").length;
  const fp = runs.filter((r) => r.label === "safe" && r.decision !== "allow").length;
  const tn = runs.filter((r) => r.label === "safe" && r.decision === "allow").length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  return {
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision: Math.round(precision * 1000) / 1000,
    recall: Math.round(recall * 1000) / 1000
  };
}

async function main() {
  const { name, scanCmd } = parseArgs(process.argv.slice(2));
  const truth = JSON.parse(await fs.readFile(truthPath, "utf8"));
  const runs = [];

  for (const entry of truth.entries) {
    const bundlePath = path.join(repoRoot, entry.bundlePath);
    const result = await runScan(scanCmd, bundlePath);
    runs.push({
      id: entry.id,
      bundlePath: entry.bundlePath,
      label: entry.label,
      exitCode: result.code,
      decision: result.decision
    });
  }

  await fs.mkdir(resultsDir, { recursive: true });
  const outPath = path.join(resultsDir, `${name}.json`);
  const payload = {
    schemaVersion: "clawguard.scanner-benchmark.v1",
    status: "completed",
    competitor: name,
    generatedAt: new Date().toISOString(),
    aggregate: aggregate(runs),
    runs
  };
  const allUnknown = runs.every((r) => r.decision === "unknown");
  if (allUnknown) {
    const skippedPath = path.join(resultsDir, `${name}-skipped.json`);
    await fs.writeFile(
      skippedPath,
      `${JSON.stringify({
        schemaVersion: "clawguard.scanner-benchmark.v1",
        status: "skipped",
        competitor: name,
        reason: "scanner command failed for all corpus entries (install or CLI not found)",
        generatedAt: payload.generatedAt
      }, null, 2)}\n`,
      "utf8"
    );
    await fs.rm(outPath, { force: true }).catch(() => {});
    console.log(`Skipped ${name}: all runs returned unknown (wrote ${skippedPath})`);
    return;
  }

  await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
