import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { inspectProtectedPath } from "../src/agent/protected-assets.js";
import { loadConfig } from "../src/config.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("agent init enables protected asset defaults", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-init-"));

  try {
    const init = await runCliJson(["agent", "init"], workspace);
    const loaded = await loadConfig(workspace);

    assert.equal(init.agent.protectedAssets.enabled, true);
    assert.equal(init.agent.protectedAssets.defaultPatterns, true);
    assert.equal(loaded.config.agent.protectedAssets.enabled, true);
    assert.equal(loaded.config.agent.protectedAssets.defaultPatterns, true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("agent protected CLI lists, adds, blocks, and checks protected assets", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-cli-"));

  try {
    await runCliJson(["agent", "init"], workspace);

    const add = await runCliJson([
      "agent",
      "protected",
      "add",
      "company-prod-db",
      "--type",
      "database",
      "--path",
      "data/prod.sqlite",
      "--operations",
      "read,write,execute,cleanup",
      "--reason",
      "Company production database."
    ], workspace);

    assert.equal(add.action, "added");
    assert.equal(add.asset.id, "company-prod-db");
    assert.equal(add.asset.decision, "approval_required");

    const block = await runCliJson([
      "agent",
      "protected",
      "block",
      "customer-backups",
      "--type",
      "customer_data",
      "--path",
      "backups/customer/**",
      "--operations",
      "read,write,cleanup",
      "--reason",
      "Customer backups are off limits."
    ], workspace);

    assert.equal(block.asset.decision, "block");

    const list = await runCliJson(["agent", "protected", "list"], workspace);
    assert.equal(list.enabled, true);
    assert.equal(list.defaultPatterns, true);
    assert.equal(list.assets.length, 2);

    const review = await runPendingJson(["agent", "protected", "check", "data/prod.sqlite", "--operation", "write"], workspace);
    assert.equal(review.decision, "approval_required");
    assert.equal(review.protected, true);

    await assert.rejects(
      runCli(["agent", "protected", "check", "backups/customer/prod.dump", "--operation", "cleanup", "--json"], workspace),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.equal(error.code, 2);
        assert.equal(result.decision, "block");
        assert.equal(result.protected, true);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("default protected asset extension patterns match nested files", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-pattern-"));

  try {
    const result = inspectProtectedPath(workspace, path.join(workspace, "apps", "prod.sqlite"), "read", {
      enabled: true,
      defaultPatterns: true,
      assets: []
    });

    assert.equal(result.protected, true);
    assert.equal(result.decision, "approval_required");
    assert.equal(result.matches.some((match) => match.path === "*.sqlite"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("file.read on protected assets requires approval before revealing content", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-read-"));
  const secret = "DATABASE_URL=postgres://demo-secret\n";

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.writeFile(path.join(workspace, ".env"), secret);
    const planPath = await writePlan(workspace, {
      task: "read protected env",
      steps: [{
        id: "read-env",
        tool: "file.read",
        args: { path: ".env" },
        reason: "Read env only after approval.",
        risk: "low"
      }]
    });

    const first = await runPendingJson(["agent", "run", "--plan", planPath], workspace);
    const approvalId = first.steps[0].result.approvalRequest.id;

    assert.equal(first.status, "pending_approval");
    assert.equal(first.steps[0].result.artifacts[0].type, "protected-asset");
    assert.equal(first.steps[0].result.artifacts[0].path, ".env");
    assert.doesNotMatch(JSON.stringify(first), /demo-secret/);

    await approve(workspace, approvalId);
    const second = await runCliJson(["agent", "run", "--plan", planPath, "--approval-id", approvalId], workspace);

    assert.equal(second.status, "completed");
    assert.equal(second.steps[0].result.output.content, secret);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("file.diff on protected assets requires approval before showing a diff", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-diff-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.writeFile(path.join(workspace, ".env"), "TOKEN=old-secret\n");
    const planPath = await writePlan(workspace, {
      task: "preview protected diff",
      steps: [{
        id: "diff-env",
        tool: "file.diff",
        args: { path: ".env", content: "TOKEN=new-secret\n" },
        reason: "Preview env diff only after approval.",
        risk: "medium"
      }]
    });

    const first = await runPendingJson(["agent", "run", "--plan", planPath], workspace);

    assert.equal(first.status, "pending_approval");
    assert.equal(first.steps[0].result.artifacts[0].type, "protected-asset");
    assert.doesNotMatch(JSON.stringify(first), /old-secret/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("file.write_safe to a protected database escalates before previewing or writing", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-write-"));
  const dbPath = path.join(workspace, "data", "prod.sqlite");

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(dbPath, "old database bytes\n");
    const planPath = await writePlan(workspace, {
      task: "write protected database",
      steps: [{
        id: "write-db",
        tool: "file.write_safe",
        args: { path: "data/prod.sqlite", content: "new database bytes\n" },
        reason: "Protected database write.",
        risk: "high"
      }]
    });

    const first = await runPendingJson(["agent", "run", "--plan", planPath], workspace);
    const approval = await readLastApproval(workspace);

    assert.equal(first.status, "pending_approval");
    assert.equal(await fs.readFile(dbPath, "utf8"), "old database bytes\n");
    assert.equal(approval.risk.level, "critical");
    assert.ok(approval.policy.requiredActions.includes("approve-protected-write"));
    assert.equal(first.steps[0].result.artifacts[0].type, "protected-asset");
    assert.doesNotMatch(JSON.stringify(first), /old database bytes/);
    assert.deepEqual(await fs.readdir(path.join(workspace, ".clawguard", "agent", "proposed")), []);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("project.cleanup_safe blocks protected assets while moving approved generated files", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-cleanup-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.mkdir(path.join(workspace, "data"), { recursive: true });
    await fs.mkdir(path.join(workspace, "backups"), { recursive: true });
    await fs.mkdir(path.join(workspace, "dist"), { recursive: true });
    await fs.writeFile(path.join(workspace, "data", "prod.sqlite"), "keep db\n");
    await fs.writeFile(path.join(workspace, "backups", "customer.dump"), "keep backup\n");
    await fs.writeFile(path.join(workspace, "dist", "bundle.js"), "generated\n");
    const planPath = await writePlan(workspace, {
      task: "cleanup protected and generated files",
      steps: [{
        id: "cleanup",
        tool: "project.cleanup_safe",
        args: { include: ["data/prod.sqlite", "backups/customer.dump", "dist"] },
        reason: "Only generated files may move.",
        risk: "high"
      }]
    });

    const first = await runPendingJson(["agent", "run", "--plan", planPath], workspace);
    const approvalId = first.steps[0].result.approvalRequest.id;
    const cleanupPlan = first.steps[0].result.output.plan;

    assert.deepEqual(cleanupPlan.proposed.map((item) => item.path), ["dist"]);
    assert.equal(cleanupPlan.blocked.some((item) => item.path === "data/prod.sqlite" && item.protectedAsset), true);
    assert.equal(cleanupPlan.blocked.some((item) => item.path === "backups/customer.dump" && item.protectedAsset), true);

    await approve(workspace, approvalId);
    const second = await runCliJson(["agent", "run", "--plan", planPath, "--approval-id", approvalId], workspace);

    assert.equal(second.status, "completed");
    assert.equal(second.steps[0].result.output.moved[0].path, "dist");
    await fs.lstat(path.join(workspace, "data", "prod.sqlite"));
    await fs.lstat(path.join(workspace, "backups", "customer.dump"));
    await assert.rejects(fs.lstat(path.join(workspace, "dist")), { code: "ENOENT" });
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("shell.execute_approved treats destructive database commands as critical approval", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-shell-db-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const planPath = await writePlan(workspace, {
      task: "drop database",
      steps: [{
        id: "drop-db",
        tool: "shell.execute_approved",
        args: { argv: ["psql", "-c", "DROP DATABASE prod"] },
        reason: "This must be critical approval.",
        risk: "critical"
      }]
    });

    const first = await runPendingJson(["agent", "run", "--plan", planPath], workspace);
    const approval = await readLastApproval(workspace);

    assert.equal(first.status, "pending_approval");
    assert.equal(approval.risk.level, "critical");
    assert.ok(approval.policy.requiredActions.includes("approve-protected-shell-execution"));
    assert.equal(approval.agentAction.artifacts.some((artifact) => artifact.type === "protected-shell-command"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("shell.execute_approved blocks inline interpreter deletion attempts", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-shell-inline-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const planPath = await writePlan(workspace, {
      task: "delete database through node",
      steps: [{
        id: "inline-delete",
        tool: "shell.execute_approved",
        args: { argv: [process.execPath, "-e", "require('fs').rmSync('data/prod.sqlite')"] },
        reason: "Inline deletion should be blocked.",
        risk: "critical"
      }]
    });

    await assert.rejects(
      runCli(["agent", "run", "--plan", planPath, "--json"], workspace),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.equal(error.code, 2);
        assert.equal(result.status, "blocked");
        assert.match(result.steps[0].result.error, /Inline interpreter deletion/);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("custom protected asset block decision blocks writes without creating proposals", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-custom-block-"));
  const targetPath = path.join(workspace, "vault", "customer.txt");

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, "customer data\n");
    const configPath = path.join(workspace, ".clawguard.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    config.agent.protectedAssets.assets = [{
      id: "customer-vault",
      type: "customer_data",
      path: "vault/**",
      operations: ["write"],
      decision: "block",
      reason: "Customer vault is blocked in local beta."
    }];
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const planPath = await writePlan(workspace, {
      task: "write customer data",
      steps: [{
        id: "write-vault",
        tool: "file.write_safe",
        args: { path: "vault/customer.txt", content: "changed\n" },
        reason: "Should be blocked.",
        risk: "high"
      }]
    });

    await assert.rejects(
      runCli(["agent", "run", "--plan", planPath, "--json"], workspace),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.equal(error.code, 2);
        assert.equal(result.status, "blocked");
        assert.match(result.steps[0].result.error, /Protected asset write matched/);
        return true;
      }
    );
    assert.equal(await fs.readFile(targetPath, "utf8"), "customer data\n");
    assert.deepEqual(await fs.readdir(path.join(workspace, ".clawguard", "agent", "proposed")), []);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("approved protected asset ids cannot be replayed for a different target", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-approval-replay-"));
  const dbPath = path.join(workspace, "data", "prod.sqlite");

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.writeFile(path.join(workspace, ".env"), "TOKEN=demo\n");
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(dbPath, "old db\n");

    const readPlanPath = await writePlan(workspace, {
      task: "approve env read",
      steps: [{
        id: "read-env",
        tool: "file.read",
        args: { path: ".env" },
        reason: "Read env.",
        risk: "low"
      }]
    });
    const readPending = await runPendingJson(["agent", "run", "--plan", readPlanPath], workspace);
    const readApprovalId = readPending.steps[0].result.approvalRequest.id;
    await approve(workspace, readApprovalId);

    const writePlanPath = await writePlan(workspace, {
      task: "try approval replay",
      steps: [{
        id: "write-db",
        tool: "file.write_safe",
        args: { path: "data/prod.sqlite", content: "new db\n" },
        reason: "This approval id is for a different target.",
        risk: "high"
      }]
    });

    await assert.rejects(
      runCli(["agent", "run", "--plan", writePlanPath, "--approval-id", readApprovalId, "--json"], workspace),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.equal(error.code, 2);
        assert.equal(result.status, "blocked");
        assert.match(result.steps[0].result.error, /not file\.write_safe|target does not match/);
        return true;
      }
    );
    assert.equal(await fs.readFile(dbPath, "utf8"), "old db\n");
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

async function runPendingJson(args, cwd) {
  try {
    await runCli([...args, "--json"], cwd);
    assert.fail("Expected command to pause for approval.");
  } catch (error) {
    assert.equal(error.code, 1);
    return JSON.parse(error.stdout);
  }
}

async function writePlan(workspace, plan) {
  const planPath = path.join(workspace, `plan-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return planPath;
}

async function approve(workspace, approvalId) {
  return runCliJson([
    "approvals",
    "decide",
    path.join(workspace, ".clawguard", "approvals.jsonl"),
    "--id",
    approvalId,
    "--decision",
    "approve",
    "--out",
    path.join(workspace, ".clawguard", "decisions.jsonl")
  ], workspace);
}

async function readLastApproval(workspace) {
  const content = await fs.readFile(path.join(workspace, ".clawguard", "approvals.jsonl"), "utf8");
  const approvals = content.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  return approvals.at(-1);
}
