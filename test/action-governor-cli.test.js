import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("CLI action plan blocks money movement", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "action",
      "plan",
      "--type",
      "money-movement",
      "--data-class",
      "payment-data",
      "--task",
      "Transfer funds",
      "--json"
    ], { cwd: process.cwd() }),
    (error) => {
      const result = JSON.parse(error.stdout);
      assert.equal(error.code, 2);
      assert.equal(result.decision, "block");
      assert.equal(result.action.type, "money-movement");
      return true;
    }
  );
});

test("CLI action plan allows internal draft", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "action",
    "plan",
    "--type",
    "draft",
    "--data-class",
    "internal",
    "--task",
    "Draft internal note",
    "--json"
  ], { cwd: process.cwd() });
  const result = JSON.parse(stdout);

  assert.equal(result.schemaVersion, "clawguard.actionPlan.v1");
  assert.equal(result.decision, "allow");
});

test("CLI action record and recover restores local file snapshot", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-action-"));
  const targetPath = path.join(workspace, "case-note.json");
  const journalPath = path.join(workspace, ".clawguard", "actions.jsonl");

  await fs.writeFile(targetPath, JSON.stringify({ status: "before" }, null, 2));

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "action",
        "record",
        "--type",
        "write-local",
        "--data-class",
        "internal",
        "--target",
        targetPath,
        "--journal",
        journalPath,
        "--hash-chain",
        "--json"
      ], { cwd: process.cwd() }),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.equal(error.code, 1);
        assert.equal(result.record.decision, "manual_review");
        assert.equal(result.record.snapshot.captured, true);
        return true;
      }
    );

    const record = JSON.parse((await fs.readFile(journalPath, "utf8")).trim());
    await fs.writeFile(targetPath, JSON.stringify({ status: "after" }, null, 2));

    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "action",
      "recover",
      "--id",
      record.id,
      "--journal",
      journalPath,
      "--json"
    ], { cwd: process.cwd() });
    const recovery = JSON.parse(stdout);
    const restored = JSON.parse(await fs.readFile(targetPath, "utf8"));

    assert.equal(recovery.status, "recovered");
    assert.equal(restored.status, "before");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("CLI action recover reports compensating record for non-recoverable action", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-action-"));
  const journalPath = path.join(workspace, ".clawguard", "actions.jsonl");

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "action",
        "record",
        "--type",
        "send-external",
        "--data-class",
        "customer-pii",
        "--recoverability",
        "compensating",
        "--journal",
        journalPath,
        "--json"
      ], { cwd: process.cwd() }),
      (error) => {
        assert.equal(error.code, 1);
        return true;
      }
    );

    const record = JSON.parse((await fs.readFile(journalPath, "utf8")).trim());

    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "action",
        "recover",
        "--id",
        record.id,
        "--journal",
        journalPath,
        "--json"
      ], { cwd: process.cwd() }),
      (error) => {
        const recovery = JSON.parse(error.stdout);
        assert.equal(error.code, 1);
        assert.equal(recovery.status, "not-recoverable");
        assert.equal(recovery.actions.includes("create-compensating-record"), true);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("CLI action verify detects audit tampering", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-action-"));
  const journalPath = path.join(workspace, ".clawguard", "actions.jsonl");

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "action",
      "record",
      "--type",
      "draft",
      "--data-class",
      "internal",
      "--journal",
      journalPath,
      "--hash-chain",
      "--json"
    ], { cwd: process.cwd() });
    const result = JSON.parse(stdout);
    const tampered = {
      ...result.record,
      decision: "allow-but-tampered"
    };

    await fs.writeFile(journalPath, `${JSON.stringify(tampered)}\n`);

    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "action",
        "verify",
        "--journal",
        journalPath,
        "--json"
      ], { cwd: process.cwd() }),
      (error) => {
        const verify = JSON.parse(error.stdout);
        assert.equal(error.code, 1);
        assert.equal(verify.ok, false);
        assert.equal(verify.findings[0].id, "hash-mismatch");
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("CLI incident open creates incident from action journal", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-action-"));
  const journalPath = path.join(workspace, ".clawguard", "actions.jsonl");
  const incidentPath = path.join(workspace, ".clawguard", "incidents.jsonl");

  try {
    const { stdout: recordStdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "action",
      "record",
      "--type",
      "draft",
      "--data-class",
      "internal",
      "--journal",
      journalPath,
      "--json"
    ], { cwd: process.cwd() });
    const record = JSON.parse(recordStdout).record;
    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "incident",
      "open",
      "--from-action",
      record.id,
      "--journal",
      journalPath,
      "--incidents",
      incidentPath,
      "--reason",
      "Review action",
      "--json"
    ], { cwd: process.cwd() });
    const incident = JSON.parse(stdout);

    assert.equal(incident.incident.status, "open");
    assert.equal(incident.incident.actionId, record.id);
    assert.match(await fs.readFile(incidentPath, "utf8"), /Review action/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
