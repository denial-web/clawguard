#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(rootDir, "src", "cli.js");

const keep = process.argv.includes("--keep");
const json = process.argv.includes("--json");
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-protected-demo-"));
const transcript = [];

try {
  await seedWorkspace();

  await step("Initialize ClawGuard Agent state", ["agent", "init", "--json"]);
  const dbAsset = await step("Configure company database as approval-required", [
    "agent",
    "protected",
    "add",
    "company-prod-db",
    "--type",
    "database",
    "--path",
    "data/prod.sqlite",
    "--operations",
    "read,write,execute,cleanup",
    "--reason",
    "Company production database.",
    "--json"
  ]);
  const backupAsset = await step("Configure customer backups as blocked", [
    "agent",
    "protected",
    "block",
    "customer-backups",
    "--type",
    "customer_data",
    "--path",
    "backups/customer/**",
    "--operations",
    "read,write,cleanup",
    "--reason",
    "Customer backups are off limits in local beta.",
    "--json"
  ]);
  const list = await step("List protected asset policy", ["agent", "protected", "list", "--json"]);
  const dbWriteCheck = await step("Check database write policy", [
    "agent",
    "protected",
    "check",
    "data/prod.sqlite",
    "--operation",
    "write",
    "--json"
  ], { expectCode: 1 });
  const backupCleanupCheck = await step("Check customer backup cleanup policy", [
    "agent",
    "protected",
    "check",
    "backups/customer/prod.dump",
    "--operation",
    "cleanup",
    "--json"
  ], { expectCode: 2 });

  const readPlan = await writePlan("protected-read-plan.json", {
    task: "try to read protected env",
    steps: [{
      id: "read-env",
      tool: "file.read",
      args: { path: ".env" },
      reason: "This should require approval before content is shown.",
      risk: "low"
    }]
  });
  const protectedRead = await step("Agent attempts protected .env read", [
    "agent",
    "run",
    "--plan",
    readPlan,
    "--json"
  ], { expectCode: 1 });

  const cleanupPlan = await writePlan("protected-cleanup-plan.json", {
    task: "try to clean generated and protected files",
    steps: [{
      id: "cleanup",
      tool: "project.cleanup_safe",
      args: { include: ["data/prod.sqlite", "backups/customer/prod.dump", "dist"] },
      reason: "Only generated output should be movable.",
      risk: "high"
    }]
  });
  const cleanup = await step("Agent attempts cleanup including protected assets", [
    "agent",
    "run",
    "--plan",
    cleanupPlan,
    "--json"
  ], { expectCode: 1 });

  const dbDropCheck = await step("Check destructive database shell command", [
    "agent",
    "protected",
    "check",
    "--argv",
    "psql,-c,DROP DATABASE prod",
    "--json"
  ], { expectCode: 1 });
  const inlineDeleteCheck = await step("Check inline interpreter deletion command", [
    "agent",
    "protected",
    "check",
    "--argv",
    "node,-e,require('fs').rmSync('data/prod.sqlite')",
    "--json"
  ], { expectCode: 2 });

  const assertions = buildAssertions({
    dbAsset,
    backupAsset,
    list,
    dbWriteCheck,
    backupCleanupCheck,
    protectedRead,
    cleanup,
    dbDropCheck,
    inlineDeleteCheck
  });
  const failed = assertions.filter((item) => !item.pass);
  if (failed.length > 0) {
    throw new Error(`Protected asset demo invariant failed: ${failed.map((item) => item.label).join("; ")}`);
  }

  const result = {
    schemaVersion: "clawguard.protectedAssetDemo.v1",
    workspace,
    kept: keep,
    counts: summarizeCounts({ list, cleanup }),
    assertions,
    steps: transcript
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanDemo(result);
  }
} finally {
  if (!keep) {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

async function seedWorkspace() {
  await fs.mkdir(path.join(workspace, "data"), { recursive: true });
  await fs.mkdir(path.join(workspace, "backups", "customer"), { recursive: true });
  await fs.mkdir(path.join(workspace, "dist"), { recursive: true });
  await fs.writeFile(path.join(workspace, "README.md"), "# Protected Asset Demo\n");
  await fs.writeFile(path.join(workspace, ".env"), "DATABASE_URL=postgres://prod-secret\n");
  await fs.writeFile(path.join(workspace, "data", "prod.sqlite"), "production database bytes\n");
  await fs.writeFile(path.join(workspace, "backups", "customer", "prod.dump"), "customer backup bytes\n");
  await fs.writeFile(path.join(workspace, "dist", "bundle.js"), "generated output\n");
}

async function writePlan(name, plan) {
  const filePath = path.join(workspace, name);
  await fs.writeFile(filePath, `${JSON.stringify(plan, null, 2)}\n`);
  return filePath;
}

async function step(label, args, options = {}) {
  const expectCode = options.expectCode ?? 0;
  const command = ["clawguard", ...args].join(" ");
  let stdout = "";
  let stderr = "";
  let code = 0;

  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd: workspace,
      maxBuffer: 1024 * 1024
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    code = error.code ?? 1;
    stdout = error.stdout ?? "";
    stderr = error.stderr ?? "";
  }

  const parsed = stdout.trim() ? JSON.parse(stdout) : null;
  transcript.push({
    label,
    command,
    exitCode: code,
    expectedExitCode: expectCode,
    ok: code === expectCode
  });

  if (code !== expectCode) {
    throw new Error(`${label} exited ${code}, expected ${expectCode}: ${stderr || stdout}`);
  }

  return parsed;
}

function buildAssertions({
  dbAsset,
  backupAsset,
  list,
  dbWriteCheck,
  backupCleanupCheck,
  protectedRead,
  cleanup,
  dbDropCheck,
  inlineDeleteCheck
}) {
  const cleanupOutput = cleanup.steps[0].result.output.plan;
  const blockedPaths = new Set(cleanupOutput.blocked.map((item) => item.path));
  const proposedPaths = new Set(cleanupOutput.proposed.map((item) => item.path));

  return [
    check("Configured database as approval-required", dbAsset.asset.id === "company-prod-db" && dbAsset.asset.decision === "approval_required", dbAsset.asset),
    check("Configured customer backups as blocked", backupAsset.asset.id === "customer-backups" && backupAsset.asset.decision === "block", backupAsset.asset),
    check("Protected policy lists default and custom assets", list.defaultPatterns === true && list.assets.length === 2, {
      defaultPatterns: list.defaultPatterns,
      customAssets: list.assets.length
    }),
    check("Database write check requires approval", dbWriteCheck.decision === "approval_required" && dbWriteCheck.risk === "critical", {
      decision: dbWriteCheck.decision,
      risk: dbWriteCheck.risk
    }),
    check("Customer backup cleanup check blocks", backupCleanupCheck.decision === "block" && backupCleanupCheck.protected === true, {
      decision: backupCleanupCheck.decision
    }),
    check("Protected .env read pauses without revealing secret", protectedRead.status === "pending_approval" && !JSON.stringify(protectedRead).includes("prod-secret"), {
      status: protectedRead.status
    }),
    check("Cleanup blocks protected assets but proposes generated output", blockedPaths.has("data/prod.sqlite") && blockedPaths.has("backups/customer/prod.dump") && proposedPaths.has("dist"), {
      blocked: [...blockedPaths],
      proposed: [...proposedPaths]
    }),
    check("Destructive DB shell command requires approval", dbDropCheck.decision === "approval_required" && dbDropCheck.risk === "critical", {
      decision: dbDropCheck.decision,
      risk: dbDropCheck.risk
    }),
    check("Inline interpreter deletion is blocked", inlineDeleteCheck.decision === "block" && inlineDeleteCheck.risk === "critical", {
      decision: inlineDeleteCheck.decision,
      risk: inlineDeleteCheck.risk
    })
  ];
}

function summarizeCounts({ list, cleanup }) {
  const cleanupPlan = cleanup.steps[0].result.output.plan;
  return {
    customProtectedAssets: list.assets.length,
    defaultPatternsEnabled: list.defaultPatternList.length,
    pendingApprovalsCreated: 2,
    blockedCleanupPaths: cleanupPlan.blocked.length,
    generatedCleanupPathsProposed: cleanupPlan.proposed.length,
    hardBlocksDemonstrated: 2
  };
}

function check(label, pass, detail = {}) {
  return {
    label,
    pass: Boolean(pass),
    detail
  };
}

function printHumanDemo(result) {
  console.log("ClawGuard Protected Asset Demo");
  console.log(`Workspace: ${result.kept ? result.workspace : `${result.workspace} (removed)`}`);
  console.log("");
  for (const assertion of result.assertions) {
    console.log(`${assertion.pass ? "PASS" : "FAIL"} ${assertion.label}`);
  }
  console.log("");
  console.log("Counts:");
  for (const [key, value] of Object.entries(result.counts)) {
    console.log(`- ${key}: ${value}`);
  }
  console.log("");
  console.log("Key result: memory can guide the agent, but protected asset policy gates the tool.");
}
