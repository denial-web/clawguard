import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { readAuditEvents, verifyAuditChain } from "../src/agent/audit.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("--think creates a thinking artifact and revised final plan", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta4-think-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n\nA project that needs release planning.\n");
    await runCliJson(["agent", "init"], workspace);
    const result = await runCliJson(["agent", "run", "review this project and prepare a safe release plan", "--think"], workspace);

    assert.equal(result.thinking.enabled, true);
    assert.equal(result.thinking.triggeredBy, "flag");
    assert.equal(result.plan.steps.some((step) => step.tool === "memory.search"), true);
    assert.equal(result.plan.steps.some((step) => step.tool === "git.status"), true);
    const artifact = JSON.parse(await fs.readFile(result.thinking.artifactPath, "utf8"));
    assert.equal(artifact.schemaVersion, "clawguard.agentThinking.v1");
    assert.equal(artifact.finalPlan.steps.length, result.plan.steps.length);
    const shown = await runCliJson(["agent", "thinking", "show", result.sessionId], workspace);
    assert.equal(shown.artifact.sessionId, result.sessionId);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("auto thinking triggers for cafe marketing role tasks and --no-think preserves single-pass behavior", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta4-role-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Cafe\n\nSmall cafe website.\n");
    await runCliJson(["agent", "init"], workspace);

    const automatic = await runCliJson([
      "agent",
      "run",
      "act as a cafe marketing manager and prepare daily weekly monthly responsibilities"
    ], workspace);
    assert.equal(automatic.thinking.enabled, true);
    assert.equal(automatic.thinking.triggeredBy, "auto");
    assert.equal(automatic.thinking.roleMatch, "small-business/cafe/marketing-manager");
    assert.equal(automatic.plan.steps.some((step) => step.tool === "memory.search"), true);

    const shallow = await runCliJson([
      "agent",
      "run",
      "act as a cafe marketing manager and prepare daily weekly monthly responsibilities",
      "--no-think"
    ], workspace);
    assert.equal(shallow.thinking.enabled, false);
    assert.equal(shallow.plan.steps.every((step) => ["file.list", "file.read"].includes(step.tool)), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("thinking flags protected asset context while tool policy still gates protected reads", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta4-protected-"));

  try {
    await fs.writeFile(path.join(workspace, ".env"), "SECRET=value\n");
    await runCliJson(["agent", "init"], workspace);
    const result = await runCliJson([
      "agent",
      "run",
      "review whether .env and data/prod.sqlite can be deleted during cleanup",
      "--think"
    ], workspace);

    const artifact = JSON.parse(await fs.readFile(result.thinking.artifactPath, "utf8"));
    assert.equal(artifact.safetyFindings.some((finding) => finding.id === "protected-asset-context"), true);

    const planPath = await writePlan(workspace, {
      task: "read env",
      steps: [{
        id: "read-env",
        tool: "file.read",
        args: { path: ".env" },
        reason: "Protected reads still require approval after thinking.",
        risk: "low"
      }]
    });
    const pending = await runPending(["agent", "run", "--plan", planPath, "--think", "--json"], workspace);
    const protectedStep = pending.steps.find((item) => item.step.id === "read-env");
    assert.equal(pending.status, "pending_approval");
    assert.equal(protectedStep.result.autonomy.protectedAsset.protected, true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("thinking audit events are hash-chain verifiable", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta4-audit-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n");
    await runCliJson(["agent", "init"], workspace);
    await runCliJson(["agent", "run", "analyze this project and propose next steps", "--think"], workspace);

    const verified = await verifyAuditChain(path.join(workspace, ".clawguard", "agent", "audit.jsonl"));
    const events = await readAuditEvents(path.join(workspace, ".clawguard", "agent", "audit.jsonl"), { limit: 100 });
    assert.equal(verified.ok, true);
    assert.equal(events.some((event) => event.type === "thinking.started"), true);
    assert.equal(events.some((event) => event.type === "thinking.completed"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("proposals cannot change agent thinking config", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-beta4-proposal-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const proposalPath = path.join(workspace, "proposal.json");
    await fs.writeFile(proposalPath, `${JSON.stringify({
      schemaVersion: "clawguard.agentActionProposal.v1",
      task: "Disable thinking.",
      tool: "file.write_safe",
      args: {
        path: ".clawguard.json",
        content: JSON.stringify({ agent: { thinking: { enabled: false } } })
      },
      reason: "This should not be changeable through proposals.",
      risk: "high"
    }, null, 2)}\n`);

    await assert.rejects(
      runCli(["agent", "proposal", "validate", proposalPath, "--json"], workspace),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /cannot change agent\.thinking/);
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

async function writePlan(workspace, plan) {
  const planPath = path.join(workspace, `plan-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return planPath;
}
