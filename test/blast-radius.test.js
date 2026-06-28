import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  explainPath,
  explainProposal,
  explainShell
} from "../src/agent/blast-radius.js";
import { verifyAuditChain } from "../src/agent/audit.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("destructive database shell command explains critical unknown-high blast radius", () => {
  const result = explainShell(["psql", "-c", "DROP DATABASE prod"]);

  assert.equal(result.schemaVersion, "clawguard.blastRadiusExplain.v1");
  assert.equal(result.action.type, "shell");
  assert.equal(result.policy.decision, "approval_required");
  assert.equal(result.policy.risk, "critical");
  assert.equal(result.blastRadius.rows.estimate, "unknown_high");
  assert.equal(result.matchedAssets.some((asset) => asset.id === "command:database-destructive"), true);
  assert.equal(result.sideEffects.some((effect) => effect.kind === "irreversible_data_loss"), true);
});

test("protected path write includes protected asset match and critical risk", () => {
  const workspace = path.join(os.tmpdir(), "clawguard-blast-path");
  const result = explainPath("data/prod.sqlite", "write", {
    workspace,
    agent: {
      protectedAssets: {
        enabled: true,
        defaultPatterns: true,
        assets: []
      }
    }
  });

  assert.equal(result.action.type, "file");
  assert.equal(result.policy.decision, "approval_required");
  assert.equal(result.policy.risk, "critical");
  assert.equal(result.matchedAssets.some((asset) => asset.id === "default:data/**"), true);
  assert.equal(result.sideEffects.some((effect) => effect.kind === "file_modification"), true);
});

test("safe read-only shell command is low-risk allow", () => {
  const result = explainShell(["git", "status"]);

  assert.equal(result.policy.decision, "allow");
  assert.equal(result.policy.risk, "low");
  assert.deepEqual(result.sideEffects, []);
});

test("evasive shell forms are blocked or escalated with unknown-high risk", () => {
  const result = explainShell(["bash", "-lc", "echo safe | base64 -d"]);

  assert.equal(result.policy.decision, "block");
  assert.equal(result.policy.risk, "critical");
  assert.equal(result.sideEffects.some((effect) => effect.estimatedScale === "unknown_high"), true);
});

test("rm blast radius distinguishes simple file delete from recursive delete flags", () => {
  const simple = explainShell(["rm", "draft.txt"]);
  const recursiveCases = [
    ["rm", "-rf", "dist"],
    ["rm", "-fr", "dist"],
    ["rm", "-r", "dist"],
    ["rm", "--recursive", "dist"]
  ];

  assert.equal(simple.policy.decision, "block");
  assert.equal(simple.sideEffects.find((effect) => effect.kind === "file_deletion").estimatedScale, "unknown_medium");
  assert.equal(simple.blastRadius.files.deleted, "unknown_medium");

  for (const argv of recursiveCases) {
    const result = explainShell(argv);
    assert.equal(result.policy.decision, "block", argv.join(" "));
    assert.equal(result.sideEffects.find((effect) => effect.kind === "file_deletion").estimatedScale, "unknown_high", argv.join(" "));
    assert.equal(result.blastRadius.files.deleted, "unknown_high", argv.join(" "));
  }
});

test("proposal explain reuses blast-radius engine for external writes", () => {
  const result = explainProposal({
    schemaVersion: "clawguard.agentActionProposal.v1",
    id: "issue-create",
    tool: "github.issue_create_approved",
    args: {
      repo: "denial-web/clawguard",
      title: "Release note",
      body: "Publish external issue."
    },
    task: "Create issue.",
    reason: "External write.",
    risk: "high"
  });

  assert.equal(result.schemaVersion, "clawguard.blastRadiusExplain.v1");
  assert.equal(result.action.type, "tool");
  assert.equal(result.policy.decision, "approval_required");
  assert.equal(result.policy.risk, "high");
  assert.equal(result.sideEffects.some((effect) => effect.kind === "external_write"), true);
});

test("shell.dry_run proposal keeps critical risk visible while marking dry run as non-executing", () => {
  const result = explainProposal({
    schemaVersion: "clawguard.agentActionProposal.v1",
    id: "dry-run-db",
    tool: "shell.dry_run",
    args: {
      argv: ["psql", "-c", "DROP DATABASE prod"]
    },
    task: "Classify DB command.",
    reason: "Dry run only.",
    risk: "low"
  });

  assert.equal(result.policy.decision, "allow");
  assert.equal(result.policy.risk, "critical");
  assert.equal(result.sideEffects.some((effect) => effect.kind === "irreversible_data_loss"), true);
  assert.match(result.policy.reasons.join(" "), /does not execute/);
});

test("top-level explain CLI prints stable JSON schema", async () => {
  const result = await runCliJson(["explain", "--argv", "psql,-c,DROP DATABASE prod"]);

  assert.equal(result.schemaVersion, "clawguard.blastRadiusExplain.v1");
  assert.equal(result.policy.decision, "approval_required");
  assert.equal(result.policy.risk, "critical");
  assert.equal(result.auditReady, true);
});

test("--argv-json preserves commas inside argv values", async () => {
  const result = await runCliJson(["explain", "--argv-json", JSON.stringify(["psql", "-c", "SELECT 1, 2"])]);

  assert.equal(result.schemaVersion, "clawguard.blastRadiusExplain.v1");
  assert.equal(result.action.raw, "psql -c SELECT 1, 2");
});

test("agent proposal explain includes blast-radius fields", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-blast-proposal-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const proposalPath = path.join(workspace, "proposal.json");
    await fs.writeFile(proposalPath, `${JSON.stringify({
      schemaVersion: "clawguard.agentActionProposal.v1",
      task: "Write a local file.",
      tool: "file.write_safe",
      args: {
        path: "data/prod.sqlite",
        content: "new"
      },
      reason: "Testing proposal explain.",
      risk: "medium"
    }, null, 2)}\n`);

    const result = await runCliJson(["agent", "proposal", "explain", proposalPath], workspace);

    assert.equal(result.policy.decision, "manual_review");
    assert.equal(result.blastRadius.schemaVersion, "clawguard.blastRadiusExplain.v1");
    assert.equal(result.blastRadius.policy.decision, "approval_required");
    assert.equal(result.blastRadius.policy.risk, "critical");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("top-level explain does not append audit outside initialized agent workspace", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-blast-no-audit-"));

  try {
    const result = await runCliJson(["explain", "--argv", "git,status"], workspace);

    assert.equal(result.auditReady, true);
    assert.equal(result.audit, undefined);
    await assert.rejects(fs.lstat(path.join(workspace, ".clawguard")), { code: "ENOENT" });
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("explain appends audit event only inside initialized agent workspace", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-blast-audit-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const result = await runCliJson(["explain", "--argv", "git,status"], workspace);
    const auditPath = await fs.realpath(path.join(workspace, ".clawguard", "agent", "audit.jsonl"));
    const verification = await verifyAuditChain(auditPath);
    const events = (await fs.readFile(auditPath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

    assert.equal(result.auditReady, true);
    assert.equal(result.audit.path, auditPath);
    assert.equal(verification.ok, true);
    assert.equal(events.some((event) => event.type === "explain.created"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

async function runCli(args, cwd = repoRoot) {
  return execFileAsync(process.execPath, [cliPath, ...args], { cwd });
}

async function runCliJson(args, cwd = repoRoot) {
  const result = await runCli([...args, "--json"], cwd);
  return JSON.parse(result.stdout);
}
