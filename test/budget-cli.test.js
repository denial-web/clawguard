import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("budget check allows requests within explicit CLI pricing limits", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "budget",
    "check",
    "--provider",
    "example",
    "--model",
    "example-model",
    "--input-tokens",
    "1000",
    "--output-tokens",
    "500",
    "--input-usd-per-1m",
    "1",
    "--output-usd-per-1m",
    "2",
    "--max-usd",
    "1",
    "--json"
  ], { cwd: process.cwd() });

  const result = JSON.parse(stdout);

  assert.equal(result.schemaVersion, "clawguard.budget.v1");
  assert.equal(result.decision, "allow");
  assert.equal(result.cost.estimatedUsd, 0.002);
  assert.equal(result.pricing.source, "cli");
});

test("budget check pauses for manual review above the approval threshold", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "budget",
      "check",
      "--provider",
      "example",
      "--model",
      "example-model",
      "--input-tokens",
      "1000000",
      "--output-tokens",
      "0",
      "--input-usd-per-1m",
      "1",
      "--output-usd-per-1m",
      "0",
      "--approval-usd",
      "0.50",
      "--max-usd",
      "2",
      "--json"
    ], { cwd: process.cwd() }),
    (error) => {
      const result = JSON.parse(error.stdout);

      assert.equal(error.code, 1);
      assert.equal(result.decision, "manual_review");
      assert.equal(result.requiredActions.includes("owner-budget-approval"), true);
      return true;
    }
  );
});

test("budget check blocks requests above hard cost or token limits", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "budget",
      "check",
      "--provider",
      "example",
      "--model",
      "example-model",
      "--input-tokens",
      "2000000",
      "--output-tokens",
      "1",
      "--input-usd-per-1m",
      "1",
      "--output-usd-per-1m",
      "0",
      "--max-usd",
      "1",
      "--max-total-tokens",
      "1000000",
      "--json"
    ], { cwd: process.cwd() }),
    (error) => {
      const result = JSON.parse(error.stdout);

      assert.equal(error.code, 2);
      assert.equal(result.decision, "block");
      assert.match(result.reason, /exceeds max request/);
      assert.match(result.reason, /exceed max total tokens/);
      return true;
    }
  );
});

test("budget check can use model pricing and limits from config", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-budget-"));
  const configPath = path.join(workspace, ".clawguard.json");

  await fs.writeFile(configPath, JSON.stringify({
    budgets: {
      approvalRequestUsd: 0.01,
      maxRequestUsd: 0.05,
      maxTotalTokens: 100000
    },
    models: [
      {
        provider: "google",
        model: "configured-model",
        inputUsdPer1M: 0.25,
        outputUsdPer1M: 1.25
      }
    ]
  }));

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "budget",
      "check",
      "--config",
      configPath,
      "--provider",
      "google",
      "--model",
      "configured-model",
      "--input-tokens",
      "10000",
      "--output-tokens",
      "1000",
      "--json"
    ], { cwd: process.cwd() });
    const result = JSON.parse(stdout);

    assert.equal(result.decision, "allow");
    assert.equal(result.pricing.source, "config");
    assert.equal(result.limits.maxTotalTokens, 100000);
    assert.equal(result.configPath, configPath);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("budget check writes audit JSONL records", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-budget-"));
  const auditLogPath = path.join(workspace, ".clawguard", "budget.jsonl");

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "budget",
      "check",
      "--provider",
      "example",
      "--model",
      "example-model",
      "--input-tokens",
      "10",
      "--output-tokens",
      "10",
      "--input-usd-per-1m",
      "1",
      "--output-usd-per-1m",
      "1",
      "--audit-log",
      auditLogPath,
      "--json"
    ], { cwd: process.cwd() });

    const result = JSON.parse(stdout);
    const audit = JSON.parse((await fs.readFile(auditLogPath, "utf8")).trim());

    assert.equal(result.auditLogPath, auditLogPath);
    assert.equal(audit.schemaVersion, "clawguard.budget.v1");
    assert.equal(audit.decision, "allow");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("budget check fails when model pricing is unavailable", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "budget",
      "check",
      "--provider",
      "missing",
      "--model",
      "missing-model",
      "--input-tokens",
      "10",
      "--output-tokens",
      "10"
    ], { cwd: process.cwd() }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /requires pricing/);
      return true;
    }
  );
});
