import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { applyWebAgentAutonomy, getWebSetupState, previewWebSetup } from "../src/web-server.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("autonomy presets can force approval for otherwise safe reads", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta3-autonomy-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n");
    await runCliJson(["agent", "init"], workspace);
    const shown = await runCliJson(["agent", "autonomy", "show"], workspace);
    assert.equal(shown.toolAutonomy.preset, "developer");
    assert.equal(shown.tools.find((tool) => tool.tool === "file.read").mode, "auto");

    await runCliJson(["agent", "autonomy", "set", "--preset", "strict"], workspace);
    const planPath = await writePlan(workspace, {
      task: "read readme",
      steps: [{
        id: "read",
        tool: "file.read",
        args: { path: "README.md" },
        reason: "Strict mode should ask first.",
        risk: "low"
      }]
    });
    const pending = await runPending(["agent", "run", "--plan", planPath, "--json"], workspace);

    assert.equal(pending.status, "pending_approval");
    assert.equal(pending.steps[0].result.autonomy.effectiveMode, "approval");
    assert.equal(pending.steps[0].result.approvalRequest.status, "pending");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("autonomy overrides cannot bypass locked or protected tools", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta3-floor-"));

  try {
    await fs.writeFile(path.join(workspace, ".env"), "SECRET=value\n");
    await runCliJson(["agent", "init"], workspace);
    await assert.rejects(
      runCli(["agent", "autonomy", "set-tool", "shell.execute_approved", "auto", "--json"], workspace),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /cannot be made full-auto/);
        return true;
      }
    );

    await runCliJson(["agent", "autonomy", "set-tool", "file.read", "auto"], workspace);
    const planPath = await writePlan(workspace, {
      task: "read env",
      steps: [{
        id: "read-env",
        tool: "file.read",
        args: { path: ".env" },
        reason: "Protected assets still require approval.",
        risk: "low"
      }]
    });
    const pending = await runPending(["agent", "run", "--plan", planPath, "--json"], workspace);

    assert.equal(pending.status, "pending_approval");
    assert.equal(pending.steps[0].result.autonomy.protectedAsset.protected, true);
    assert.equal(pending.steps[0].result.autonomy.effectiveMode, "approval");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("proposals cannot change agent tool autonomy", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta3-autonomy-proposal-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const proposalPath = path.join(workspace, "proposal.json");
    await fs.writeFile(proposalPath, `${JSON.stringify({
      schemaVersion: "clawguard.agentActionProposal.v1",
      task: "Make search full auto.",
      tool: "file.write_safe",
      args: {
        path: ".clawguard.json",
        content: JSON.stringify({ agent: { toolAutonomy: { preset: "personal" } } })
      },
      reason: "This should use the autonomy CLI instead.",
      risk: "high"
    }, null, 2)}\n`);

    await assert.rejects(
      runCli(["agent", "proposal", "validate", proposalPath, "--json"], workspace),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /cannot change agent\.toolAutonomy/);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("subagents list, show, delegate, and team run create audited child sessions", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta3-subagents-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n");
    await runCliJson(["agent", "init"], workspace);
    const list = await runCliJson(["agent", "subagents", "list"], workspace);
    assert.equal(list.profiles.some((profile) => profile.name === "project-inspector"), true);

    const show = await runCliJson(["agent", "subagents", "show", "project-inspector"], workspace);
    assert.equal(show.profile.allowedTools.includes("git.status"), true);

    const delegated = await runCliJson(["agent", "delegate", "inspect local project", "--to", "project-inspector"], workspace);
    assert.equal(delegated.status, "completed");
    await fs.lstat(delegated.sessionPath);

    const team = await runCliJson(["agent", "run", "--team", "prepare a safe release plan"], workspace);
    assert.equal(team.schemaVersion, "clawguard.agentTeamRun.v1");
    assert.equal(team.childRuns.length >= 1, true);
    assert.equal(team.childRuns.length <= 3, true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("team delegation passes through autonomy approval before child workers start", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta3-team-gate-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n");
    await runCliJson(["agent", "init"], workspace);
    await runCliJson(["agent", "autonomy", "set", "--preset", "strict"], workspace);

    const pending = await runPending(["agent", "run", "--team", "prepare a safe release plan", "--json"], workspace);

    assert.equal(pending.schemaVersion, "clawguard.agentTeamRun.v1");
    assert.equal(pending.status, "pending_approval");
    assert.equal(pending.childRuns.length, 0);
    assert.equal(pending.steps[0].step.tool, "subagent.delegate");
    assert.equal(pending.steps[0].result.autonomy.effectiveMode, "approval");
    assert.equal(pending.steps[0].result.approvalRequest.status, "pending");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("subagent delegation approval ids cannot be replayed from another tool", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta3-subagent-replay-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n");
    await runCliJson(["agent", "init"], workspace);
    await runCliJson(["agent", "autonomy", "set", "--preset", "strict"], workspace);

    const readPlanPath = await writePlan(workspace, {
      task: "read readme",
      steps: [{
        id: "read",
        tool: "file.read",
        args: { path: "README.md" },
        reason: "Create an approval for a different tool.",
        risk: "low"
      }]
    });
    const readPending = await runPending(["agent", "run", "--plan", readPlanPath, "--json"], workspace);
    const readApprovalId = readPending.steps[0].result.approvalRequest.id;
    await approve(workspace, readApprovalId);

    const subagentPlanPath = await writePlan(workspace, {
      task: "delegate work",
      steps: [{
        id: "delegate",
        tool: "subagent.delegate",
        args: { profile: "project-inspector", task: "inspect local project" },
        reason: "This must use a matching subagent approval.",
        risk: "medium"
      }]
    });

    await assert.rejects(
      runCli(["agent", "run", "--plan", subagentPlanPath, "--approval-id", readApprovalId, "--json"], workspace),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.equal(error.code, 2);
        assert.equal(result.status, "blocked");
        assert.match(result.steps[0].result.error, /not subagent\.delegate/);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("skills create and validate procedural metadata", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta3-skills-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const created = await runCliJson(["agent", "skills", "create", "cafe-marketing-manager", "--type", "business"], workspace);
    assert.equal(created.name, "cafe-marketing-manager");
    await fs.lstat(path.join(workspace, created.skillFile));

    const validation = await runCliJson(["agent", "skills", "validate", created.path], workspace);
    assert.equal(validation.ok, true);
    assert.equal(validation.metadata.suggested_subagent, "business-operator");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("setup UI preview includes autonomy and mutating API is setup-ui gated", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta3-web-"));

  try {
    const preview = await previewWebSetup({
      goal: "agent",
      profile: "business",
      toolAutonomy: {
        preset: "business",
        overrides: {
          "web.search": "approval",
          "shell.execute_approved": "auto"
        }
      }
    }, workspace);
    assert.equal(preview.config.agent.toolAutonomy.preset, "business");
    assert.equal(preview.config.agent.toolAutonomy.overrides["web.search"], "approval");
    assert.equal(preview.config.agent.toolAutonomy.overrides["shell.execute_approved"], undefined);

    await assert.rejects(
      applyWebAgentAutonomy({
        confirm: "APPLY",
        toolAutonomy: { preset: "developer" }
      }, workspace, { setupWritesEnabled: false }),
      /disabled/
    );

    const applied = await applyWebAgentAutonomy({
      confirm: "APPLY",
      toolAutonomy: { preset: "strict" }
    }, workspace, { setupWritesEnabled: true });
    const state = await getWebSetupState(workspace, { setupWritesEnabled: true });
    assert.equal(applied.toolAutonomy.preset, "strict");
    assert.equal(state.toolAutonomy.preset, "strict");
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
