import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const execFileAsync = promisify(execFile);

test("init lists built-in profiles", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "init",
    "--list-profiles",
    "--json"
  ], { cwd: process.cwd() });
  const result = JSON.parse(stdout);

  assert.equal(result.schemaVersion, "clawguard.initProfiles.v1");
  assert.deepEqual(result.profiles.map((profile) => profile.name), [
    "local-first",
    "cloud-balanced",
    "enterprise-strict"
  ]);
});

test("init writes a normalized config template", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-init-"));
  const outputPath = path.join(workspace, ".clawguard.json");

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "init",
      "--profile",
      "local-first",
      "--out",
      outputPath,
      "--json"
    ], { cwd: process.cwd() });
    const result = JSON.parse(stdout);
    const loaded = await loadConfig(workspace);

    assert.equal(result.profile, "local-first");
    assert.equal(result.path, outputPath);
    assert.equal(loaded.config.policy, "governed");
    assert.equal(loaded.config.modelRouting.defaultProfile, "local");
    assert.equal(loaded.config.modelRouting.profiles.local.model, "ollama/llama3.3");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("init refuses to overwrite existing config without force", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-init-"));
  const outputPath = path.join(workspace, ".clawguard.json");

  try {
    await fs.writeFile(outputPath, "{}\n");

    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "init",
        "--out",
        outputPath
      ], { cwd: process.cwd() }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Config already exists/);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("init force overwrites existing config", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-init-"));
  const outputPath = path.join(workspace, ".clawguard.json");

  try {
    await fs.writeFile(outputPath, "{}\n");

    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "init",
      "--profile",
      "enterprise-strict",
      "--out",
      outputPath,
      "--force",
      "--json"
    ], { cwd: process.cwd() });
    const result = JSON.parse(stdout);
    const loaded = await loadConfig(workspace);

    assert.equal(result.overwritten, true);
    assert.equal(loaded.config.policy, "enterprise");
    assert.equal(loaded.config.modelRouting.approvalProfiles.includes("strong"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
