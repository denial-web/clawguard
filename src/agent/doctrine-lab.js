import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readApprovalRequests } from "./approvals.js";
import { readAuditEvents, verifyAuditChain } from "./audit.js";
import { resolveAgentPaths } from "./paths.js";
import { loadConfig } from "../config.js";

const schemaVersion = "clawguard.doctrineLabExport.v3";
const defaultDoctrineLabUrl = "http://127.0.0.1:8000";
const defaultSource = "clawguard";
const defaultSourceRuntime = "clawguard:beta.10";

export async function exportDoctrineLabImport(options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const loaded = await loadConfig(workspace, options.configPath);
  const paths = resolveAgentPaths(workspace, loaded.config.agent, {
    configPath: loaded.path ?? path.join(workspace, ".clawguard.json"),
    approvalPath: options.approvalPath,
    decisionsPath: options.decisionsPath
  });
  const exportOptions = {
    includeOutcomes: Boolean(options.includeOutcomes),
    includeObservations: Boolean(options.includeObservations)
  };
  const events = await readAuditEvents(paths.auditPath, {
    limit: options.limit ?? 100
  });
  const verification = options.verify ? await verifyAuditChain(paths.auditPath) : undefined;
  const approvals = options.includeApprovals === false
    ? []
    : await readApprovalRequests(paths.approvalPath);
  const auditEntries = events
    .flatMap((event) => doctrineEntriesFromAuditEvent(event, exportOptions))
    .filter(Boolean);
  const auditedApprovalIds = new Set(auditEntries
    .map((entry) => entry._approvalId)
    .filter(Boolean));
  const approvalEntries = approvals
    .filter((approval) => !auditedApprovalIds.has(approval.id))
    .map((approval) => doctrineEntryFromApproval(approval))
    .filter(Boolean);
  let sessionEntries = [];
  if (exportOptions.includeOutcomes) {
    sessionEntries = await doctrineEntriesFromSessions(paths.sessionsDir);
  }
  const entries = [...auditEntries, ...approvalEntries, ...sessionEntries]
    .map(({ _approvalId, ...entry }) => entry);
  const payload = {
    dataset_name: options.datasetName ?? "ClawGuard beta.10 safety traces",
    category: options.category ?? "agent_safety",
    language: options.language ?? "en",
    batch_id: options.batchId ?? createBatchId(workspace, entries),
    source: options.source ?? defaultSource,
    source_runtime: options.sourceRuntime ?? defaultSourceRuntime,
    origin: options.origin ?? "organic",
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
      sessionOutcomes: sessionEntries.length,
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

function resolveAuditReasoning(event, status, label = "ClawGuard") {
  const approval = event.event?.approvalRequest;
  const fromMessage = approval?.message
    ? approval.message.match(/^Reason:\s*(.+)$/m)?.[1]?.trim()
    : null;
  return (
    event.event?.error
    ?? approval?.reason
    ?? approval?.policy?.reason
    ?? event.event?.step?.reason
    ?? event.event?.proposal?.reason
    ?? event.event?.autonomy?.reason
    ?? fromMessage
    ?? `${label} recorded ${status}.`
  );
}

export function governanceSignalsFromEvent(event) {
  if (!event || typeof event !== "object" || !event.event) {
    return {
      autonomy_decision: null,
      risk_level: "high",
      policy_reason: null,
      requires_approval: false,
      signal_source: "deterministic"
    };
  }

  const ev = event.event;
  const autonomy = ev.autonomy ?? null;
  const riskLevel = normalizeRisk(
    autonomy?.risk?.level
    ?? ev.approvalRequest?.risk?.level
    ?? ev.step?.risk
    ?? ev.proposal?.risk
    ?? ev.policy?.risk
  );
  const policyReason = (
    ev.approvalRequest?.policy?.reason
    ?? ev.approvalRequest?.reason
    ?? ev.policy?.reason
    ?? autonomy?.reason
    ?? ev.step?.reason
    ?? null
  );
  const requiresApproval = Boolean(
    ev.approvalRequest
    || autonomy?.approvalRequired
    || autonomy?.effectiveMode === "approval"
    || ev.status === "pending_approval"
  );

  return {
    autonomy_decision: autonomy?.effectiveMode ?? (requiresApproval ? "approval" : null),
    risk_level: riskLevel,
    policy_reason: policyReason ? String(policyReason).slice(0, 500) : null,
    requires_approval: requiresApproval,
    signal_source: "deterministic"
  };
}

export function criticScoresFromGovernance(governanceSignals) {
  const riskLevel = governanceSignals?.risk_level ?? "high";
  const scores = criticScoresForRisk(riskLevel);
  return {
    ...scores,
    signal_source: governanceSignals?.signal_source ?? "deterministic",
    ...(governanceSignals?.autonomy_decision
      ? { autonomy_decision: governanceSignals.autonomy_decision }
      : {})
  };
}

export function observationForExport(event, options = {}) {
  if (!options.includeObservations || !event?.event?.observation) {
    return undefined;
  }

  const observation = event.event.observation;
  if (observation.schemaVersion !== "clawguard.toolObservation.v1") {
    return undefined;
  }

  if (!observation.redacted || typeof observation.content !== "string") {
    return undefined;
  }

  return {
    schema_version: observation.schemaVersion,
    tool: observation.tool ?? null,
    trust: observation.trust ?? "untrusted_tool_output",
    redacted: true,
    truncated: Boolean(observation.truncated),
    content_hash: observation.contentHash ?? null,
    content: observation.content.slice(0, 4096),
    scan: observation.scan ?? null
  };
}

export function doctrineEntriesFromAuditEvent(event, options = {}) {
  if (!event || typeof event !== "object") {
    return [];
  }

  const includeOutcomes = Boolean(options.includeOutcomes);
  const observation = observationForExport(event, options);

  if (event.type === "tool.result" || event.type === "subagent.tool.result") {
    const status = event.event?.status ?? (event.event?.ok ? "completed" : "blocked");
    if (status === "completed" && event.event?.ok !== false) {
      if (!includeOutcomes) {
        return [];
      }
      const governanceSignals = governanceSignalsFromEvent(event);
      return [createDoctrineEntry({
        traceId: `clawguard-audit:${event.id}`,
        prompt: buildAuditPrompt(event),
        decision: "comply",
        reasoning: resolveAuditReasoning(event, status),
        riskLevel: governanceSignals.risk_level,
        actionType: event.event?.step?.tool ?? "tool_execution",
        requiresApproval: false,
        failureType: "unknown",
        governanceSignals,
        outcome: "completed",
        observation
      })];
    }
    return [createDoctrineEntry({
      traceId: `clawguard-audit:${event.id}`,
      prompt: buildAuditPrompt(event),
      decision: status === "pending_approval" ? "approval_required" : "block",
      reasoning: resolveAuditReasoning(event, status),
      riskLevel: event.event?.step?.risk ?? event.event?.approvalRequest?.risk?.level ?? "high",
      actionType: event.event?.step?.tool ?? "tool_execution",
      requiresApproval: Boolean(event.event?.approvalRequest) || status === "pending_approval",
      failureType: classifyFailureType(event),
      governanceSignals: governanceSignalsFromEvent(event),
      outcome: status,
      approvalId: event.event?.approvalRequest?.id,
      observation
    })];
  }

  if (event.type === "bridge.execution") {
    const status = event.event?.status ?? "blocked";
    if (status === "completed") {
      if (!includeOutcomes) {
        return [];
      }
      const governanceSignals = governanceSignalsFromEvent(event);
      return [createDoctrineEntry({
        traceId: `clawguard-audit:${event.id}`,
        prompt: buildAuditPrompt(event),
        decision: "comply",
        reasoning: resolveAuditReasoning(event, status, "ClawGuard browser bridge"),
        riskLevel: governanceSignals.risk_level,
        actionType: event.event?.proposal?.tool ?? "browser_bridge",
        requiresApproval: false,
        failureType: "unknown",
        governanceSignals,
        outcome: "completed"
      })];
    }
    return [createDoctrineEntry({
      traceId: `clawguard-audit:${event.id}`,
      prompt: buildAuditPrompt(event),
      decision: status === "pending_approval" ? "approval_required" : "block",
      reasoning: resolveAuditReasoning(event, status, "ClawGuard browser bridge"),
      riskLevel: event.event?.proposal?.risk ?? "high",
      actionType: event.event?.proposal?.tool ?? "browser_bridge",
      requiresApproval: Boolean(event.event?.approvalRequest) || status === "pending_approval",
      failureType: classifyFailureType(event),
      governanceSignals: governanceSignalsFromEvent(event),
      outcome: status,
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
      governanceSignals: governanceSignalsFromEvent(event),
      outcome: decision ?? "block"
    })];
  }

  return [];
}

export async function doctrineEntriesFromSessions(sessionsDir) {
  const sessions = await readAgentSessions(sessionsDir);
  return sessions.flatMap((session) => {
    if (session.schemaVersion !== "clawguard.agentRun.v1") {
      return [];
    }
    const status = String(session.status ?? "unknown");
    const decision = status === "completed"
      ? "comply"
      : (status === "pending_approval" ? "approval_required" : "block");
    const governanceSignals = {
      autonomy_decision: null,
      risk_level: "low",
      policy_reason: `Agent run ended with status ${status}.`,
      requires_approval: status === "pending_approval",
      run_status: status,
      signal_source: "deterministic"
    };
    return [createDoctrineEntry({
      traceId: `clawguard-session:${session.sessionId ?? path.basename(session.sessionPath ?? "unknown")}`,
      prompt: [
        "ClawGuard agent run outcome.",
        `Task: ${session.task ?? "unknown task"}`,
        `Status: ${status}.`
      ].join("\n"),
      decision,
      reasoning: `Run completed with status ${status}.`,
      riskLevel: "low",
      actionType: "agent_run",
      requiresApproval: status === "pending_approval",
      failureType: status === "completed" ? "unknown" : "unsafe_tool_call",
      governanceSignals,
      outcome: status
    })];
  });
}

export function doctrineEntryFromApproval(approval) {
  if (!approval || typeof approval !== "object") {
    return null;
  }

  const governanceSignals = {
    autonomy_decision: "approval",
    risk_level: normalizeRisk(approval.risk?.level),
    policy_reason: approval.policy?.reason ?? approval.reason ?? approval.summary?.reason ?? null,
    requires_approval: true,
    signal_source: "deterministic"
  };

  return createDoctrineEntry({
    traceId: `clawguard-approval:${approval.id}`,
    prompt: [
      `ClawGuard approval request for ${approval.agentAction?.tool ?? approval.tool ?? "agent action"}.`,
      `Reason: ${approval.reason ?? approval.summary?.reason ?? "Manual review required."}`,
      approval.agentAction?.args ? `Redacted args: ${JSON.stringify(approval.agentAction.args)}` : null
    ].filter(Boolean).join("\n"),
    decision: "approval_required",
    reasoning: approval.policy?.reason ?? approval.reason ?? approval.summary?.reason ?? "ClawGuard required human approval before side effects.",
    riskLevel: approval.risk?.level ?? "high",
    actionType: approval.agentAction?.tool ?? approval.tool ?? "approval_request",
    requiresApproval: true,
    failureType: classifyApprovalFailureType(approval),
    governanceSignals,
    outcome: "pending_approval",
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
  governanceSignals,
  outcome,
  approvalId,
  observation
}) {
  const signals = governanceSignals ?? {
    autonomy_decision: null,
    risk_level: normalizeRisk(riskLevel),
    policy_reason: null,
    requires_approval: Boolean(requiresApproval),
    signal_source: "deterministic"
  };
  const response = {
    decision,
    reasoning: String(reasoning ?? "ClawGuard blocked or escalated this action.").slice(0, 1200),
    risk_level: normalizeRisk(riskLevel),
    action_type: String(actionType ?? "agent_action"),
    requires_approval: Boolean(requiresApproval)
  };

  const entry = {
    _approvalId: approvalId,
    prompt: String(prompt ?? "ClawGuard governed agent trace.").slice(0, 4000),
    response: JSON.stringify(response),
    failure_type: failureType ?? "unsafe_tool_call",
    critic_scores: criticScoresFromGovernance(signals),
    governance_signals: signals,
    trace_id: traceId
  };
  if (outcome) {
    entry.outcome = String(outcome);
  }
  if (observation) {
    entry.observation = observation;
  }
  return entry;
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

  if (event.event?.autonomy?.effectiveMode) {
    parts.push(`Autonomy: ${event.event.autonomy.effectiveMode}.`);
  }

  return parts.join("\n");
}

function classifyFailureType(event) {
  const ev = { ...(event?.event ?? {}) };
  delete ev.observation;
  delete ev.toolOutputScan;
  const text = JSON.stringify(ev).toLowerCase();
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
  if (text.includes("untrusted_tool_output") || text.includes("tool output trust")) {
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
    return "clawguard-beta10-empty";
  }
  const hash = createHash("sha256")
    .update(JSON.stringify({
      workspace: path.resolve(workspace),
      traceIds: entries.map((entry) => entry.trace_id)
    }))
    .digest("hex")
    .slice(0, 16);
  return `clawguard-beta10-${hash}`;
}

async function readAgentSessions(sessionsDir) {
  let entries;
  try {
    entries = await fs.readdir(path.resolve(sessionsDir), { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const sessions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.includes("-team")) {
      continue;
    }

    const filePath = path.join(sessionsDir, entry.name);
    try {
      const session = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (session.schemaVersion === "clawguard.agentRun.v1") {
        sessions.push({
          ...session,
          sessionPath: session.sessionPath ?? filePath
        });
      }
    } catch {
      // Ignore partial or non-session JSON files in the sessions directory.
    }
  }

  return sessions;
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
