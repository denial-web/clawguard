import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import net from "node:net";
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

export function explainAgentActionProposal(proposal) {
  const normalized = validateAgentActionProposal(proposal);
  const approvalRequired = isApprovalRequiredProposal(normalized);
  return {
    schemaVersion: "clawguard.agentProposalExplanation.v1",
    ok: true,
    proposal: normalized,
    policy: {
      decision: approvalRequired ? "manual_review" : "allow",
      approvalRequired,
      execution: isBridgeProposal(normalized.tool) ? "external_bridge_dry_run" : "clawguard_tool",
      boundaries: proposalBoundaries(normalized)
    }
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
    if (step.tool === "file.write_safe" && attemptsAutoWriteMemoryEnable(step.args.path, step.args.content)) {
      throw new Error("file.write_safe proposal cannot enable agent.autoWriteMemory.");
    }
    if (step.tool === "file.write_safe" && attemptsToolAutonomyChange(step.args.path, step.args.content)) {
      throw new Error("file.write_safe proposal cannot change agent.toolAutonomy.");
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

  validateBrowserAppProposal(step);
}

function isApprovalRequiredProposal(proposal) {
  return [
    "file.write_safe",
    "project.cleanup_safe",
    "shell.execute_approved",
    "skill.install_guarded",
    "memory.propose",
    "github.issue_create_approved",
    "browser.click_proposed",
    "browser.type_proposed",
    "app.open_proposed",
    "app.action_proposed"
  ].includes(proposal.tool);
}

function isBridgeProposal(tool) {
  return tool.startsWith("browser.") || tool.startsWith("app.");
}

function proposalBoundaries(proposal) {
  if (proposal.tool.startsWith("browser.")) {
    return [
      "ClawGuard core does not click, type, submit forms, or control a browser in v0.4.",
      "An external bridge may execute only a validated and approved action id.",
      "Credential URLs, sensitive fields, private URLs, and unsafe submit/payment/delete intents are blocked or escalated."
    ];
  }

  if (proposal.tool.startsWith("app.")) {
    return [
      "ClawGuard core does not control desktop apps in v0.4.",
      "External app bridge actions require review and audit.",
      "Destructive or sensitive app actions must be high-risk approved proposals."
    ];
  }

  if (proposal.tool.startsWith("github.")) {
    return [
      "GitHub writes require approval and repo allowlist checks.",
      "Draft actions stay local until explicitly approved."
    ];
  }

  return [
    "The proposal is validated against ClawGuard Agent tool policy.",
    "Risky local actions use approval records before execution."
  ];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isValidRepo(value) {
  return typeof value === "string" && /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(value);
}

function attemptsAutoWriteMemoryEnable(filePath, content) {
  if (path.basename(String(filePath ?? "")) !== ".clawguard.json") {
    return false;
  }

  try {
    const parsed = JSON.parse(String(content ?? ""));
    return parsed?.agent?.autoWriteMemory === true || parsed?.autoWriteMemory === true;
  } catch {
    return /"autoWriteMemory"\s*:\s*true/.test(String(content ?? ""));
  }
}

function attemptsToolAutonomyChange(filePath, content) {
  if (path.basename(String(filePath ?? "")) !== ".clawguard.json") {
    return false;
  }

  try {
    const parsed = JSON.parse(String(content ?? ""));
    return parsed?.agent?.toolAutonomy !== undefined || parsed?.toolAutonomy !== undefined;
  } catch {
    return /"toolAutonomy"\s*:/.test(String(content ?? ""));
  }
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

  if (isBlockedHost(url.hostname)) {
    throw new Error("web.fetch proposal blocks localhost and private URLs.");
  }
}

function validateBrowserAppProposal(step) {
  if (["browser.open", "browser.extract"].includes(step.tool)) {
    if (!isNonEmptyString(step.args.url)) {
      throw new Error(`${step.tool} proposal requires args.url.`);
    }
    validateBrowserUrl(step.args.url, {
      allowPrivate: Boolean(step.args.allowPrivate),
      risk: step.risk,
      tool: step.tool
    });
  }

  if (step.tool === "browser.extract") {
    if (step.args.selector !== undefined && !isNonEmptyString(step.args.selector)) {
      throw new Error("browser.extract proposal args.selector must be a non-empty string when provided.");
    }
  }

  if (step.tool === "browser.click_proposed") {
    validateBrowserInteraction(step, {
      requireSelector: true,
      label: "browser.click_proposed"
    });
    const intent = normalizeIntent(step.args.intent);
    if (["submit", "submit_form", "send", "delete", "purchase", "buy", "payment", "transfer"].includes(intent) && !["high", "critical"].includes(step.risk)) {
      throw new Error("browser.click_proposed submit/send/delete/purchase/payment actions require high or critical risk.");
    }
    assertNoSensitiveIntent(step);
  }

  if (step.tool === "browser.type_proposed") {
    validateBrowserInteraction(step, {
      requireSelector: true,
      label: "browser.type_proposed"
    });
    if (!isNonEmptyString(step.args.text)) {
      throw new Error("browser.type_proposed proposal requires args.text.");
    }
    assertNoSensitiveField(step);
    assertNoSensitiveText(step.args.text);
  }

  if (step.tool === "app.open_proposed") {
    if (!isNonEmptyString(step.args.app)) {
      throw new Error("app.open_proposed proposal requires args.app.");
    }
    if (!["medium", "high", "critical"].includes(step.risk)) {
      throw new Error("app.open_proposed proposal risk must be medium, high, or critical.");
    }
  }

  if (step.tool === "app.action_proposed") {
    if (!isNonEmptyString(step.args.app) || !isNonEmptyString(step.args.action)) {
      throw new Error("app.action_proposed proposal requires args.app and args.action.");
    }
    if (!["high", "critical"].includes(step.risk)) {
      throw new Error("app.action_proposed proposal risk must be high or critical.");
    }
    assertNoSensitiveIntent(step);
  }
}

function validateBrowserInteraction(step, options) {
  if (!isNonEmptyString(step.args.url)) {
    throw new Error(`${options.label} proposal requires args.url.`);
  }
  validateBrowserUrl(step.args.url, {
    allowPrivate: Boolean(step.args.allowPrivate),
    risk: step.risk,
    tool: step.tool
  });
  if (options.requireSelector && !isNonEmptyString(step.args.selector)) {
    throw new Error(`${options.label} proposal requires args.selector.`);
  }
  if (isAmbiguousSelector(step.args.selector)) {
    throw new Error(`${options.label} proposal requires a specific, visible selector.`);
  }
}

function validateBrowserUrl(value, options) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${options.tool} proposal requires a valid URL.`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${options.tool} proposal only allows http and https URLs.`);
  }

  if (url.username || url.password) {
    throw new Error(`${options.tool} proposal blocks URLs containing credentials.`);
  }

  if (isBlockedHost(url.hostname) && !(options.allowPrivate && ["high", "critical"].includes(options.risk))) {
    throw new Error(`${options.tool} proposal blocks localhost and private URLs unless explicitly high-risk allowed.`);
  }

  return url;
}

