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

test("approvals poll-telegram writes decisions from Telegram replies", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-poll-"));
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const decisionPath = path.join(tempDir, "decisions.jsonl");
  const offsetPath = path.join(tempDir, "telegram-offset.json");
  const approval = approvalFixture({
    id: "telegram-approval",
    decision: "manual_review",
    risk: {
      level: "high",
      score: 80
    }
  });
  const updatesPath = path.join(tempDir, "telegram-updates.json");
  const updates = [
    {
      update_id: 100,
      message: {
        text: "hello",
        from: {
          id: 111,
          username: "noise"
        },
        chat: {
          id: 222
        }
      }
    },
    {
      update_id: 101,
      message: {
        text: "approve telegram-approval reviewed in Telegram",
        from: {
          id: 333,
          username: "owner"
        },
        chat: {
          id: 444
        }
      }
    }
  ];

  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);
  await fs.writeFile(updatesPath, `${JSON.stringify({
    ok: true,
    result: updates
  })}\n`);

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "poll-telegram",
    approvalPath,
    "--decisions",
    decisionPath,
    "--offset-state",
    offsetPath,
    "--telegram-updates-file",
    updatesPath,
    "--json"
  ], { cwd: process.cwd() });
  const poll = JSON.parse(result.stdout);
  const decision = JSON.parse((await fs.readFile(decisionPath, "utf8")).trim());
  const offset = JSON.parse(await fs.readFile(offsetPath, "utf8"));

  assert.equal(poll.checked, 2);
  assert.equal(poll.commands, 1);
  assert.equal(poll.decided, 1);
  assert.equal(poll.skipped, 1);
  assert.equal(poll.nextOffset, 102);
  assert.equal(decision.schemaVersion, "clawguard.decision.v1");
  assert.equal(decision.approvalId, "telegram-approval");
  assert.equal(decision.decision, "approve");
  assert.equal(decision.status, "approved");
  assert.equal(decision.actor, "telegram:owner");
  assert.equal(decision.reason, "reviewed in Telegram");
  assert.equal(offset.nextOffset, 102);
});

test("approvals poll-telegram dry run does not write decisions or offset state", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-poll-"));
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const decisionPath = path.join(tempDir, "decisions.jsonl");
  const offsetPath = path.join(tempDir, "telegram-offset.json");
  const approval = approvalFixture({
    id: "telegram-deny"
  });
  const updatesPath = path.join(tempDir, "telegram-updates.json");
  const updates = [
    {
      update_id: 200,
      message: {
        text: "deny telegram-deny suspicious network access",
        from: {
          id: 555
        },
        chat: {
          id: 666
        }
      }
    }
  ];

  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);
  await fs.writeFile(updatesPath, `${JSON.stringify(updates)}\n`);

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "poll-telegram",
    approvalPath,
    "--decisions",
    decisionPath,
    "--offset-state",
    offsetPath,
    "--telegram-updates-file",
    updatesPath,
    "--dry-run",
    "--json"
  ], { cwd: process.cwd() });
  const poll = JSON.parse(result.stdout);

  assert.equal(poll.checked, 1);
  assert.equal(poll.commands, 1);
  assert.equal(poll.decided, 0);
  assert.equal(poll.decisions.length, 1);
  assert.equal(poll.decisions[0].decision, "deny");
  assert.equal(poll.decisions[0].actor, "telegram:555");
  await assert.rejects(fs.stat(decisionPath), { code: "ENOENT" });
  await assert.rejects(fs.stat(offsetPath), { code: "ENOENT" });
});

test("approvals apply copies an approved skill to the recorded destination", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-apply-"));
  const sourcePath = path.join(tempDir, "candidate-skill");
  const destinationPath = path.join(tempDir, "trusted", "candidate-skill");
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const decisionPath = path.join(tempDir, "decisions.jsonl");

  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "# Candidate Skill\n");
  await fs.writeFile(approvalPath, `${JSON.stringify(approvalFixture({
    id: "apply-approved",
    target: sourcePath,
    destination: destinationPath,
    decision: "manual_review"
  }))}\n`);
  await fs.writeFile(decisionPath, `${JSON.stringify(decisionFixture({
    approvalId: "apply-approved",
    decision: "approve",
    status: "approved"
  }))}\n`);

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "apply",
    approvalPath,
    "--id",
    "apply-approved",
    "--decisions",
    decisionPath,
    "--json"
  ], { cwd: process.cwd() });
  const apply = JSON.parse(result.stdout);
  const installedSkill = await fs.readFile(path.join(destinationPath, "SKILL.md"), "utf8");

  assert.equal(apply.installed, true);
  assert.equal(apply.skipped, false);
  assert.equal(apply.decision.decision, "approve");
  assert.equal(installedSkill, "# Candidate Skill\n");
});

