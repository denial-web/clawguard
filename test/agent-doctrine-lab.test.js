import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { doctrineEntriesFromAuditEvent, sendDoctrineLabImport } from "../src/agent/doctrine-lab.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("Doctrine Lab export maps beta7 approval replay audit failures", () => {
  const entries = doctrineEntriesFromAuditEvent({
    id: "audit-1",
    type: "tool.result",
    event: {
      step: { id: "changed-action", tool: "shell.execute_approved", risk: "high" },
      ok: false,
      status: "blocked",
      error: "Approval abc action hash does not match this action."
    }
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].failure_type, "approval_replay");
  const response = JSON.parse(entries[0].response);
  assert.equal(response.decision, "block");
  assert.equal(response.risk_level, "high");
  assert.equal(response.requires_approval, false);
});

test("agent doctrine export creates Doctrine Lab import payload from pending approval audit", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-doctrine-export-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const planPath = await writePlan(workspace, {
      task: "approve exact shell action",
      steps: [{
        id: "node-version",
        tool: "shell.execute_approved",
        args: { argv: [process.execPath, "--version"] },
        reason: "Needs approval before shell execution.",
        risk: "high"
      }]
    });

    await runPendingJson(["agent", "run", "--plan", planPath], workspace);
    const exported = await runCliJson([
      "agent",
      "doctrine",
      "export",
      "--no-approvals",
      "--json"
    ], workspace);

    assert.equal(exported.schemaVersion, "clawguard.doctrineLabExport.v1");
    assert.equal(exported.payload.category, "agent_safety");
    assert.equal(exported.payload.source, "clawguard");
    assert.equal(exported.payload.source_runtime, "clawguard:beta7");
    assert.equal(exported.payload.entries.length, 1);
    assert.equal(exported.payload.entries[0].failure_type, "unsafe_tool_call");
    assert.equal(exported.payload.entries[0].trace_id.startsWith("clawguard-audit:"), true);
    const response = JSON.parse(exported.payload.entries[0].response);
    assert.equal(response.decision, "approval_required");
    assert.equal(response.requires_approval, true);
    assert.equal(response.action_type, "shell.execute_approved");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("Doctrine Lab send refuses non-loopback endpoints", async () => {
  await assert.rejects(
    sendDoctrineLabImport({
      dataset_name: "x",
      category: "agent_safety",
      language: "en",
      batch_id: "x",
      entries: [{ prompt: "p", response: "{}", failure_type: "unsafe_tool_call", critic_scores: {}, trace_id: "t" }]
    }, {
      baseUrl: "https://example.com"
    }),
    /loopback/
  );
});

test("Doctrine Lab send uses API key from configured environment variable", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.DOCTRINE_LAB_API_KEY;
  let observedHeaders;

  try {
    process.env.DOCTRINE_LAB_API_KEY = "test-doctrine-key";
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "http://127.0.0.1:8000/api/datasets/import");
      observedHeaders = options.headers;
      return new Response(JSON.stringify({ status: "success", added: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const delivery = await sendDoctrineLabImport({
      dataset_name: "x",
      category: "agent_safety",
      language: "en",
      batch_id: "x",
      entries: [{ prompt: "p", response: "{}", failure_type: "unsafe_tool_call", critic_scores: {}, trace_id: "t" }]
    });

    assert.equal(delivery.sent, true);
    assert.equal(observedHeaders["X-API-Key"], "test-doctrine-key");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) {
      delete process.env.DOCTRINE_LAB_API_KEY;
    } else {
      process.env.DOCTRINE_LAB_API_KEY = previousKey;
    }
  }
});

async function runCli(args, cwd) {
  return execFileAsync(process.execPath, [cliPath, ...args, "--json"], { cwd });
}

async function runCliJson(args, cwd) {
  const result = await runCli(args, cwd);
  return JSON.parse(result.stdout);
}

async function runPendingJson(args, cwd) {
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
