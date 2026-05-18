import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function appendAgentApprovalRequest(outputPath, request) {
  const resolvedPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

  if (resolvedPath.endsWith(".jsonl")) {
    await fs.appendFile(resolvedPath, `${JSON.stringify(request)}\n`);
  } else {
    await fs.writeFile(resolvedPath, `${JSON.stringify(request, null, 2)}\n`, { flag: "wx" });
  }

  return {
    id: request.id,
    path: resolvedPath,
    status: request.status,
    message: request.message
  };
}

export async function appendAgentApprovalDecision(outputPath, decision) {
  const resolvedPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.appendFile(resolvedPath, `${JSON.stringify(decision)}\n`);
  return {
    id: decision.id,
    approvalId: decision.approvalId,
    path: resolvedPath,
    status: decision.status,
    decision: decision.decision
  };
}

export function createAgentApprovalRequest({
  id = randomUUID(),
  tool,
  args,
  target,
  destination,
  risk = "medium",
  reason,
  requiredActions = [],
  artifacts = []
}) {
  const safeArgs = redactApprovalArgs(args);
  const message = [
    "ClawGuard Agent approval needed.",
    `Tool: ${tool}`,
    `Risk: ${String(risk).toUpperCase()}`,
    `Target: ${target ?? "not selected"}`,
    destination ? `Destination: ${destination}` : null,
    `Reason: ${reason ?? "This action changes files, trust, shell state, or memory."}`,
    `Required actions: ${requiredActions.length > 0 ? requiredActions.join(", ") : "human-review"}`,
    "Reply with:",
    `approve ${id} optional reason`,
    `deny ${id} optional reason`
  ].filter(Boolean).join("\n");

  return {
    schemaVersion: "clawguard.approval.v1",
    id,
    status: "pending",
    createdAt: new Date().toISOString(),
    framework: "clawguard-agent",
    target: target ? path.resolve(target) : undefined,
    destination: destination ? path.resolve(destination) : undefined,
    decision: "manual_review",
    risk: {
      level: risk,
      score: riskScore(risk)
    },
    policy: {
      preset: "agent-v0.2",
      reason: reason ?? "ClawGuard Agent requires approval before this action can execute.",
      requiredActions: requiredActions.length > 0 ? requiredActions : ["human-review"]
    },
    install: {
      dryRun: true,
      installed: false,
      skipped: true
    },
    agentAction: {
      tool,
      args: safeArgs,
      artifacts
    },
    summary: {
      files: 0,
      findings: 0
    },
    findings: [],
    message
  };
}

export function createAgentApprovalDecision(approval, {
  decision,
  actor = "local-user",
  reason,
  approvalPath
}) {
  const normalized = normalizeApprovalDecision(decision);
  const status = normalized === "approve" ? "approved" : "denied";

  return {
    schemaVersion: "clawguard.decision.v1",
    id: randomUUID(),
    approvalId: approval.id,
    status,
    decision: normalized,
    decidedAt: new Date().toISOString(),
    actor,
    reason,
    framework: approval.framework,
    target: approval.target,
    destination: approval.destination,
    risk: approval.risk,
    policy: approval.policy,
    source: {
      path: approvalPath ? path.resolve(approvalPath) : undefined,
      approvalCreatedAt: approval.createdAt
    }
  };
}

export async function readLatestDecision(decisionsPath, approvalId) {
  if (!approvalId || !decisionsPath) {
    return null;
  }

  let content;
  try {
    content = await fs.readFile(path.resolve(decisionsPath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const decisions = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((decision) => decision.schemaVersion === "clawguard.decision.v1" && decision.approvalId === approvalId);

  return decisions.at(-1) ?? null;
}

export async function readApprovalRequests(approvalPath) {
  let content;
  try {
    content = await fs.readFile(path.resolve(approvalPath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  if (!content.trim()) {
    return [];
  }

  return path.resolve(approvalPath).endsWith(".jsonl")
    ? content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [JSON.parse(content)];
}

export async function hasApprovedDecisionForTarget(approvalPath, decisionsPath, targetPath) {
  const target = await canonicalPath(targetPath);
  const approvals = await readApprovalRequests(approvalPath);
  const matchingApprovals = [];

  for (const approval of approvals) {
    const matches = await Promise.all([approval.target, approval.destination]
      .filter(Boolean)
      .map(async (candidate) => await canonicalPath(candidate)));
    if (matches.some((candidate) => candidate === target)) {
      matchingApprovals.push(approval);
    }
  }

  for (const approval of matchingApprovals) {
    const decision = await readLatestDecision(decisionsPath, approval.id);
    if (decision?.decision === "approve") {
      return true;
    }
  }

  return false;
}

async function canonicalPath(candidate) {
  const resolved = path.resolve(candidate);
  try {
    return await fs.realpath(resolved);
  } catch (error) {
    if (error.code === "ENOENT") {
      return resolved;
    }
    throw error;
  }
}

function redactApprovalArgs(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {};
  }

  const redacted = {};
  for (const [key, value] of Object.entries(args)) {
    if (/token|secret|password|key/i.test(key)) {
      redacted[key] = "[redacted]";
    } else if (typeof value === "string" && value.length > 1000) {
      redacted[key] = `${value.slice(0, 1000)}... [truncated]`;
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function normalizeApprovalDecision(decision) {
  const normalized = String(decision ?? "").trim().toLowerCase();
  if (["approved", "approve", "yes"].includes(normalized)) {
    return "approve";
  }
  if (["denied", "deny", "no", "reject", "rejected"].includes(normalized)) {
    return "deny";
  }
  return normalized;
}

function riskScore(risk) {
  return {
    low: 20,
    medium: 50,
    high: 75,
    critical: 95
  }[risk] ?? 50;
}
