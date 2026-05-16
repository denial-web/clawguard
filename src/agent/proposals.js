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

  if (["git.status", "git.diff", "git.log"].includes(step.tool)) {
    if (step.args.path !== undefined && typeof step.args.path !== "string") {
      throw new Error(`${step.tool} proposal args.path must be a string.`);
    }
  }

  if (step.tool === "memory.search" && !isNonEmptyString(step.args.query)) {
    throw new Error("memory.search proposal requires args.query.");
  }

  if (step.tool === "memory.propose" && !isNonEmptyString(step.args.content)) {
    throw new Error("memory.propose proposal requires args.content.");
  }

  if (step.tool === "web.search" && !isNonEmptyString(step.args.query)) {
    throw new Error("web.search proposal requires args.query.");
  }

  if (step.tool === "web.fetch") {
    if (!isNonEmptyString(step.args.url)) {
      throw new Error("web.fetch proposal requires args.url.");
    }
    validateProposalHttpUrl(step.args.url);
  }

  if (["github.repo_read", "github.issue_draft", "github.issue_create_approved"].includes(step.tool)) {
    if (!isValidRepo(step.args.repo)) {
      throw new Error(`${step.tool} proposal requires args.repo in owner/name format.`);
    }
  }

  if (["github.issue_draft", "github.issue_create_approved"].includes(step.tool)) {
    if (!isNonEmptyString(step.args.title) || !isNonEmptyString(step.args.body)) {
      throw new Error(`${step.tool} proposal requires args.title and args.body.`);
    }
  }

  if (step.tool === "github.issue_create_approved" && !["high", "critical"].includes(step.risk)) {
    throw new Error("github.issue_create_approved proposal risk must be high or critical.");
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isValidRepo(value) {
  return typeof value === "string" && /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(value);
}

function validateProposalHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("web.fetch proposal requires a valid URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("web.fetch proposal only allows http and https URLs.");
  }

  if (url.username || url.password) {
    throw new Error("web.fetch proposal blocks URLs containing credentials.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host.startsWith("10.") || host.startsWith("192.168.") || host === "::1") {
    throw new Error("web.fetch proposal blocks localhost and private URLs.");
  }
}
