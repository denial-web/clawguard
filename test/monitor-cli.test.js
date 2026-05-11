import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("monitor flags trusted skills without approved decisions", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-monitor-"));
  const trustedDir = path.join(workspace, "skills");
  const approvalPath = path.join(workspace, ".clawguard", "approvals.jsonl");
  const decisionsPath = path.join(workspace, ".clawguard", "decisions.jsonl");
  const approvedPath = path.join(trustedDir, "approved-skill");
  const bypassPath = path.join(trustedDir, "bypass-skill");

  await writeSkill(approvedPath, "Approved Skill");
  await writeSkill(bypassPath, "Bypass Skill");
  await writeApprovalAndDecision({
    approvalPath,
    decisionsPath,
    approvalId: "approved-id",
    destination: approvedPath,
    decision: "approve"
  });

  try {
    await execFileAsync(process.execPath, [
      "src/cli.js",
      "monitor",
      trustedDir,
      "--approvals",
      approvalPath,
      "--decisions",
      decisionsPath,
      "--json"
    ], { cwd: process.cwd() });
    assert.fail("Expected monitor to exit non-zero for unapproved trusted skill.");
  } catch (error) {
    assert.equal(error.code, 1);
    const result = JSON.parse(error.stdout);
    const byName = Object.fromEntries(result.entries.map((entry) => [entry.name, entry]));

    assert.equal(result.ok, false);
    assert.equal(result.summary.checked, 2);
    assert.equal(result.summary.approved, 1);
    assert.equal(result.summary.unapproved, 1);
    assert.equal(byName["approved-skill"].approved, true);
    assert.equal(byName["approved-skill"].reason, "approved-decision");
    assert.equal(byName["bypass-skill"].approved, false);
    assert.equal(byName["bypass-skill"].reason, "no-approval-record");
    assert.equal(byName["bypass-skill"].action, "flagged");
    assert.match(error.stdout, /bypass-skill/);
  }
});

test("monitor quarantines unapproved trusted skills and writes an audit log", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-monitor-"));
  const trustedDir = path.join(workspace, "skills");
  const quarantineDir = path.join(workspace, ".clawguard", "quarantine");
  const auditLogPath = path.join(workspace, ".clawguard", "monitor.jsonl");
  const approvalPath = path.join(workspace, ".clawguard", "approvals.jsonl");
  const decisionsPath = path.join(workspace, ".clawguard", "decisions.jsonl");
  const approvedPath = path.join(trustedDir, "approved-skill");
  const bypassPath = path.join(trustedDir, "bypass-skill");

  await writeSkill(approvedPath, "Approved Skill");
  await writeSkill(bypassPath, "Bypass Skill");
  await writeApprovalAndDecision({
    approvalPath,
    decisionsPath,
    approvalId: "approved-id",
    destination: approvedPath,
    decision: "approve"
  });

  try {
    await execFileAsync(process.execPath, [
      "src/cli.js",
      "monitor",
      trustedDir,
      "--approvals",
      approvalPath,
      "--decisions",
      decisionsPath,
      "--quarantine",
      quarantineDir,
      "--audit-log",
      auditLogPath,
      "--json"
    ], { cwd: process.cwd() });
    assert.fail("Expected monitor to exit non-zero after quarantine.");
  } catch (error) {
    assert.equal(error.code, 1);
    const result = JSON.parse(error.stdout);
    const bypass = result.entries.find((entry) => entry.name === "bypass-skill");
    const audit = JSON.parse((await fs.readFile(auditLogPath, "utf8")).trim());

    assert.equal(result.summary.quarantined, 1);
    assert.equal(bypass.action, "quarantined");
    assert.match(bypass.quarantinePath, /bypass-skill/);
    await assert.rejects(fs.lstat(bypassPath), { code: "ENOENT" });
    assert.match(await fs.readFile(path.join(bypass.quarantinePath, "SKILL.md"), "utf8"), /Bypass Skill/);
    assert.match(await fs.readFile(path.join(approvedPath, "SKILL.md"), "utf8"), /Approved Skill/);
    assert.equal(audit.summary.quarantined, 1);
    assert.equal(audit.entries.some((entry) => entry.action === "quarantined"), true);
  }
});

test("monitor rejects quarantine directories inside the trusted skill directory", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-monitor-"));
  const trustedDir = path.join(workspace, "skills");

  await fs.mkdir(trustedDir, { recursive: true });

  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "monitor",
      trustedDir,
      "--quarantine",
      path.join(trustedDir, "quarantine")
    ], { cwd: process.cwd() }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /quarantine must be outside/);
      return true;
    }
  );
});

async function writeSkill(skillPath, title) {
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(path.join(skillPath, "SKILL.md"), `# ${title}\n`);
}

async function writeApprovalAndDecision({ approvalPath, decisionsPath, approvalId, destination, decision }) {
  const approval = {
    schemaVersion: "clawguard.approval.v1",
    id: approvalId,
    status: "pending",
    createdAt: "2026-05-11T00:00:00.000Z",
    framework: "openclaw",
    target: "/tmp/source-skill",
    destination,
    decision: "allow",
    risk: {
      level: "info",
      score: 0
    },
    policy: {
      preset: "governed",
      reason: "Allowed",
      requiredActions: []
    },
    install: {
      dryRun: false,
      installed: false,
      skipped: true
    },
    summary: {},
    findings: [],
    message: "Approve install?"
  };
  const decisionRecord = {
    schemaVersion: "clawguard.decision.v1",
    id: `${approvalId}-decision`,
    approvalId,
    status: decision === "approve" ? "approved" : "denied",
    decision,
    decidedAt: "2026-05-11T00:00:00.000Z",
    actor: "test-owner",
    reason: "Reviewed",
    framework: "openclaw",
    target: approval.target,
    destination,
    risk: approval.risk,
    policy: approval.policy,
    source: {
      path: approvalPath,
      approvalCreatedAt: approval.createdAt
    }
  };

  await fs.mkdir(path.dirname(approvalPath), { recursive: true });
  await fs.writeFile(approvalPath, `${JSON.stringify(approval)}\n`);
  await fs.writeFile(decisionsPath, `${JSON.stringify(decisionRecord)}\n`);
}
