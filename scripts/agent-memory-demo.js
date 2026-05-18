#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(rootDir, "src", "cli.js");

const keep = process.argv.includes("--keep");
const json = process.argv.includes("--json");
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-memory-demo-"));
const transcript = [];

try {
  await fs.writeFile(path.join(workspace, "README.md"), "# Memory Demo\n\nRelease work must stay governed.\n");
  await fs.writeFile(path.join(workspace, "package.json"), `${JSON.stringify({
    name: "clawguard-memory-demo",
    version: "1.0.0",
    scripts: {
      test: "node --test",
      "safety:eval": "node safety_eval/run_eval.mjs"
    }
  }, null, 2)}\n`);

  await step("Initialize governed agent state", ["agent", "init", "--json"]);

  const pendingWrite = await step("Propose a business-rule memory", [
    "agent",
    "memory",
    "add",
    "--type",
    "PROJECT_RULE",
    "--content",
    "Project release work must run npm test and safety eval before publishing.",
    "--json"
  ], { expectCode: 1 });
  const approvalId = pendingWrite.approvalRequest.id;

  await step("Review pending memory approvals", ["agent", "memory", "review", "--json"]);
  await step("Approve the proposed durable memory", ["agent", "memory", "approve", approvalId, "--json"]);

  await enableAutoWriteForDemo();
  const preferenceA = await step("Write a low-risk user preference", [
    "agent",
    "memory",
    "add",
    "--type",
    "INFERRED_PREFERENCE",
    "--content",
    "User prefers release summaries with risk and verification sections.",
    "--json"
  ]);
  await step("Write another related preference", [
    "agent",
    "memory",
    "add",
    "--type",
    "INFERRED_PREFERENCE",
    "--content",
    "User prefers release summaries to include npm test results.",
    "--json"
  ]);

  await step("Replace a memory while preserving history", [
    "agent",
    "memory",
    "replace",
    preferenceA.output.id,
    "--content",
    "User prefers release summaries with risk, verification, and rollback sections.",
    "--reason",
    "Demo refinement.",
    "--json"
  ]);

  const consolidate = await step("Propose consolidated memory for approval", [
    "agent",
    "memory",
    "consolidate",
    "release summaries",
    "--json"
  ], { expectCode: 1 });
  await step("Approve consolidated memory", [
    "agent",
    "memory",
    "approve",
    consolidate.approvalRequest.id,
    "--json"
  ]);

  const scratch = await step("Write a removable demo memory", [
    "agent",
    "memory",
    "add",
    "--type",
    "INFERRED_PREFERENCE",
    "--content",
    "User prefers temporary demo cleanup notes to be removable.",
    "--json"
  ]);

  await step("List effective memory", ["agent", "memory", "list", "--json"]);
  await step("Remove one memory with an append-only tombstone", [
    "agent",
    "memory",
    "remove",
    scratch.output.id,
    "--reason",
    "Demo cleanup.",
    "--json"
  ]);

  const recall = await step("Create active recall from remaining memory", [
    "agent",
    "memory",
    "recall",
    "release publish checklist",
    "--json"
  ]);

  const result = {
    schemaVersion: "clawguard.agentMemoryDemo.v1",
    workspace,
    kept: keep,
    steps: transcript,
    recallSummary: recall.summary
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanDemo(result);
  }
} finally {
  if (!keep) {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function step(label, args, options = {}) {
  const command = [process.execPath, cliPath, ...args];
  const expected = options.expectCode ?? 0;
  let stdout = "";
  let stderr = "";
  let code = 0;

  try {
    const result = await execFileAsync(command[0], command.slice(1), { cwd: workspace });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    code = error.code ?? 1;
    stdout = error.stdout ?? "";
    stderr = error.stderr ?? "";
  }

  if (code !== expected) {
    throw new Error(`${label} exited ${code}, expected ${expected}.\n${stderr || stdout}`);
  }

  const parsed = JSON.parse(stdout);
  transcript.push({
    label,
    command: `clawguard ${args.filter((arg) => arg !== "--json").join(" ")}`,
    exitCode: code,
    schemaVersion: parsed.schemaVersion,
    status: parsed.status ?? (parsed.ok === false ? "blocked" : "completed"),
    approvalId: parsed.approvalRequest?.id ?? parsed.decision?.approvalId ?? null,
    memoryCount: parsed.records?.length ?? parsed.summary?.durableRecords ?? null
  });
  return parsed;
}

async function enableAutoWriteForDemo() {
  const configPath = path.join(workspace, ".clawguard.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.agent.autoWriteMemory = true;
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function printHumanDemo(result) {
  console.log("ClawGuard Agent memory lifecycle demo");
  console.log(`Workspace: ${result.workspace}${result.kept ? "" : " (removed after demo)"}`);
  console.log("");
  for (const item of result.steps) {
    console.log(`- ${item.label}`);
    console.log(`  ${item.command}`);
    console.log(`  status=${item.status}${item.approvalId ? ` approval=${item.approvalId}` : ""}${item.memoryCount !== null ? ` memory=${item.memoryCount}` : ""}`);
  }
  console.log("");
  console.log("Final active recall:");
  console.log(result.recallSummary);
}
