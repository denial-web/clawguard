import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

test("agent safety eval passes the bundled fixture", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-eval-"));
  const outPath = path.join(workspace, "report.json");

  try {
    await execFileAsync(process.execPath, [
      path.join(repoRoot, "safety_eval", "run_eval.mjs"),
      "--out",
      outPath
    ], { cwd: repoRoot });
    const report = JSON.parse(await fs.readFile(outPath, "utf8"));

    assert.equal(report.schemaVersion, "clawguard.agentSafetyEval.v1");
    assert.ok(report.totalSamples >= 6);
    assert.equal(report.metrics.falseNegativeRate, 0);
    assert.equal(report.metrics.failed, 0);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
