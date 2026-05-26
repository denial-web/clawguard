import { createHash } from "node:crypto";
import path from "node:path";
import { readApprovalRequests } from "./approvals.js";
import { readAuditEvents, verifyAuditChain } from "./audit.js";
import { resolveAgentPaths } from "./paths.js";
import { loadConfig } from "../config.js";

const schemaVersion = "clawguard.doctrineLabExport.v1";
const defaultDoctrineLabUrl = "http://127.0.0.1:8000";
const defaultSource = "clawguard";
const defaultSourceRuntime = "clawguard:beta9";

export async function exportDoctrineLabImport(options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const loaded = await loadConfig(workspace, options.configPath);
  const paths = resolveAgentPaths(workspace, loaded.config.agent, {
    configPath: loaded.path ?? path.join(workspace, ".clawguard.json"),
    approvalPath: options.approvalPath,
    decisionsPath: options.decisionsPath
  });
  const events = await readAuditEvents(paths.auditPath, {
    limit: options.limit ?? 100
  });
  const verification = options.verify ? await verifyAuditChain(paths.auditPath) : undefined;
  const approvals = options.includeApprovals === false
    ? []
    : await readApprovalRequests(paths.approvalPath);
  const auditEntries = events
    .flatMap((event) => doctrineEntriesFromAuditEvent(event))
    .filter(Boolean);
  const auditedApprovalIds = new Set(auditEntries
    .map((entry) => entry._approvalId)
    .filter(Boolean));
  const approvalEntries = approvals
    .filter((approval) => !auditedApprovalIds.has(approval.id))
    .map((approval) => doctrineEntryFromApproval(approval))
    .filter(Boolean);
  const entries = [...auditEntries, ...approvalEntries]
    .map(({ _approvalId, ...entry }) => entry);
  const payload = {
    dataset_name: options.datasetName ?? "ClawGuard beta7 safety traces",
    category: options.category ?? "agent_safety",
    language: options.language ?? "en",
    batch_id: options.batchId ?? createBatchId(workspace, entries),
    source: options.source ?? defaultSource,
    source_runtime: options.sourceRuntime ?? defaultSourceRuntime,
    entries
  };
  const result = {
    schemaVersion,
    ok: entries.length > 0,
    workspace,
    configPath: loaded.path,
    auditPath: paths.auditPath,
    approvalsPath: paths.approvalPath,
    verification,
    summary: {
      auditEventsRead: events.length,
      approvalsRead: approvals.length,
      entries: entries.length
    },
    payload
  };

  if (options.send) {
    result.delivery = await sendDoctrineLabImport(payload, {
      baseUrl: options.url ?? defaultDoctrineLabUrl,
      apiKeyEnv: options.apiKeyEnv
    });
  }

  return result;
}

export async function sendDoctrineLabImport(payload, options = {}) {
  const baseUrl = options.baseUrl ?? defaultDoctrineLabUrl;
  const endpoint = new URL("/api/datasets/import", baseUrl);
  assertLoopbackHttpUrl(endpoint);
  const apiKey = readDoctrineLabApiKey(options.apiKeyEnv);

  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    return {
      sent: false,
      skipped: true,
      endpoint: endpoint.href,
      reason: "No Doctrine Lab entries to import."
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-API-Key": apiKey } : {})
    },
    body: JSON.stringify(payload)
  });
  const body = await readJsonResponse(response);

  return {
    sent: response.ok,
    skipped: false,
    endpoint: endpoint.href,
    status: response.status,
    response: body
  };
}

function readDoctrineLabApiKey(apiKeyEnv = "DOCTRINE_LAB_API_KEY") {
  const envName = String(apiKeyEnv ?? "DOCTRINE_LAB_API_KEY").trim();
  if (!envName) {
    return "";
  }
  return String(process.env[envName] ?? "").trim();
}

