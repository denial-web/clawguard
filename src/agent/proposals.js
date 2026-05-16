import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { listAgentTools } from "./tools.js";
import { validateAgentPlan } from "./planner.js";

const proposalSchemaVersion = "clawguard.agentActionProposal.v1";

export async function readAgentActionProposal(filePath) {
  const resolvedPath = path.resolve(filePath);
  const proposal = JSON.parse(await fs.readFile(resolvedPath, "utf8"));
  return validateAgentActionProposal(proposal);
}

export function validateAgentActionProposal(proposal) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    throw new Error("Agent action proposal must be a JSON object.");
  }

  if (proposal.schemaVersion !== undefined && proposal.schemaVersion !== proposalSchemaVersion) {
    throw new Error(`Unsupported proposal schemaVersion: ${proposal.schemaVersion}`);
  }

  const tool = String(proposal.tool ?? "").trim();
  if (!tool) {
    throw new Error("Agent action proposal requires tool.");
  }

  const args = proposal.args ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Agent action proposal args must be an object.");
  }

  const risk = String(proposal.risk ?? "low").toLowerCase();
  const step = {
    id: String(proposal.id ?? `proposal-${randomUUID()}`),
    tool,
    args,
    reason: String(proposal.reason ?? "External action proposal."),
    risk
  };
  const plan = validateAgentPlan({
    task: String(proposal.task ?? "Run a ClawGuard Agent action proposal."),
    steps: [step]
  }, listAgentTools());

  validateToolArgs(plan.steps[0]);

  return {
    schemaVersion: proposalSchemaVersion,
    id: String(proposal.id ?? step.id),
    source: proposal.source ? String(proposal.source) : "manual",
    task: plan.task,
    tool: plan.steps[0].tool,
    args: plan.steps[0].args,
    reason: plan.steps[0].reason,
    risk: plan.steps[0].risk,
    createdAt: proposal.createdAt ?? new Date().toISOString()
  };
}

export function proposalToPlan(proposal) {
  const normalized = validateAgentActionProposal(proposal);
  return {
    task: normalized.task,
    steps: [{
      id: normalized.id,
      tool: normalized.tool,
      args: normalized.args,
      reason: normalized.reason,
      risk: normalized.risk
    }]
  };
}

function validateToolArgs(step) {
  if (step.tool === "file.read" && !isNonEmptyString(step.args.path)) {
    throw new Error("file.read proposal requires args.path.");
  }

  if (["file.diff", "file.write_safe"].includes(step.tool)) {
    if (!isNonEmptyString(step.args.path)) {
      throw new Error(`${step.tool} proposal requires args.path.`);
    }
    if (typeof step.args.content !== "string") {
      throw new Error(`${step.tool} proposal requires args.content.`);
    }
  }

  if (step.tool === "shell.execute_approved") {
    if (typeof step.args.command === "string") {
      throw new Error("shell.execute_approved proposal cannot use args.command.");
    }
    if (!Array.isArray(step.args.argv) || step.args.argv.length === 0 || !step.args.argv.every((item) => typeof item === "string")) {
      throw new Error("shell.execute_approved proposal requires string args.argv.");
    }
  }

  if (step.tool === "shell.dry_run" && !Array.isArray(step.args.argv) && typeof step.args.command !== "string") {
    throw new Error("shell.dry_run proposal requires args.command or args.argv.");
  }

  if (step.tool === "skill.install_guarded" && !isNonEmptyString(step.args.source)) {
    throw new Error("skill.install_guarded proposal requires args.source.");
  }

  if (step.tool === "project.cleanup_safe" && step.args.include !== undefined) {
    if (!Array.isArray(step.args.include) || !step.args.include.every((item) => typeof item === "string")) {
      throw new Error("project.cleanup_safe proposal args.include must be an array of strings.");
    }
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
