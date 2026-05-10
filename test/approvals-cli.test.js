import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("approvals send dry run renders an OpenClaw message command", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-send-"));
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const approval = approvalFixture({
    id: "approval-dry-run",
    message: "Approve install?\nDecision: BLOCK"
  });

  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "send",
    approvalPath,
    "--via",
    "openclaw",
    "--channel",
    "telegram",
    "--target",
    "123456789",
    "--dry-run"
  ], { cwd: process.cwd() });

  assert.match(result.stdout, /ClawGuard approval send: approval-dry-run/);
  assert.match(result.stdout, /Via: openclaw/);
  assert.match(result.stdout, /Dry run: yes/);
  assert.match(result.stdout, /Command: openclaw message send --channel telegram --target 123456789 --message/);
});

test("approvals send invokes a mock OpenClaw sender", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-send-"));
  const approvalPath = path.join(tempDir, "approval.json");
  const senderPath = path.join(tempDir, "fake-openclaw.mjs");
  const logPath = path.join(tempDir, "sender-log.json");
  const approval = approvalFixture({
    id: "approval-send",
    message: "Approve install?\nDecision: ALLOW"
  });

  await fs.writeFile(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);
  await fs.writeFile(senderPath, `
    import { writeFileSync } from "node:fs";
    writeFileSync(process.env.CLAWGUARD_FAKE_OPENCLAW_LOG, JSON.stringify(process.argv.slice(2)));
  `);

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "send",
    approvalPath,
    "--via",
    "openclaw",
    "--channel",
    "telegram",
    "--target",
    "123456789",
    "--sender-bin",
    process.execPath,
    "--sender-arg",
    senderPath,
    "--json"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAWGUARD_FAKE_OPENCLAW_LOG: logPath
    }
  });
  const send = JSON.parse(result.stdout);
  const senderArgs = JSON.parse(await fs.readFile(logPath, "utf8"));

  assert.equal(send.sent, true);
  assert.deepEqual(senderArgs, [
    "message",
    "send",
    "--channel",
    "telegram",
    "--target",
    "123456789",
    "--message",
    approval.message
  ]);
});

function approvalFixture(overrides = {}) {
  return {
    schemaVersion: "clawguard.approval.v1",
    id: "approval-id",
    status: "pending",
    createdAt: "2026-05-10T00:00:00.000Z",
    framework: "openclaw",
    target: "/tmp/skill",
    destination: "/tmp/trusted/skill",
    decision: "block",
    risk: {
      level: "critical",
      score: 100
    },
    policy: {
      preset: "personal",
      reason: "Risk requires approval.",
      requiredActions: ["manual-review"]
    },
    install: {
      dryRun: false,
      installed: false,
      skipped: true
    },
    summary: {
      critical: 1,
      high: 0,
      medium: 0,
      low: 0
    },
    findings: [],
    message: "Approve install?",
    ...overrides
  };
}
