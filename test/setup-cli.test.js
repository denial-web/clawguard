import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("setup prepares a portable PicoClaw guarded workspace", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-setup-"));

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "setup",
    "--framework",
    "picoclaw",
    "--workspace",
    workspace,
    "--json"
  ], { cwd: process.cwd() });
  const setup = JSON.parse(result.stdout);

  assert.equal(setup.schemaVersion, "clawguard.setup.v1");
  assert.equal(setup.framework, "picoclaw");
  assert.equal(setup.frameworkLabel, "PicoClaw");
  assert.equal(setup.profile, "local-first");
  assert.equal(setup.workspace, workspace);
  assert.equal(setup.paths.installDir, path.join(workspace, ".picoclaw", "skills"));
  assert.match(setup.commands.guardedInstall, /picoclaw install \.\/candidate-skill/);
  assert.match(setup.commands.watchTelegram, /TELEGRAM_BOT_TOKEN=replace-with-token/);
  assert.match(setup.commands.watchTelegram, /replace-with-chat-id/);

  await fs.access(path.join(workspace, ".clawguard.json"));
  await fs.access(path.join(workspace, ".clawguard", "approvals.jsonl"));
  await fs.access(path.join(workspace, ".clawguard", "decisions.jsonl"));
  await fs.access(path.join(workspace, ".clawguard", "framework.json"));
  await fs.access(path.join(workspace, ".picoclaw", "skills"));

  const readme = await fs.readFile(path.join(workspace, "CLAWGUARD_SETUP.md"), "utf8");
  assert.match(readme, /ClawGuard PicoClaw Setup/);
  assert.match(readme, /Install through the ClawGuard policy gate/);
});

test("setup can target an explicit install directory and reports existing files", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-setup-"));
  const installDir = path.join(workspace, "trusted-skills");

  await execFileAsync(process.execPath, [
    "src/cli.js",
    "setup",
    "--framework",
    "openclaw",
    "--workspace",
    workspace,
    "--install-dir",
    installDir,
    "--json"
  ], { cwd: process.cwd() });

  const second = await execFileAsync(process.execPath, [
    "src/cli.js",
    "setup",
    "--framework",
    "openclaw",
    "--workspace",
    workspace,
    "--install-dir",
    installDir,
    "--json"
  ], { cwd: process.cwd() });
  const setup = JSON.parse(second.stdout);

  assert.equal(setup.paths.installDir, installDir);
  assert.equal(setup.skipped.includes(path.join(workspace, ".clawguard.json")), true);
  assert.equal(setup.skipped.includes(path.join(workspace, ".clawguard", "framework.json")), true);
  assert.equal(setup.commands.guardedInstall.includes(installDir), true);
});

test("setup rejects unsupported framework values", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "setup",
      "--framework",
      "unknown"
    ], { cwd: process.cwd() }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Invalid --framework value/);
      return true;
    }
  );
});
