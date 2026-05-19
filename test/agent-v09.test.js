import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createAgentApprovalRequest } from "../src/agent/approvals.js";
import { getWebAgentDashboard } from "../src/web-server.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("memory review shows pending proposals and approve writes durable memory", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v09-review-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const pending = await runPending([
      "agent",
      "memory",
      "add",
      "--type",
      "PROJECT_RULE",
      "--content",
      "Project release work must run npm test before publishing.",
      "--json"
    ], workspace);

    const review = await runCliJson(["agent", "memory", "review"], workspace);
    assert.equal(review.schemaVersion, "clawguard.agentMemoryReview.v1");
    assert.equal(review.pendingMemoryApprovals.some((approval) => approval.id === pending.approvalRequest.id), true);

    const approved = await runCliJson(["agent", "memory", "approve", pending.approvalRequest.id], workspace);
    assert.equal(approved.schemaVersion, "clawguard.agentMemoryDecision.v1");
    assert.equal(approved.decision.decision, "approve");
    assert.equal(approved.writeResult.ok, true);

    const listed = await runCliJson(["agent", "memory", "list"], workspace);
    assert.equal(listed.records.some((record) => record.content.includes("npm test before publishing")), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("memory remove appends a tombstone and hides records from list search and mirrors", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v09-remove-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await enableAutoWriteMemory(workspace);
    const added = await runCliJson([
      "agent",
      "memory",
      "add",
      "--type",
      "INFERRED_PREFERENCE",
      "--content",
      "User prefers generated archive folders stay out of release notes."
    ], workspace);
    const id = added.output.id;

    const removed = await runCliJson(["agent", "memory", "remove", id, "--reason", "Outdated cleanup guidance."], workspace);
    assert.equal(removed.status, "completed");
    assert.equal(removed.event.targetMemoryId, id);

    const listed = await runCliJson(["agent", "memory", "list"], workspace);
    const searched = await runCliJson(["agent", "memory", "search", "generated archive"], workspace);
    const mirror = await fs.readFile(path.join(workspace, ".clawguard", "agent", "USER.md"), "utf8");

    assert.equal(listed.records.some((record) => record.id === id), false);
    assert.equal(searched.records.some((record) => record.id === id), false);
    assert.doesNotMatch(mirror, /generated archive folders/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("memory replace supersedes the old record in the effective memory view", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v09-replace-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await enableAutoWriteMemory(workspace);
    const added = await runCliJson([
      "agent",
      "memory",
      "add",
      "--type",
      "INFERRED_PREFERENCE",
      "--content",
      "User prefers release checklist to run the old smoke command."
    ], workspace);
    const oldId = added.output.id;

    const replaced = await runCliJson([
      "agent",
      "memory",
      "replace",
      oldId,
      "--content",
      "User prefers release checklist to run npm test and safety eval before publish.",
      "--reason",
      "Release command changed."
    ], workspace);

    assert.equal(replaced.status, "completed");
    assert.equal(replaced.output.replacement.supersedes, oldId);

    const listed = await runCliJson(["agent", "memory", "list"], workspace);
    assert.equal(listed.records.some((record) => record.id === oldId), false);
    assert.equal(listed.records.some((record) => record.content.includes("safety eval before publish")), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("memory consolidate creates an approval proposal instead of silently writing", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v09-consolidate-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await enableAutoWriteMemory(workspace);
    await runCliJson([
      "agent",
      "memory",
      "add",
      "--type",
      "INFERRED_PREFERENCE",
      "--content",
      "User prefers release preparation to inspect git status before drafting notes."
    ], workspace);
    await runCliJson([
      "agent",
      "memory",
      "add",
      "--type",
      "INFERRED_PREFERENCE",
      "--content",
      "User prefers release preparation to inspect package version before drafting notes."
    ], workspace);

    const proposal = await runPending(["agent", "memory", "consolidate", "release preparation", "--json"], workspace);
    const listed = await runCliJson(["agent", "memory", "list"], workspace);

    assert.equal(proposal.schemaVersion, "clawguard.agentMemoryConsolidate.v1");
    assert.equal(proposal.status, "pending_approval");
    assert.equal(proposal.matchedRecords.length >= 2, true);
    assert.equal(listed.records.length, 2);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("memory consolidate inherits highest-risk input type", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v09-consolidate-risk-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await enableAutoWriteMemory(workspace);
    const pending = await runPending([
      "agent",
      "memory",
      "add",
      "--type",
      "PROJECT_RULE",
      "--content",
      "Project release preparation must run safety eval before publish.",
      "--json"
    ], workspace);
    await runCliJson(["agent", "memory", "approve", pending.approvalRequest.id], workspace);
    await runCliJson([
      "agent",
      "memory",
      "add",
      "--type",
      "INFERRED_PREFERENCE",
      "--content",
      "User prefers release preparation notes to include package version."
    ], workspace);

    const proposal = await runPending(["agent", "memory", "consolidate", "release preparation", "--json"], workspace);
    const approvals = await readJsonl(path.join(workspace, ".clawguard", "approvals.jsonl"));
    const approval = approvals.find((item) => item.id === proposal.approvalRequest.id);

    assert.equal(proposal.status, "pending_approval");
    assert.equal(proposal.output.record.type, "PROJECT_RULE");
    assert.equal(approval.risk.level, "high");
    assert.equal(proposal.output.record.policy.tags.includes("high-risk-type"), true);
    assert.equal(proposal.output.record.policy.tags.includes("consolidated-memory"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("memory consolidate inherits policy tags from input records", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v09-consolidate-tags-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await enableAutoWriteMemory(workspace);
    const pending = await runPending([
      "agent",
      "memory",
      "add",
      "--type",
      "EXACT_USER_STATEMENT",
      "--source",
      "tool:readme",
      "--content",
      "User prefers release preparation summaries to stay concise.",
      "--json"
    ], workspace);
    await runCliJson(["agent", "memory", "approve", pending.approvalRequest.id], workspace);
    await runCliJson([
      "agent",
      "memory",
      "add",
      "--type",
      "INFERRED_PREFERENCE",
      "--content",
      "User prefers release preparation summaries to include package version."
    ], workspace);

    const proposal = await runPending(["agent", "memory", "consolidate", "release preparation", "--json"], workspace);
    const approvals = await readJsonl(path.join(workspace, ".clawguard", "approvals.jsonl"));
    const approval = approvals.find((item) => item.id === proposal.approvalRequest.id);

    assert.equal(proposal.status, "pending_approval");
    assert.equal(proposal.output.record.inheritedPolicyTags.includes("provenance-mismatch"), true);
    assert.equal(proposal.output.record.policy.tags.includes("provenance-mismatch"), true);
    assert.equal(proposal.output.record.policy.tags.includes("consolidated-memory"), true);
    assert.equal(approval.agentAction.args.policyTags.includes("provenance-mismatch"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("agent dashboard exposes memory approvals separately", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v09-dashboard-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await runPending([
      "agent",
      "memory",
      "add",
      "--type",
      "PROJECT_RULE",
      "--content",
      "Dashboard review should show memory approval proposals.",
      "--json"
    ], workspace);

    const dashboard = await getWebAgentDashboard(workspace);
    assert.equal(dashboard.summary.memoryApprovals, 1);
    assert.equal(dashboard.memoryApprovals.length, 1);
    assert.equal(dashboard.memoryApprovals[0].tool, "memory.write");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("memory approval ids cannot be replayed from another tool", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-v09-memory-replay-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n");
    const approval = createAgentApprovalRequest({
      tool: "file.read",
      args: { path: "README.md" },
      target: path.join(workspace, "README.md"),
      destination: workspace,
      risk: "low",
      reason: "Unrelated file read approval."
    });
    await fs.appendFile(path.join(workspace, ".clawguard", "approvals.jsonl"), `${JSON.stringify(approval)}\n`);
    await runCliJson([
      "approvals",
      "decide",
      path.join(workspace, ".clawguard", "approvals.jsonl"),
      "--id",
      approval.id,
      "--decision",
      "approve",
      "--out",
      path.join(workspace, ".clawguard", "decisions.jsonl")
    ], workspace);

    await assert.rejects(
      runCli([
        "agent",
        "memory",
        "add",
        "--type",
        "PROJECT_RULE",
        "--content",
        "Never deploy production without review.",
        "--approval-id",
        approval.id,
        "--json"
      ], workspace),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.equal(error.code, 2);
        assert.equal(result.status, "blocked");
        assert.match(result.error, /not a memory action/);
        return true;
      }
    );
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

async function runPending(args, cwd) {
  try {
    await runCli(args, cwd);
    assert.fail("Expected command to pause for approval.");
  } catch (error) {
    assert.equal(error.code, 1);
    return JSON.parse(error.stdout);
  }
}

async function enableAutoWriteMemory(workspace) {
  const configPath = path.join(workspace, ".clawguard.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.agent.autoWriteMemory = true;
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function readJsonl(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
