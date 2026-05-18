import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const demoPath = path.join(repoRoot, "scripts", "agent-memory-demo.js");

test("agent memory demo runs a governed memory lifecycle", async () => {
  const result = await execFileAsync(process.execPath, [demoPath, "--json"], {
    cwd: repoRoot
  });
  const demo = JSON.parse(result.stdout);

  assert.equal(demo.schemaVersion, "clawguard.agentMemoryDemo.v1");
  assert.equal(demo.steps.some((step) => step.command.includes("agent memory review")), true);
  assert.equal(demo.steps.some((step) => step.command.includes("agent memory approve")), true);
  assert.equal(demo.steps.some((step) => step.command.includes("agent memory replace")), true);
  assert.equal(demo.steps.some((step) => step.command.includes("agent memory consolidate")), true);
  assert.equal(demo.steps.some((step) => step.command.includes("agent memory remove")), true);
  assert.match(demo.recallSummary, /Active governed recall/);
});