export function doctrineEntriesFromAuditEvent(event) {
  if (!event || typeof event !== "object") {
    return [];
  }

  if (event.type === "tool.result" || event.type === "subagent.tool.result") {
    const status = event.event?.status ?? (event.event?.ok ? "completed" : "blocked");
    if (status === "completed" && event.event?.ok !== false) {
      return [];
    }
    return [createDoctrineEntry({
      traceId: `clawguard-audit:${event.id}`,
      prompt: buildAuditPrompt(event),
      decision: status === "pending_approval" ? "approval_required" : "block",
      reasoning: event.event?.error ?? event.event?.approvalRequest?.reason ?? `ClawGuard recorded ${status}.`,
      riskLevel: event.event?.step?.risk ?? event.event?.approvalRequest?.risk?.level ?? "high",
      actionType: event.event?.step?.tool ?? "tool_execution",
      requiresApproval: Boolean(event.event?.approvalRequest) || status === "pending_approval",
      failureType: classifyFailureType(event),
      criticScores: criticScoresForRisk(event.event?.step?.risk ?? event.event?.approvalRequest?.risk?.level),
      approvalId: event.event?.approvalRequest?.id
    })];
  }

  if (event.type === "bridge.execution") {
    const status = event.event?.status ?? "blocked";
    if (status === "completed") {
      return [];
    }
    return [createDoctrineEntry({
      traceId: `clawguard-audit:${event.id}`,
      prompt: buildAuditPrompt(event),
      decision: status === "pending_approval" ? "approval_required" : "block",
      reasoning: event.event?.error ?? `ClawGuard browser bridge recorded ${status}.`,
      riskLevel: event.event?.proposal?.risk ?? "high",
      actionType: event.event?.proposal?.tool ?? "browser_bridge",
      requiresApproval: Boolean(event.event?.approvalRequest) || status === "pending_approval",
      failureType: classifyFailureType(event),
      criticScores: criticScoresForRisk(event.event?.proposal?.risk),
      approvalId: event.event?.approvalRequest?.id
    })];
  }

  if (event.type === "explain.created") {
    const decision = event.event?.policy?.decision;
    const missingBeta7Audit = !event.event?.policyVersion || !event.event?.protectedAssets;
    if (!missingBeta7Audit && !["approval_required", "block"].includes(decision)) {
      return [];
    }
    return [createDoctrineEntry({
      traceId: `clawguard-audit:${event.id}`,
      prompt: buildAuditPrompt(event),
      decision: decision === "approval_required" ? "approval_required" : "block",
      reasoning: missingBeta7Audit
        ? "Blast-radius audit event is missing beta7 policy/protected-asset metadata."
        : event.event?.policy?.reason ?? "Blast-radius explanation identified a governed action.",
      riskLevel: event.event?.policy?.risk ?? "high",
      actionType: event.event?.action?.operation ?? "blast_radius_explain",
      requiresApproval: decision === "approval_required",
      failureType: missingBeta7Audit ? "audit_metadata_gap" : "protected_asset_violation",
      criticScores: criticScoresForRisk(event.event?.policy?.risk)
    })];
  }

  return [];
}

export function doctrineEntryFromApproval(approval) {
  if (!approval || typeof approval !== "object") {
    return null;
  }

  return createDoctrineEntry({
    traceId: `clawguard-approval:${approval.id}`,
    prompt: [
      `ClawGuard approval request for ${approval.agentAction?.tool ?? approval.tool ?? "agent action"}.`,
      `Reason: ${approval.reason ?? approval.summary?.reason ?? "Manual review required."}`,
      approval.agentAction?.args ? `Redacted args: ${JSON.stringify(approval.agentAction.args)}` : null
    ].filter(Boolean).join("\n"),
    decision: "approval_required",
    reasoning: approval.reason ?? approval.summary?.reason ?? "ClawGuard required human approval before side effects.",
    riskLevel: approval.risk?.level ?? "high",
    actionType: approval.agentAction?.tool ?? approval.tool ?? "approval_request",
    requiresApproval: true,
    failureType: classifyApprovalFailureType(approval),
    criticScores: criticScoresForRisk(approval.risk?.level),
    approvalId: approval.id
  });
}

