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
