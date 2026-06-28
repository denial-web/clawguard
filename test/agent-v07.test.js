import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("agent init creates hybrid memory mirrors and recall directory", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v07-init-"));

  try {
    const result = await runCliJson(["agent", "init"], workspace);

    assert.equal(result.schemaVersion, "clawguard.agentInit.v1");
    await fs.lstat(path.join(workspace, ".clawguard", "agent", "USER.md"));
    await fs.lstat(path.join(workspace, ".clawguard", "agent", "MEMORY.md"));
    await fs.lstat(path.join(workspace, ".clawguard", "agent", "recall"));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("memory add refreshes readable mirrors and export returns markdown", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v07-memory-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await patchConfig(workspace, (config) => {
      config.agent.autoWriteMemory = true;
      return config;
    });

    const write = await runCliJson([
      "agent",
      "memory",
      "add",
      "--type",
      "INFERRED_PREFERENCE",
      "--content",
      "User prefers TypeScript for agent tooling."
    ], workspace);
    const userMirror = await fs.readFile(path.join(workspace, ".clawguard", "agent", "USER.md"), "utf8");
    const exported = await runCliJson(["agent", "memory", "export", "--format", "markdown"], workspace);

    assert.equal(write.status, "completed");
    assert.match(userMirror, /User prefers TypeScript/);
    assert.match(exported.content, /ClawGuard Memory Export/);
    assert.match(exported.content, /User prefers TypeScript/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("agent run records recall snapshot, task outcome proposal, and searchable sessions", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v07-session-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n\nHybrid memory project.\n");
    await execFileAsync("git", ["init"], { cwd: workspace });
    await runCliJson(["agent", "init"], workspace);

    const run = await runCliJson(["agent", "run", "--recipe", "project.inspect"], workspace);
    const search = await runCliJson(["agent", "memory", "sessions", "search", "hybrid memory project"], workspace);

    assert.equal(run.status, "completed");
    assert.equal(run.recall.schemaVersion, "clawguard.agentRecallSnapshot.v1");
    await fs.lstat(run.recall.path);
    assert.equal(run.memoryProposals.length, 1);
    assert.equal(run.memoryProposals[0].status, "pending_approval");
    assert.equal(search.sessions.length >= 1, true);
    assert.equal(search.sessions[0].tools.includes("file.read"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("memory export redacts sensitive records by default", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v07-export-"));
  const memoryPath = path.join(workspace, ".clawguard", "agent", "memory.jsonl");

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.writeFile(memoryPath, `${JSON.stringify({
      type: "SENSITIVE",
      content: "API key is secret-value",
      source: "test",
      confidence: 1,
      scope: "workspace",
      sensitive: true,
      createdAt: "2026-01-01T00:00:00.000Z"
    })}\n`);

    const exported = await runCliJson(["agent", "memory", "export", "--format", "json"], workspace);

    assert.doesNotMatch(exported.content, /secret-value/);
    assert.match(exported.content, /\[sensitive memory redacted\]/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

async function runCli(args, cwd) {
  return execFileAsync(process.execPath, [cliPath, ...args], { cwd });
}

async function runCliJson(args, cwd) {
  const result = await runCli([...args, "--json"], cwd);
  return JSON.parse(result.stdout);
}

async function patchConfig(workspace, update) {
  const configPath = path.join(workspace, ".clawguard.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  await fs.writeFile(configPath, `${JSON.stringify(update(config), null, 2)}\n`);
}