function isBlockedHost(hostname) {
  const host = String(hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }

  const version = net.isIP(host);
  if (version === 4) {
    const parts = host.split(".").map((part) => Number(part));
    return parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0;
  }

  if (version === 6) {
    return host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:");
  }

  return false;
}

function isAmbiguousSelector(selector) {
  const value = String(selector ?? "").trim().toLowerCase();
  return !value ||
    value === "*" ||
    value === "button" ||
    value === "input" ||
    value === "a" ||
    value.includes(":hidden") ||
    value.includes("[hidden]") ||
    value.includes("display:none") ||
    value.includes("visibility:hidden");
}

function normalizeIntent(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function assertNoSensitiveIntent(step) {
  const text = [
    step.args.intent,
    step.args.action,
    step.args.label,
    step.args.description,
    step.args.purpose
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(payment|pay|purchase|buy|checkout|transfer|wire|delete|destroy|password|token|seed phrase|secret|credential)\b/.test(text) && !["high", "critical"].includes(step.risk)) {
    throw new Error(`${step.tool} proposal sensitive or destructive intent requires high or critical risk.`);
  }
}

function assertNoSensitiveField(step) {
  const field = [
    step.args.field,
    step.args.label,
    step.args.selector,
    step.args.name,
    step.args.placeholder
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(password|passcode|otp|2fa|mfa|token|api[_-]?key|secret|seed|seed phrase|private key|card number|cvv|cvc|ssn)\b/.test(field)) {
    throw new Error("browser.type_proposed blocks password, token, seed phrase, payment, and credential fields.");
  }
}

function assertNoSensitiveText(value) {
  const text = String(value ?? "").toLowerCase();
  if (/\b(seed phrase|private key|api[_-]?key|bearer\s+[a-z0-9._-]+|password\s*:|token\s*:|cvv|cvc)/.test(text)) {
    throw new Error("browser.type_proposed blocks sensitive credential-like text.");
  }
}
