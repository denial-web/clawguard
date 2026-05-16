import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { executeAgentBridgeProposal } from "../src/agent/bridge.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("bridge execute is disabled by config by default", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-bridge-disabled-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const proposalPath = await writeJson(workspace, "browser-open", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "browser.open",
      args: {
        url: "https://example.com/",
        purpose: "Read-only check."
      },
      risk: "low"
    });

    const result = await runBlocked(["agent", "bridge", "execute", proposalPath, "--json"], workspace);
    assert.equal(result.status, "blocked");
    assert.match(result.error, /disabled/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("bridge execute extracts local page only after high-risk private URL approval", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-bridge-extract-"));
  const originalFetch = globalThis.fetch;

  try {
    await runCliJson(["agent", "init"], workspace);
    await patchConfig(workspace, (config) => {
      config.agent.integrations.browserBridge.enabled = true;
      config.agent.integrations.browserBridge.allowPrivateUrls = true;
      config.agent.integrations.browserBridge.driver = "fetch";
      return config;
    });
    const proposalPath = await writeJson(workspace, "browser-extract", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "browser.extract",
      args: {
        url: "http://127.0.0.1:9876/",
        selector: "body",
        allowPrivate: true,
        purpose: "Extract a local test page through the sandboxed bridge."
      },
      risk: "high",
      reason: "Private URL bridge execution requires approval."
    });

    const pending = await executeAgentBridgeProposal({
      workspace,
      proposalPath,
      driver: "fetch"
    });
    const approvalId = pending.approvalRequest.id;

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

    globalThis.fetch = async () => new Response(
      "<html><head><title>Bridge Test</title></head><body><main id=\"content\">Bridge Hello</main></body></html>",
      {
        status: 200,
        headers: { "content-type": "text/html" }
      }
    );

    const approved = await executeAgentBridgeProposal({
      workspace,
      proposalPath,
      approvalId,
      driver: "fetch"
    });

    assert.equal(pending.status, "pending_approval");
    assert.equal(approved.status, "completed");
    assert.equal(approved.output.driver, "fetch");
    assert.equal(approved.output.title, "Bridge Test");
    assert.match(approved.output.text, /Bridge Hello/);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("bridge execute blocks proposal-only click actions", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-bridge-click-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await patchConfig(workspace, (config) => {
      config.agent.integrations.browserBridge.enabled = true;
      return config;
    });
    const proposalPath = await writeJson(workspace, "browser-click", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "browser.click_proposed",
      args: {
        url: "https://example.com/support",
        selector: "form#support button[type=submit]",
        label: "Submit",
        intent: "submit_form"
      },
      risk: "high"
    });

    const result = await runBlocked(["agent", "bridge", "execute", proposalPath, "--json"], workspace);
    assert.equal(result.status, "blocked");
    assert.match(result.error, /proposal-only/);
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

async function runBlocked(args, cwd) {
  try {
    await runCli(args, cwd);
    assert.fail("Expected command to block.");
  } catch (error) {
    assert.equal(error.code, 2);
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
