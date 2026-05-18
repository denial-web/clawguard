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

  const pendingWrite = await step("Propose a project-rule memory", [
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

  const review = await step("Review pending memory approvals", ["agent", "memory", "review", "--json"]);
  const approvedProjectRule = await step("Approve the proposed durable memory", ["agent", "memory", "approve", approvalId, "--json"]);

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
  const preferenceB = await step("Write another related preference", [
    "agent",
    "memory",
    "add",
    "--type",
    "INFERRED_PREFERENCE",
    "--content",
    "User prefers release summaries to include npm test results.",
    "--json"
  ]);

  const replacement = await step("Replace a memory while preserving history", [
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
  const approvedConsolidation = await step("Approve consolidated memory", [
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

  const beforeRemoval = await step("List effective memory", ["agent", "memory", "list", "--json"]);
  const removal = await step("Remove one memory with an append-only tombstone", [
    "agent",
    "memory",
    "remove",
    scratch.output.id,
    "--reason",
    "Demo cleanup.",
    "--json"
  ]);
  const afterRemoval = await step("Verify effective memory after tombstone", ["agent", "memory", "list", "--json"]);

  const recall = await step("Create active recall from remaining memory", [
    "agent",
    "memory",
    "recall",
    "release publish checklist",
    "--json"
  ]);
  const assertions = buildAssertions({
    pendingWrite,
    review,
    approvedProjectRule,
    preferenceA,
    preferenceB,
    replacement,
    consolidate,
    approvedConsolidation,
    scratch,
    beforeRemoval,
    removal,
    afterRemoval,
    recall
  });
  const failed = assertions.filter((item) => !item.pass);
  if (failed.length > 0) {
    throw new Error(`Memory demo invariant failed: ${failed.map((item) => item.label).join("; ")}`);
  }

  const result = {
    schemaVersion: "clawguard.agentMemoryDemo.v1",
    workspace,
    kept: keep,
    counts: summarizeCounts({ pendingWrite, approvedProjectRule, preferenceA, preferenceB, replacement, consolidate, approvedConsolidation, removal, afterRemoval, recall }),
    assertions,
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

function buildAssertions({
  pendingWrite,
  review,
  approvedProjectRule,
  preferenceA,
  preferenceB,
  replacement,
  consolidate,
  approvedConsolidation,
  scratch,
  beforeRemoval,
  removal,
  afterRemoval,
  recall
}) {
  const oldPreferenceId = preferenceA.output.id;
  const replacementId = replacement.output.replacement.id;
  const scratchId = scratch.output.id;
  const effectiveIds = new Set(afterRemoval.records.map((record) => record.id));
  const recallIds = new Set(recall.memory.map((record) => record.id));

  return [
    check("Proposed 1 project-rule memory and queued approval", pendingWrite.status === "pending_approval" && review.summary.pendingMemoryApprovals >= 1, {
      approvalId: pendingWrite.approvalRequest.id,
      pendingApprovals: review.summary.pendingMemoryApprovals
    }),
    check("Approved 1 project-rule memory write", approvedProjectRule.writeResult?.ok === true, {
      memoryId: approvedProjectRule.writeResult?.output?.id
    }),
    check("Wrote 2 low-risk preferences without approval", preferenceA.ok === true && preferenceB.ok === true && !preferenceA.approvalRequest && !preferenceB.approvalRequest, {
      memoryIds: [preferenceA.output.id, preferenceB.output.id]
    }),
    check("Replaced old memory with superseded chain intact", replacement.output.previous.id === oldPreferenceId && replacement.output.replacement.supersedes === oldPreferenceId, {
      from: oldPreferenceId,
      to: replacementId
    }),
    check("Consolidated matching memories through approval", consolidate.status === "pending_approval" && consolidate.matchedRecords.length >= 2 && approvedConsolidation.writeResult?.ok === true, {
      approvalId: consolidate.approvalRequest.id,
      matchedRecords: consolidate.matchedRecords.length,
      memoryId: approvedConsolidation.writeResult?.output?.id
    }),
    check("Tombstoned removable memory without deleting the log", removal.event.targetMemoryId === scratchId, {
      memoryId: scratchId,
      tombstoneId: removal.event.id
    }),
    check("Effective view hides tombstoned and superseded source records", !effectiveIds.has(oldPreferenceId) && !effectiveIds.has(scratchId), {
      effectiveMemoryRecords: afterRemoval.records.length,
      hiddenIds: [oldPreferenceId, scratchId]
    }),
    check("Active recall uses effective memory records", recall.memory.length > 0 && !recallIds.has(oldPreferenceId) && !recallIds.has(scratchId), {
      recallMemoryRecords: recall.memory.length,
      hiddenIds: [oldPreferenceId, scratchId]
    }),
    check("Effective memory count decreased after tombstone", afterRemoval.records.length === beforeRemoval.records.length - 1, {
      before: beforeRemoval.records.length,
      after: afterRemoval.records.length
    })
  ];
}

function summarizeCounts({ pendingWrite, approvedProjectRule, preferenceA, preferenceB, replacement, consolidate, approvedConsolidation, removal, afterRemoval, recall }) {
  return {
    pendingApprovalsCreated: [pendingWrite, consolidate].filter((item) => item.status === "pending_approval").length,
    approvedMemoryWrites: [approvedProjectRule, approvedConsolidation].filter((item) => item.writeResult?.ok).length,
    lowRiskPreferencesWritten: [preferenceA, preferenceB].filter((item) => item.ok).length,
    replacements: replacement.ok ? 1 : 0,
    consolidationsApproved: approvedConsolidation.writeResult?.ok ? 1 : 0,
    tombstones: removal.ok ? 1 : 0,
    effectiveMemoryRecords: afterRemoval.records.length,
    recallMemoryRecords: recall.memory.length
  };
}

function check(label, pass, details = {}) {
  return {
    label,
    pass: Boolean(pass),
    details
  };
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
  console.log("Falsifiable checks:");
  for (const item of result.assertions) {
    console.log(`- [${item.pass ? "PASS" : "FAIL"}] ${item.label}${formatDetails(item.details)}`);
  }
  console.log("");
  console.log("Final active recall:");
  console.log(result.recallSummary);
}

function formatDetails(details) {
  const entries = Object.entries(details ?? {}).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) {
    return "";
  }
  return ` (${entries.map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : value}`).join("; ")})`;
}