test("approvals apply blocks denied decisions before copying", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-apply-"));
  const sourcePath = path.join(tempDir, "candidate-skill");
  const destinationPath = path.join(tempDir, "trusted", "candidate-skill");
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const decisionPath = path.join(tempDir, "decisions.jsonl");

  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "# Candidate Skill\n");
  await fs.writeFile(approvalPath, `${JSON.stringify(approvalFixture({
    id: "apply-denied",
    target: sourcePath,
    destination: destinationPath
  }))}\n`);
  await fs.writeFile(decisionPath, `${JSON.stringify(decisionFixture({
    approvalId: "apply-denied",
    decision: "deny",
    status: "denied",
    reason: "Unexpected shell access"
  }))}\n`);

  try {
    await execFileAsync(process.execPath, [
      "src/cli.js",
      "approvals",
      "apply",
      approvalPath,
      "--id",
      "apply-denied",
      "--decisions",
      decisionPath,
      "--json"
    ], { cwd: process.cwd() });
    assert.fail("Expected denied approval apply to fail.");
  } catch (error) {
    assert.equal(error.code, 2);
    const apply = JSON.parse(error.stdout);
    assert.equal(apply.installed, false);
    assert.equal(apply.decision.decision, "deny");
    assert.equal(apply.reason, "Unexpected shell access");
    await assert.rejects(fs.lstat(destinationPath), { code: "ENOENT" });
  }
});

test("approvals apply pauses when no decision exists yet", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-apply-"));
  const sourcePath = path.join(tempDir, "candidate-skill");
  const destinationPath = path.join(tempDir, "trusted", "candidate-skill");
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const decisionPath = path.join(tempDir, "decisions.jsonl");

  await fs.mkdir(sourcePath, { recursive: true });
  await fs.writeFile(path.join(sourcePath, "SKILL.md"), "# Candidate Skill\n");
  await fs.writeFile(approvalPath, `${JSON.stringify(approvalFixture({
    id: "apply-pending",
    target: sourcePath,
    destination: destinationPath
  }))}\n`);

  try {
    await execFileAsync(process.execPath, [
      "src/cli.js",
      "approvals",
      "apply",
      approvalPath,
      "--id",
      "apply-pending",
      "--decisions",
      decisionPath,
      "--json"
    ], { cwd: process.cwd() });
    assert.fail("Expected pending approval apply to pause.");
  } catch (error) {
    assert.equal(error.code, 1);
    const apply = JSON.parse(error.stdout);
    assert.equal(apply.decision, undefined);
    assert.equal(apply.reason, "No decision has been recorded for this approval.");
    await assert.rejects(fs.lstat(destinationPath), { code: "ENOENT" });
  }
});

test("approvals doctor reports setup checks and suggested commands", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-doctor-"));
  const approvalPath = path.join(tempDir, "approvals.jsonl");
  const decisionsPath = path.join(tempDir, "decisions.jsonl");
  const installDir = path.join(tempDir, "skills");

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "doctor",
    "--approval-out",
    approvalPath,
    "--decisions",
    decisionsPath,
    "--to",
    installDir,
    "--target",
    "./candidate",
    "--chat-id",
    "123456789",
    "--bot-token",
    "123456:SECRET",
    "--json"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TELEGRAM_BOT_TOKEN: ""
    }
  });
  const doctor = JSON.parse(result.stdout);
  const checks = Object.fromEntries(doctor.checks.map((check) => [check.id, check]));

  assert.equal(doctor.ok, true);
  assert.equal(doctor.framework, "openclaw");
  assert.equal(checks["node-version"].status, "pass");
  assert.equal(checks["telegram-token"].status, "pass");
  assert.equal(checks["telegram-chat"].status, "pass");
  assert.equal(checks["approval-directory-writable"].status, "pass");
  assert.match(doctor.commands.guardedInstall, /openclaw install \.\/candidate/);
  assert.match(doctor.commands.watchTelegram, /approvals watch/);
  assert.match(doctor.commands.pollTelegram, /approvals poll-telegram/);
  assert.match(doctor.commands.applyDecision, /approvals apply/);
  assert.equal(doctor.commands.watchTelegram.includes("SECRET"), false);
});

