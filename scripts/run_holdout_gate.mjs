#!/usr/bin/env node
/**
 * Standing ClawGuard release gate — fast local smoke + optional Doctrine Lab holdouts.
 *
 * Local:
 *   npm run holdout:gate
 *
 * CI / release (Doctrine Lab checkout required):
 *   DOCTRINE_LAB_ROOT=../doctrine-lab npm run holdout:gate -- --require-doctrine
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const requireDoctrine = args.includes("--require-doctrine");
const skipDoctrine = args.includes("--skip-doctrine");

const doctrineCandidates = [
  process.env.DOCTRINE_LAB_ROOT,
  path.resolve(repoRoot, "../thinking-DT/doctrine-lab"),
  path.resolve(repoRoot, "../doctrine-lab")
].filter(Boolean);

const doctrineLabRoot = doctrineCandidates.find((candidate) => (
  existsSync(path.join(candidate, "Makefile"))
  && existsSync(path.join(candidate, "scripts", "run_cross_project_smoke.py"))
));

const steps = [];

function runStep(label, command, cwd = repoRoot) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    stdio: "inherit",
    env: process.env
  });
  const ok = result.status === 0;
  steps.push({ step: label, ok, exit_code: result.status ?? 1 });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}`);
  return ok;
}

console.log("=== ClawGuard holdout gate ===\n");

let ok = true;
ok = runStep("agent safety eval", ["npm", "run", "safety:eval"]) && ok;
ok = runStep("doctrine export contract", ["node", "--test", "test/agent-doctrine-lab.test.js"]) && ok;
ok = runStep("tool-output-scan tests", ["node", "--test", "test/agent-tool-output-scan.test.js"]) && ok;
ok = runStep("tool-observation audit tests", ["node", "--test", "test/agent-tool-observation-audit.test.js"]) && ok;
ok = runStep("injection critic tests", ["node", "--test", "test/agent-injection-critic.test.js"]) && ok;

if (!skipDoctrine) {
  if (doctrineLabRoot) {
    console.log(`\nDoctrine Lab root: ${doctrineLabRoot}\n`);
    ok = runStep(
      "doctrine-lab cross-project-smoke",
      ["make", "cross-project-smoke"],
      doctrineLabRoot
    ) && ok;
  } else if (requireDoctrine) {
    steps.push({
      step: "doctrine-lab cross-project-smoke",
      ok: false,
      exit_code: 1,
      error: "Doctrine Lab checkout not found (set DOCTRINE_LAB_ROOT)"
    });
    console.log("[FAIL] doctrine-lab cross-project-smoke: Doctrine Lab checkout not found");
    ok = false;
  } else {
    console.log("\n[SKIP] doctrine-lab cross-project-smoke (no sibling checkout; use --require-doctrine in CI)\n");
  }
}

console.log("");
console.log("Holdout gate:", ok ? "OK" : "FAILED");
process.exit(ok ? 0 : 1);
