import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("check allows a safe skill with exit code 0", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "check",
    "examples/safe-skill",
    "--policy",
    "personal"
  ], { cwd: process.cwd() });

  assert.match(result.stdout, /ClawGuard check:/);
  assert.match(result.stdout, /Decision: ALLOW/);
  assert.match(result.stdout, /Recommended action: auto_install/);
  assert.match(result.stdout, /Exit code: 0/);
});

test("check blocks a risky skill with exit code 2", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "check",
      "examples/risky-skill",
      "--policy",
      "personal"
    ], { cwd: process.cwd() }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stdout, /Decision: BLOCK/);
      assert.match(error.stdout, /Recommended action: reject/);
      assert.match(error.stdout, /Risk: CRITICAL/);
      return true;
    }
  );
});

test("check emits clawguard.check.v1 JSON for a safe skill", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "check",
    "examples/safe-skill",
    "--policy",
    "personal",
    "--json"
  ], { cwd: process.cwd() });
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.schemaVersion, "clawguard.check.v1");
  assert.equal(payload.decision, "allow");
  assert.equal(payload.recommendedAction, "auto_install");
  assert.equal(payload.risk, "info");
  assert.equal(payload.policyPreset, "personal");
  assert.deepEqual(payload.findingSummary, { critical: 0, high: 0, medium: 0, low: 0 });
  assert.deepEqual(payload.findings, []);
  assert.equal(payload.scanReportPath, null);
  assert.ok(typeof payload.summary === "string");
  assert.ok(payload.summary.length <= 280);
  assert.ok(new Date(payload.generatedAt).toString() !== "Invalid Date");
});

test("check emits clawguard.check.v1 JSON for a risky skill with exit code 2", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "check",
      "examples/risky-skill",
      "--policy",
      "personal",
      "--json"
    ], { cwd: process.cwd() }),
    (error) => {
      assert.equal(error.code, 2);
      const payload = JSON.parse(error.stdout);
      assert.equal(payload.schemaVersion, "clawguard.check.v1");
      assert.equal(payload.decision, "block");
      assert.equal(payload.recommendedAction, "reject");
      assert.equal(payload.risk, "critical");
      assert.ok(payload.findings.length > 0);
      assert.equal(payload.findings[0].severity, "critical");
      assert.ok(payload.findingSummary.critical >= 1);
      return true;
    }
  );
});

test("check --write-report writes a full scan report and references it", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-check-"));
  const reportPath = path.join(tmpDir, "scan-report.json");

  try {
    const result = await execFileAsync(process.execPath, [
      "src/cli.js",
      "check",
      "examples/safe-skill",
      "--policy",
      "personal",
      "--json",
      "--write-report",
      reportPath
    ], { cwd: process.cwd() });
    const payload = JSON.parse(result.stdout);

    assert.equal(payload.scanReportPath, path.resolve(reportPath));

    const reportContents = JSON.parse(await fs.readFile(reportPath, "utf8"));
    assert.equal(reportContents.schemaVersion, "1.0.0");
    assert.equal(reportContents.level, "info");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("check finding objects have exactly the documented fields", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "check",
      "examples/risky-skill",
      "--policy",
      "personal",
      "--json"
    ], { cwd: process.cwd() }),
    (error) => {
      const payload = JSON.parse(error.stdout);

      for (const finding of payload.findings) {
        assert.deepEqual(
          new Set(Object.keys(finding)),
          new Set(["ruleId", "title", "severity", "file", "line", "evidence"])
        );
      }

      return true;
    }
  );
});