function createDoctrineEntry({
  traceId,
  prompt,
  decision,
  reasoning,
  riskLevel,
  actionType,
  requiresApproval,
  failureType,
  criticScores,
  approvalId
}) {
  const response = {
    decision,
    reasoning: String(reasoning ?? "ClawGuard blocked or escalated this action.").slice(0, 1200),
    risk_level: normalizeRisk(riskLevel),
    action_type: String(actionType ?? "agent_action"),
    requires_approval: Boolean(requiresApproval)
  };

  return {
    _approvalId: approvalId,
    prompt: String(prompt ?? "ClawGuard governed agent trace.").slice(0, 4000),
    response: JSON.stringify(response),
    failure_type: failureType ?? "unsafe_tool_call",
    critic_scores: criticScores ?? criticScoresForRisk(riskLevel),
    trace_id: traceId
  };
}

function buildAuditPrompt(event) {
  const parts = [
    `ClawGuard audit event ${event.type} (${event.id}).`
  ];

  if (event.event?.step) {
    parts.push(`Step: ${event.event.step.id ?? "unknown"} using ${event.event.step.tool ?? "unknown tool"}.`);
    parts.push(`Risk: ${event.event.step.risk ?? "unknown"}.`);
  }

  if (event.event?.proposal) {
    parts.push(`Proposal tool: ${event.event.proposal.tool ?? "unknown"}.`);
    parts.push(`Proposal risk: ${event.event.proposal.risk ?? "unknown"}.`);
  }

  if (event.event?.action) {
    parts.push(`Action: ${JSON.stringify(event.event.action)}`);
  }

  if (event.event?.status) {
    parts.push(`Status: ${event.event.status}.`);
  }

  if (event.event?.error) {
    parts.push(`Error: ${event.event.error}`);
  }

  return parts.join("\n");
}

function classifyFailureType(event) {
  const text = JSON.stringify(event.event ?? {}).toLowerCase();
  if (text.includes("action hash does not match") || text.includes("replay")) {
    return "approval_replay";
  }
  if (text.includes("policy decision")) {
    return "missing_policy_decision";
  }
  if (text.includes("protected asset") || text.includes("protected")) {
    return "protected_asset_violation";
  }
  if (text.includes("private url") || text.includes("private ip") || text.includes("redirect") || text.includes("localhost") || text.includes("link-local")) {
    return "private_redirect";
  }
  if (text.includes("verifiedby") || text.includes("provenance")) {
    return "forged_provenance";
  }
  if (text.includes("untrusted_tool_output") || text.includes("tool output")) {
    return "tool_output_trust_boundary";
  }
  if (text.includes("prompt injection") || text.includes("ignore") || text.includes("system prompt")) {
    return "prompt_injection";
  }
  return "unsafe_tool_call";
}

function classifyApprovalFailureType(approval) {
  const text = JSON.stringify(approval ?? {}).toLowerCase();
  if (text.includes("protected")) {
    return "protected_asset_violation";
  }
  if (text.includes("actionhash") || text.includes("action hash")) {
    return "approval_replay";
  }
  if (text.includes("browser") || text.includes("web.fetch") || text.includes("redirect")) {
    return "private_redirect";
  }
  return "unsafe_tool_call";
}

function criticScoresForRisk(risk) {
  const normalized = normalizeRisk(risk);
  const riskScore = {
    low: 0.25,
    medium: 0.5,
    high: 0.8,
    critical: 1
  }[normalized] ?? 0.7;

  return {
    safety: riskScore,
    governance: Math.max(0.7, riskScore),
    risk_reasoning: riskScore,
    structural: 1
  };
}

function normalizeRisk(risk) {
  const normalized = String(risk ?? "high").toLowerCase();
  return ["low", "medium", "high", "critical"].includes(normalized) ? normalized : "high";
}

function createBatchId(workspace, entries) {
  if (entries.length === 0) {
    return "clawguard-beta7-empty";
  }
  const hash = createHash("sha256")
    .update(JSON.stringify({
      workspace: path.resolve(workspace),
      traceIds: entries.map((entry) => entry.trace_id)
    }))
    .digest("hex")
    .slice(0, 16);
  return `clawguard-beta7-${hash}`;
}

function assertLoopbackHttpUrl(url) {
  const hostname = url.hostname.toLowerCase();
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  if (!["http:", "https:"].includes(url.protocol) || !loopback) {
    throw new Error("Doctrine Lab export can only send to a loopback http(s) URL. Use local Doctrine Lab on 127.0.0.1 or localhost.");
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { text };
  }
}
