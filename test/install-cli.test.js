import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("install copies an allowed skill after the policy gate passes", async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-install-"));

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "install",
    "examples/safe-skill",
    "--to",
    installRoot,
    "--name",
    "safe-copy"
  ], { cwd: process.cwd() });

  assert.match(result.stdout, /Decision: ALLOW/);
  assert.match(result.stdout, /Installed: yes/);

  const installedSkill = await fs.readFile(path.join(installRoot, "safe-copy", "SKILL.md"), "utf8");
  assert.match(installedSkill, /Safe Notes Skill/);
});

test("install blocks a risky skill before copying files", async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-install-"));
  const destination = path.join(installRoot, "risky-copy");

  try {
    await execFileAsync(process.execPath, [
      "src/cli.js",
      "install",
      "examples/risky-skill",
      "--to",
      installRoot,
      "--name",
      "risky-copy"
    ], { cwd: process.cwd() });
    assert.fail("Expected risky install to fail.");
  } catch (error) {
    assert.equal(error.code, 2);
    assert.match(error.stdout, /Decision: BLOCK/);
    assert.match(error.stdout, /Installed: no/);
    await assert.rejects(fs.lstat(destination), { code: "ENOENT" });
  }
});

test("install dry run emits machine-readable JSON without copying", async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-install-"));
  const destination = path.join(installRoot, "dry-copy");

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "install",
    "examples/safe-skill",
    "--to",
    installRoot,
    "--name",
    "dry-copy",
    "--dry-run",
    "--json"
  ], { cwd: process.cwd() });
  const install = JSON.parse(result.stdout);

  assert.equal(install.decision, "allow");
  assert.equal(install.exitCode, 0);
  assert.equal(install.installed, false);
  assert.equal(install.dryRun, true);
  assert.equal(install.destination, destination);
  await assert.rejects(fs.lstat(destination), { code: "ENOENT" });
});

test("openclaw install can require approval before copying an allowed skill", async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-install-"));
  const approvalPath = path.join(installRoot, "approval.json");
  const destination = path.join(installRoot, "safe-copy");

  try {
    await execFileAsync(process.execPath, [
      "src/cli.js",
      "openclaw",
      "install",
      "examples/safe-skill",
      "--to",
      installRoot,
      "--name",
      "safe-copy",
      "--approval-out",
      approvalPath,
      "--approval-mode",
      "always",
      "--json"
    ], { cwd: process.cwd() });
    assert.fail("Expected approval-gated install to pause.");
  } catch (error) {
    assert.equal(error.code, 1);
    const install = JSON.parse(error.stdout);
    const approval = JSON.parse(await fs.readFile(approvalPath, "utf8"));

    assert.equal(install.framework, "openclaw");
    assert.equal(install.installed, false);
    assert.equal(install.approvalRequest.status, "pending");
    assert.equal(approval.framework, "openclaw");
    assert.equal(approval.decision, "allow");
    assert.match(approval.message, /ClawGuard approval needed for OpenClaw skill install/);
    await assert.rejects(fs.lstat(destination), { code: "ENOENT" });
  }
});

test("hermes install writes approval request for a risky skill", async () => {
  const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-install-"));
  const approvalPath = path.join(installRoot, "approvals.jsonl");
  const destination = path.join(installRoot, "risky-copy");

  try {
    await execFileAsync(process.execPath, [
      "src/cli.js",
      "hermes",
      "install",
      "examples/risky-skill",
      "--to",
      installRoot,
      "--name",
      "risky-copy",
      "--approval-out",
      approvalPath
    ], { cwd: process.cwd() });
    assert.fail("Expected risky install to pause for approval.");
  } catch (error) {
    assert.equal(error.code, 1);
    assert.match(error.stdout, /Framework: Hermes Agent/);
    assert.match(error.stdout, /Approval request:/);

    const approvalLine = (await fs.readFile(approvalPath, "utf8")).trim();
    const approval = JSON.parse(approvalLine);

    assert.equal(approval.framework, "hermes");
    assert.equal(approval.decision, "block");
    assert.equal(approval.status, "pending");
    assert.equal(approval.install.installed, false);
    assert.match(approval.message, /Decision: BLOCK/);
    await assert.rejects(fs.lstat(destination), { code: "ENOENT" });
  }
});
