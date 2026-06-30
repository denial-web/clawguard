import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  buildToolObservationRecord,
  buildToolResultAuditEvent,
  redactToolObservationText
} from "../src/agent/tool-observation-audit.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("redactToolObservationText redacts secrets and emails", () => {
  const redacted = redactToolObservationText(
    "Contact admin@example.com with api_key=supersecretvalue and sk-testsecretvalue123456789."
  );
  assert.match(redacted, /\[redacted-email\]/);
  assert.match(redacted, /\[redacted-secret\]/);
  assert.doesNotMatch(redacted, /supersecretvalue/);
});

test("buildToolObservationRecord stores redacted truncated observation", () => {
  const record = buildToolObservationRecord({
    ok: true,
    output: { content: `secret=api_key=abcdefghijklmnop\n${"safe line\n".repeat(400)}` }
  }, {
    tool: "file.read"
  }, {
    toolOutputScan: {
      enabled: true,
      captureObservations: true,
      maxObservationBytes: 512
    }
  });

  assert.equal(record.schemaVersion, "clawguard.toolObservation.v1");
  assert.equal(record.trust, "untrusted_tool_output");
  assert.equal(record.redacted, true);
  assert.equal(record.truncated, true);
  assert.ok(record.bytesStored <= 512);
  assert.match(record.content, /\[redacted-secret\]/);
  assert.equal(record.contentHash.length, 64);
});

test("buildToolObservationRecord skips capture when disabled", () => {
  const record = buildToolObservationRecord({
    ok: true,
    output: { content: "hello" }
  }, {
    tool: "file.read"
  }, {
    toolOutputScan: {
      captureObservations: false
    }
  });

  assert.equal(record, null);
});

test("buildToolResultAuditEvent includes observation for file.read", () => {
  const event = buildToolResultAuditEvent({
    result: {
      ok: true,
      status: "completed",
      output: { content: "benign readme text" },
      artifacts: []
    },
    step: {
      id: "read-readme",
      tool: "file.read",
      risk: "low",
      reason: "Read docs"
    },
    agent: {
      toolOutputScan: { enabled: true, captureObservations: true }
    }
  });

  assert.equal(event.observation.content, "benign readme text");
  assert.equal(event.step.tool, "file.read");
});

test("agent run audit captures redacted file.read observation", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-obs-audit-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.writeFile(path.join(workspace, "notes.txt"), "User email: leak@example.com\napi_key=abcdefghijklmnop\n");
    const planPath = await writePlan(workspace, {
      task: "read notes",
      steps: [{
        id: "read-notes",
        tool: "file.read",
        args: { path: "notes.txt" },
        reason: "Inspect notes.",
        risk: "low"
      }]
    });

    await runCliJson(["agent", "run", "--plan", planPath], workspace);
    const events = await readAuditEvents(path.join(workspace, ".clawguard", "agent", "audit.jsonl"));
    const toolEvent = events.findLast((event) => event.type === "tool.result");

    assert.ok(toolEvent);
    assert.equal(toolEvent.event.observation.trust, "untrusted_tool_output");
    assert.match(toolEvent.event.observation.content, /\[redacted-email\]/);
    assert.match(toolEvent.event.observation.content, /\[redacted-secret\]/);
    assert.doesNotMatch(toolEvent.event.observation.content, /leak@example.com/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

async function runCli(args, cwd) {
  return execFileAsync(process.execPath, [cliPath, ...args, "--json"], { cwd });
}

async function runCliJson(args, cwd) {
  const result = await runCli(args, cwd);
  return JSON.parse(result.stdout);
}

async function writePlan(workspace, plan) {
  const planPath = path.join(workspace, `plan-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return planPath;
}

async function readAuditEvents(auditPath) {
  const content = await fs.readFile(auditPath, "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
