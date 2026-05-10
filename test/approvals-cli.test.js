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

test("approvals send dry run renders a redacted Telegram request", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-send-"));
  const approvalPath = path.join(tempDir, "approval.json");
  const approval = approvalFixture({
    id: "approval-telegram",
    message: "Approve install?\nDecision: BLOCK"
  });

  await fs.writeFile(approvalPath, `${JSON.stringify(approval, null, 2)}\n`);

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "send",
    approvalPath,
    "--via",
    "telegram",
    "--chat-id",
    "123456789",
    "--bot-token",
    "123456:SECRET",
    "--dry-run",
    "--json"
  ], { cwd: process.cwd() });
  const send = JSON.parse(result.stdout);

  assert.equal(send.via, "telegram");
  assert.equal(send.channel, "telegram");
  assert.equal(send.target, "123456789");
  assert.equal(send.sent, false);
  assert.equal(send.request.chat_id, "123456789");
  assert.equal(send.request.text, approval.message);
  assert.equal(send.endpoint.includes("SECRET"), false);
  assert.match(send.endpoint, /bot<redacted>\/sendMessage$/);
});

test("approvals send telegram requires a bot token", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-send-"));
  const approvalPath = path.join(tempDir, "approval.json");

  await fs.writeFile(approvalPath, `${JSON.stringify(approvalFixture())}\n`);

  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "approvals",
      "send",
      approvalPath,
      "--via",
      "telegram",
      "--chat-id",
      "123456789",
      "--dry-run"
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: ""
      }
    }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Telegram send requires --bot-token or TELEGRAM_BOT_TOKEN/);
      return true;
    }
  );
});

test("approvals watch dry run sends new pending approvals once", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-watch-"));
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const statePath = path.join(tempDir, "sent.json");
  const skipped = approvalFixture({
    id: "already-sent",
    message: "Already sent"
  });
  const pending = approvalFixture({
    id: "new-pending",
    message: "New approval needed"
  });
  const closed = approvalFixture({
    id: "closed",
    status: "approved",
    message: "Closed approval"
  });

  await fs.writeFile(approvalPath, [
    JSON.stringify(skipped),
    JSON.stringify(pending),
    JSON.stringify(closed),
    ""
  ].join("\n"));
  await fs.writeFile(statePath, `${JSON.stringify({
    schemaVersion: "clawguard.approval-watch-state.v1",
    sentIds: ["already-sent"]
  })}\n`);

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "watch",
    approvalPath,
    "--via",
    "telegram",
    "--chat-id",
    "123456789",
    "--bot-token",
    "123456:SECRET",
    "--state",
    statePath,
    "--once",
    "--dry-run",
    "--json"
  ], { cwd: process.cwd() });
  const watch = JSON.parse(result.stdout);

  assert.equal(watch.checked, 3);
  assert.equal(watch.matched, 1);
  assert.equal(watch.sent, 0);
  assert.equal(watch.skipped, 2);
  assert.equal(watch.deliveries.length, 1);
  assert.equal(watch.deliveries[0].approval.id, "new-pending");
  assert.equal(watch.deliveries[0].request.text, "New approval needed");
  assert.equal(watch.deliveries[0].endpoint.includes("SECRET"), false);
});

test("approvals watch records sent approvals in state", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-watch-"));
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const statePath = path.join(tempDir, "sent.json");
  const senderPath = path.join(tempDir, "fake-openclaw.mjs");
  const logPath = path.join(tempDir, "sender-log.jsonl");
  const approval = approvalFixture({
    id: "watch-openclaw",
    message: "Watch approval"
  });

  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);
  await fs.writeFile(senderPath, `
    import { appendFileSync } from "node:fs";
    appendFileSync(process.env.CLAWGUARD_FAKE_OPENCLAW_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
  `);

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "watch",
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
    "--state",
    statePath,
    "--once",
    "--json"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAWGUARD_FAKE_OPENCLAW_LOG: logPath
    }
  });
  const watch = JSON.parse(result.stdout);
  const state = JSON.parse(await fs.readFile(statePath, "utf8"));
  const senderCalls = (await fs.readFile(logPath, "utf8")).trim().split(/\r?\n/);

  assert.equal(watch.matched, 1);
  assert.equal(watch.sent, 1);
  assert.deepEqual(state.sentIds, ["watch-openclaw"]);
  assert.equal(senderCalls.length, 1);

  const secondResult = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "watch",
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
    "--state",
    statePath,
    "--once",
    "--json"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CLAWGUARD_FAKE_OPENCLAW_LOG: logPath
    }
  });
  const secondWatch = JSON.parse(secondResult.stdout);
  const secondSenderCalls = (await fs.readFile(logPath, "utf8")).trim().split(/\r?\n/);

  assert.equal(secondWatch.matched, 0);
  assert.equal(secondWatch.sent, 0);
  assert.equal(secondWatch.skipped, 1);
  assert.equal(secondSenderCalls.length, 1);
});

test("approvals decide writes a durable decision record", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-decide-"));
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const decisionPath = path.join(tempDir, "decisions.jsonl");
  const approval = approvalFixture({
    id: "decision-target",
    decision: "manual_review",
    risk: {
      level: "medium",
      score: 55
    },
    target: "/tmp/candidate-skill",
    destination: "/tmp/trusted/candidate-skill"
  });

  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "decide",
    approvalPath,
    "--id",
    "decision-target",
    "--decision",
    "approve",
    "--actor",
    "denial",
    "--reason",
    "Looks safe after review",
    "--out",
    decisionPath,
    "--json"
  ], { cwd: process.cwd() });
  const output = JSON.parse(result.stdout);
  const decision = JSON.parse((await fs.readFile(decisionPath, "utf8")).trim());

  assert.equal(output.approval.id, "decision-target");
  assert.equal(output.outputPath, decisionPath);
  assert.equal(decision.schemaVersion, "clawguard.decision.v1");
  assert.equal(decision.approvalId, "decision-target");
  assert.equal(decision.status, "approved");
  assert.equal(decision.decision, "approve");
  assert.equal(decision.actor, "denial");
  assert.equal(decision.reason, "Looks safe after review");
  assert.equal(decision.framework, "openclaw");
  assert.equal(decision.target, "/tmp/candidate-skill");
  assert.equal(decision.destination, "/tmp/trusted/candidate-skill");
  assert.deepEqual(decision.risk, {
    level: "medium",
    score: 55
  });
});

test("approvals decide requires an approval id", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-decide-"));
  const approvalPath = path.join(tempDir, "approvals.jsonl");

  await fs.writeFile(approvalPath, `${JSON.stringify(approvalFixture())}\n`);

  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "approvals",
      "decide",
      approvalPath,
      "--decision",
      "deny"
    ], { cwd: process.cwd() }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /approvals decide requires --id <id>/);
      return true;
    }
  );
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
