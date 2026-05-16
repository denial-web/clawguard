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

test("browser proposal validate and explain accept public read-only actions", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-browser-open-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const proposalPath = await writeJson(workspace, "browser-open", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      source: "browser-bridge",
      task: "Open a public pricing page.",
      tool: "browser.open",
      args: {
        url: "https://example.com/pricing",
        purpose: "Manual public page review."
      },
      risk: "low",
      reason: "Read-only browser handoff."
    });

    const validated = await runCliJson(["agent", "proposal", "validate", proposalPath], workspace);
    const explained = await runCliJson(["agent", "proposal", "explain", proposalPath], workspace);
    const run = await runCliJson(["agent", "proposal", "run", proposalPath], workspace);

    assert.equal(validated.proposal.tool, "browser.open");
    assert.equal(explained.policy.approvalRequired, false);
    assert.equal(explained.policy.execution, "external_bridge_dry_run");
    assert.equal(run.status, "completed");
    assert.equal(run.steps[0].result.output.mode, "dry_run");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("browser proposal validation blocks private and credential URLs", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-browser-block-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const privatePath = await writeJson(workspace, "browser-private", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "browser.open",
      args: { url: "http://127.0.0.1:3000/admin" },
      risk: "low"
    });
    const credentialPath = await writeJson(workspace, "browser-credential", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "browser.open",
      args: { url: "https://user:pass@example.com/admin" },
      risk: "low"
    });

    await assert.rejects(
      runCli(["agent", "proposal", "validate", privatePath, "--json"], workspace),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /private URLs/);
        return true;
      }
    );
    await assert.rejects(
      runCli(["agent", "proposal", "validate", credentialPath, "--json"], workspace),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /credentials/);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("browser click proposals require high-risk approval for submit actions", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-browser-click-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const lowRiskPath = await writeJson(workspace, "browser-click-low", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "browser.click_proposed",
      args: {
        url: "https://example.com/support",
        selector: "form#support button[type=submit]",
        label: "Submit",
        intent: "submit_form"
      },
      risk: "medium"
    });
    const highRiskPath = await writeJson(workspace, "browser-click-high", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "browser.click_proposed",
      args: {
        url: "https://example.com/support",
        selector: "form#support button[type=submit]",
        label: "Submit",
        intent: "submit_form"
      },
      risk: "high",
      reason: "Submit a support form only after approval."
    });

    await assert.rejects(
      runCli(["agent", "proposal", "validate", lowRiskPath, "--json"], workspace),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /require high or critical risk/);
        return true;
      }
    );

    const pending = await runPending(["agent", "proposal", "run", highRiskPath, "--json"], workspace);
    const approvalId = pending.steps[0].result.approvalRequest.id;
    await runCliJson([
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
    const approved = await runCliJson(["agent", "proposal", "run", highRiskPath, "--approval-id", approvalId], workspace);

    assert.equal(pending.status, "pending_approval");
    assert.equal(approved.status, "completed");
    assert.equal(approved.steps[0].result.output.mode, "approved_dry_run");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("browser type proposals reject sensitive fields and credential-like text", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-browser-type-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const passwordPath = await writeJson(workspace, "browser-type-password", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "browser.type_proposed",
      args: {
        url: "https://example.com/login",
        selector: "input#password",
        field: "password",
        text: "not-for-agents"
      },
      risk: "high"
    });
    const tokenTextPath = await writeJson(workspace, "browser-type-token", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "browser.type_proposed",
      args: {
        url: "https://example.com/settings",
        selector: "textarea#notes",
        field: "notes",
        text: "token: abc123"
      },
      risk: "high"
    });

    await assert.rejects(runCli(["agent", "proposal", "validate", passwordPath, "--json"], workspace));
    await assert.rejects(runCli(["agent", "proposal", "validate", tokenTextPath, "--json"], workspace));
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("app action proposals require high-risk approval", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-app-action-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const lowRiskPath = await writeJson(workspace, "app-action-low", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "app.action_proposed",
      args: {
        app: "Mail",
        action: "send",
        target: "external recipient"
      },
      risk: "medium"
    });
    const highRiskPath = await writeJson(workspace, "app-action-high", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "app.action_proposed",
      args: {
        app: "Notes",
        action: "create-note",
        target: "local note",
        purpose: "Create a local note through an external bridge."
      },
      risk: "high"
    });

    await assert.rejects(
      runCli(["agent", "proposal", "validate", lowRiskPath, "--json"], workspace),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /risk must be high or critical/);
        return true;
      }
    );

    const pending = await runPending(["agent", "proposal", "run", highRiskPath, "--json"], workspace);
    assert.equal(pending.status, "pending_approval");
    assert.equal(pending.steps[0].result.approvalRequest.status, "pending");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("bridge spec command exposes one-action approval contract", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-bridge-spec-"));

  try {
    const spec = await runCliJson(["agent", "bridge", "spec"], workspace);
    assert.equal(spec.schemaVersion, "clawguard.agentBridgeSpec.v1");
    assert.equal(spec.executionContract.oneActionPerApproval, true);
    assert.equal(spec.proposalTools.includes("browser.click_proposed"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("web research recipe uses read-only search and dry-run browser proposal", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-web-research-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await patchConfig(workspace, (config) => {
      config.agent.integrations.webSearch.provider = "mock";
      return config;
    });

    const result = await runCliJson(["agent", "run", "--recipe", "web.research", "research ClawGuard"], workspace);

    assert.equal(result.status, "completed");
    assert.equal(result.plan.steps[0].tool, "web.search");
    assert.equal(result.plan.steps[1].tool, "browser.open");
    assert.equal(result.steps[1].result.output.mode, "dry_run");
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

async function writeJson(workspace, prefix, value) {
  const filePath = path.join(workspace, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

async function patchConfig(workspace, update) {
  const configPath = path.join(workspace, ".clawguard.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  await fs.writeFile(configPath, `${JSON.stringify(update(config), null, 2)}\n`);
}