test("approvals doctor warns when Telegram setup is incomplete", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-approval-doctor-"));

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "doctor",
    "--approval-out",
    path.join(tempDir, "approvals.jsonl"),
    "--decisions",
    path.join(tempDir, "decisions.jsonl"),
    "--to",
    path.join(tempDir, "skills"),
    "--framework",
    "hermes",
    "--json"
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TELEGRAM_BOT_TOKEN: ""
    }
  });
  const doctor = JSON.parse(result.stdout);
  const checks = Object.fromEntries(doctor.checks.map((check) => [check.id, check]));

  assert.equal(doctor.ok, true);
  assert.equal(doctor.framework, "hermes");
  assert.equal(checks["telegram-token"].status, "warn");
  assert.equal(checks["telegram-chat"].status, "warn");
  assert.match(doctor.commands.guardedInstall, /hermes install/);
});

test("approvals doctor rejects unsupported framework values", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "approvals",
      "doctor",
      "--framework",
      "unknown"
    ], { cwd: process.cwd() }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Invalid --framework value/);
      return true;
    }
  );
});

test("approvals demo-flow runs a full local approval loop", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "demo-flow",
    "--keep",
    "--json"
  ], { cwd: process.cwd() });
  const demo = JSON.parse(result.stdout);

  try {
    assert.equal(demo.ok, true);
    assert.equal(demo.cleanedUp, false);
    assert.equal(demo.kept, true);
    assert.equal(demo.framework, "openclaw");
    assert.equal(demo.policy, "governed");
    assert.equal(demo.scan.decision, "allow");
    assert.equal(demo.approval.status, "pending");
    assert.equal(demo.decision.decision, "approve");
    assert.equal(demo.apply.installed, true);
    assert.match(demo.paths.approvalPath, /approvals\.jsonl$/);
    assert.match(demo.paths.decisionsPath, /decisions\.jsonl$/);

    const installedSkill = await fs.readFile(demo.paths.installedSkill, "utf8");
    const approvalLog = await fs.readFile(demo.paths.approvalPath, "utf8");
    const decisionLog = await fs.readFile(demo.paths.decisionsPath, "utf8");

    assert.match(installedSkill, /ClawGuard Demo Skill/);
    assert.match(approvalLog, new RegExp(demo.approval.id));
    assert.match(decisionLog, new RegExp(demo.approval.id));
  } finally {
    await fs.rm(demo.workspace, { recursive: true, force: true });
  }
});

test("approvals demo-flow cleans up its temporary workspace by default", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "approvals",
    "demo-flow",
    "--framework",
    "hermes",
    "--json"
  ], { cwd: process.cwd() });
  const demo = JSON.parse(result.stdout);

  assert.equal(demo.ok, true);
  assert.equal(demo.framework, "hermes");
  assert.equal(demo.cleanedUp, true);
  await assert.rejects(fs.stat(demo.workspace), { code: "ENOENT" });
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

function decisionFixture(overrides = {}) {
  return {
    schemaVersion: "clawguard.decision.v1",
    id: "decision-id",
    approvalId: "approval-id",
    status: "approved",
    decision: "approve",
    decidedAt: "2026-05-10T00:00:00.000Z",
    actor: "test-owner",
    reason: "Reviewed",
    framework: "openclaw",
    target: "/tmp/skill",
    destination: "/tmp/trusted/skill",
    risk: {
      level: "medium",
      score: 55
    },
    policy: {
      preset: "governed",
      reason: "Review required.",
      requiredActions: ["manual-review"]
    },
    source: {
      path: "/tmp/approvals.jsonl",
      approvalCreatedAt: "2026-05-10T00:00:00.000Z"
    },
    ...overrides
  };
}
