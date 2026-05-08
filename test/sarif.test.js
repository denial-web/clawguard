import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createSarifReport } from "../src/reporters/sarif.js";
import { scanTarget } from "../src/scanner.js";

const execFileAsync = promisify(execFile);

test("creates SARIF report with rules, results, and policy metadata", async () => {
  const result = await scanTarget("examples/metadata-mismatch-skill", { policy: "governed" });
  const sarif = createSarifReport(result);
  const run = sarif.runs[0];

  assert.equal(sarif.version, "2.1.0");
  assert.equal(run.tool.driver.name, "ClawShield");
  assert.equal(run.results.length, result.findings.length);
  assert.equal(run.invocations[0].properties.policyDecision, "block");
  assert.ok(run.tool.driver.rules.some((rule) => rule.id === "undeclared-env-access"));
  assert.ok(run.results.some((entry) => entry.ruleId === "credential-access" && entry.level === "error"));
});

test("SARIF reporter maps medium findings to warnings", async () => {
  const result = await scanTarget("examples/metadata-mismatch-skill");
  const sarif = createSarifReport(result);
  const mediumResult = sarif.runs[0].results.find((entry) => entry.ruleId === "undeclared-network-access");

  assert.equal(mediumResult.level, "warning");
});

test("CLI writes SARIF report before exiting on risk threshold", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawshield-sarif-"));
  const sarifPath = path.join(dir, "clawshield.sarif");

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "scan",
        "examples/metadata-mismatch-skill",
        "--sarif",
        sarifPath
      ], { cwd: process.cwd() }),
      (error) => error.code === 2
    );

    const sarif = JSON.parse(await fs.readFile(sarifPath, "utf8"));
    assert.equal(sarif.version, "2.1.0");
    assert.ok(sarif.runs[0].results.length > 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
