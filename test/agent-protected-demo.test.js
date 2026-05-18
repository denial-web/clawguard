import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const demoPath = path.join(repoRoot, "scripts", "protected-asset-demo.js");

test("protected asset demo proves policy-gated high-secure data", async () => {
  const result = await execFileAsync(process.execPath, [demoPath, "--json"], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024
  });
  const demo = JSON.parse(result.stdout);

  assert.equal(demo.schemaVersion, "clawguard.protectedAssetDemo.v1");
  assert.equal(demo.assertions.every((item) => item.pass), true);
  assert.equal(demo.counts.customProtectedAssets, 2);
  assert.equal(demo.counts.pendingApprovalsCreated, 2);
  assert.equal(demo.counts.generatedCleanupPathsProposed, 1);
  assert.equal(demo.counts.hardBlocksDemonstrated, 2);
  assert.equal(demo.steps.some((step) => step.command.includes("agent protected add")), true);
  assert.equal(demo.steps.some((step) => step.command.includes("agent protected block")), true);
  assert.equal(demo.steps.some((step) => step.command.includes("agent protected check")), true);
  assert.equal(demo.steps.some((step) => step.command.includes("agent run --plan")), true);
});
