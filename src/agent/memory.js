import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { appendAgentApprovalRequest, createAgentApprovalRequest, readLatestDecision } from "./approvals.js";

const memoryTypes = new Set([
  "EXACT_USER_STATEMENT",
  "INFERRED_PREFERENCE",
  "BUSINESS_RULE",
  "PROJECT_RULE",
  "TASK_OUTCOME",
  "WORKED",
  "FAILED",
  "DECISION",
  "TEMPORARY_CONTEXT",
  "UNVERIFIED",
  "SENSITIVE"
]);
const highApprovalMemoryTypes = new Set(["BUSINESS_RULE", "PROJECT_RULE", "DECISION", "SENSITIVE"]);
const memoryTypeRiskRank = {
  TEMPORARY_CONTEXT: 0,
  UNVERIFIED: 1,
  EXACT_USER_STATEMENT: 2,
  INFERRED_PREFERENCE: 2,
  TASK_OUTCOME: 3,
  WORKED: 3,
  FAILED: 3,
  BUSINESS_RULE: 4,
  PROJECT_RULE: 4,
  DECISION: 4,
  SENSITIVE: 5
};

export async function readAgentMemory(memoryPath, { limit = 50, scope } = {}) {
  const records = await readRawAgentMemory(memoryPath);
  const effectiveRecords = effectiveMemoryRecords(records)
    .filter((record) => !scope || record.scope === scope);

  return Number.isSafeInteger(limit) && limit > 0 ? effectiveRecords.slice(-limit) : effectiveRecords;
}

async function readRawAgentMemory(memoryPath) {
  let content;
  try {
    content = await fs.readFile(path.resolve(memoryPath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function effectiveMemoryRecords(records) {
  const tombstoned = new Set(records
    .filter((record) => record.schemaVersion === "clawguard.agentMemoryTombstone.v1")
    .map((record) => record.targetMemoryId)
    .filter(Boolean));
  const superseded = new Set(records
    .filter(isDurableMemoryRecord)
    .map((record) => record.supersedes)
    .filter(Boolean));

  return records.filter((record) => {
    return isDurableMemoryRecord(record) && !tombstoned.has(record.id) && !superseded.has(record.id);
  });
}

export async function searchAgentMemory(memoryPath, query, { limit = 10, scope } = {}) {
  const records = await readAgentMemory(memoryPath, { limit: 0, scope });
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [];
  }

  return records
    .map((record) => ({
      record,
      score: scoreMemoryRecord(record, terms)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || String(right.record.createdAt).localeCompare(String(left.record.createdAt)))
    .slice(0, limit)
    .map((item) => ({
      ...item.record,
      score: item.score
    }));
}

export async function writeAgentMemory(input, context) {
  const record = normalizeMemoryRecord(input, context);
  const existing = await readAgentMemory(context.paths.memoryPath, {
    limit: 0,
    scope: record.scope
  });
  const quality = assessMemoryQuality(record, existing);
  if (quality.decision === "block") {
    return {
      ok: false,
      status: "blocked",
      output: {
        record: redactRecord(record),
        quality
      },
      error: `Memory blocked: ${quality.findings.map((finding) => finding.reason).join("; ")}`,
      artifacts: []
    };
  }
  const needsApproval = memoryWriteNeedsApproval(record, context.agent);

  if (needsApproval) {
    const approval = await resolveMemoryApproval(record, context);
    if (!approval.approved) {
      return approval.result;
    }
  }

  await fs.mkdir(path.dirname(context.paths.memoryPath), { recursive: true });
  await fs.appendFile(context.paths.memoryPath, `${JSON.stringify(record)}\n`);
  await refreshMemoryMirrors(context.paths, {
    scope: context.agent?.memoryScope,
    limit: context.agent?.memoryMirrorLimit
  });

  return {
    ok: true,
    status: "completed",
    output: {
      ...record,
      quality
    },
    error: null,
    artifacts: [context.paths.memoryPath]
  };
}

export async function reviewAgentMemory(context, options = {}) {
  const approvals = await readApprovalRequestsSafe(context.paths.approvalPath);
  const decisions = await readDecisionsSafe(context.paths.decisionsPath);
  const decidedApprovalIds = new Set(decisions.map((decision) => decision.approvalId).filter(Boolean));
  const pendingMemoryApprovals = approvals
    .filter((approval) => approval.status === "pending")
    .filter((approval) => !decidedApprovalIds.has(approval.id))
    .filter((approval) => String(approval.agentAction?.tool ?? approval.tool ?? "").startsWith("memory."))
    .slice(-(options.limit ?? 50))
    .reverse()
    .map((approval) => ({
      id: approval.id,
      tool: approval.agentAction?.tool ?? approval.tool ?? "memory.unknown",
      createdAt: approval.createdAt,
      risk: approval.risk,
      reason: approval.policy?.reason ?? approval.reason ?? null,
      requiredActions: approval.policy?.requiredActions ?? approval.requiredActions ?? [],
      record: approval.agentAction?.artifacts?.find((artifact) => artifact.type === "memory-record")?.record ?? null,
      quality: approval.agentAction?.artifacts?.find((artifact) => artifact.type === "memory-record")?.quality ?? null
    }));
  const raw = await readRawAgentMemory(context.paths.memoryPath);
  const effective = effectiveMemoryRecords(raw);

  return {
    schemaVersion: "clawguard.agentMemoryReview.v1",
    memoryPath: context.paths.memoryPath,
    approvalPath: context.paths.approvalPath,
    decisionsPath: context.paths.decisionsPath,
    summary: {
      durableRecords: effective.length,
      rawEvents: raw.length,
      pendingMemoryApprovals: pendingMemoryApprovals.length,
      tombstones: raw.filter((record) => record.schemaVersion === "clawguard.agentMemoryTombstone.v1").length,
      replacements: raw.filter((record) => isDurableMemoryRecord(record) && record.supersedes).length
    },
    pendingMemoryApprovals,
    records: effective.slice(-(options.memoryLimit ?? 20)).reverse()
  };
}

export async function removeAgentMemory(memoryId, context, options = {}) {
  const record = await findEffectiveMemoryRecord(context.paths.memoryPath, memoryId);
  const event = {
    schemaVersion: "clawguard.agentMemoryTombstone.v1",
    id: randomUUID(),
    eventType: "remove",
    targetMemoryId: record.id,
    targetType: record.type,
    scope: record.scope,
    source: options.source ?? "agent_memory_review",
    reason: String(options.reason ?? "User removed memory record.").trim(),
    createdAt: new Date().toISOString()
  };

  await fs.mkdir(path.dirname(context.paths.memoryPath), { recursive: true });
  await fs.appendFile(context.paths.memoryPath, `${JSON.stringify(event)}\n`);
  await refreshMemoryMirrors(context.paths, {
    scope: context.agent?.memoryScope,
    limit: context.agent?.memoryMirrorLimit
  });

  return {
    ok: true,
    status: "completed",
    event,
    removedRecord: redactRecord(record),
    artifacts: [context.paths.memoryPath]
  };
}

export async function replaceAgentMemory(memoryId, input, context) {
  const previous = await findEffectiveMemoryRecord(context.paths.memoryPath, memoryId);
  const replacement = normalizeMemoryRecord({
    type: input.type ?? previous.type,
    content: input.content,
    source: input.source ?? "agent_memory_replace",
    confidence: input.confidence ?? previous.confidence,
    scope: input.scope ?? previous.scope,
    sensitive: input.sensitive ?? previous.sensitive,
    supersedes: previous.id,
    replaceReason: input.reason
  }, context);
  const existing = await readAgentMemory(context.paths.memoryPath, {
    limit: 0,
    scope: replacement.scope
  });
  const quality = assessMemoryQuality(replacement, existing.filter((record) => record.id !== previous.id));

  if (quality.decision === "block") {
    return {
      ok: false,
      status: "blocked",
      output: {
        previous: redactRecord(previous),
        replacement: redactRecord(replacement),
        quality
      },
      error: `Memory replacement blocked: ${quality.findings.map((finding) => finding.reason).join("; ")}`,
      artifacts: []
    };
  }

  await fs.mkdir(path.dirname(context.paths.memoryPath), { recursive: true });
  await fs.appendFile(context.paths.memoryPath, `${JSON.stringify(replacement)}\n`);
  await refreshMemoryMirrors(context.paths, {
    scope: context.agent?.memoryScope,
    limit: context.agent?.memoryMirrorLimit
  });

  return {
    ok: true,
    status: "completed",
    output: {
      previous: redactRecord(previous),
      replacement: redactRecord(replacement),
      quality
    },
    artifacts: [context.paths.memoryPath]
  };
}

export async function consolidateAgentMemory(query, context, options = {}) {
  const matches = await searchAgentMemory(context.paths.memoryPath, query, {
    limit: options.limit ?? 8,
    scope: options.scope ?? context.agent?.memoryScope
  });
  const useful = matches.filter((record) => !record.sensitive).slice(0, options.maxRecords ?? 5);

  if (useful.length < 2) {
    return {
      ok: false,
      status: "blocked",
      output: {
        message: "Need at least two non-sensitive matching records before proposing consolidation.",
        matches
      },
      error: "Not enough memory records to consolidate.",
      artifacts: []
    };
  }

  const type = chooseConsolidatedType(useful);
  const content = [
    `Consolidated memory for "${query}":`,
    ...useful.map((record) => record.content.replace(/\s+/g, " ").trim())
  ].join(" ");
  const proposal = await proposeAgentMemory({
    type,
    content,
    source: "memory_consolidation",
    confidence: Math.min(0.95, Math.max(0.5, ...useful.map((record) => Number(record.confidence ?? 0.5)))),
    scope: useful[0].scope,
    sensitive: false,
    consolidates: useful.map((record) => record.id),
    inheritedPolicyTags: collectInheritedPolicyTags(useful)
  }, context);

  return {
    ...proposal,
    schemaVersion: "clawguard.agentMemoryConsolidate.v1",
    query,
    matchedRecords: useful.map(redactRecord)
  };
}

export async function refreshMemoryMirrors(paths, options = {}) {
  const records = await readAgentMemory(paths.memoryPath, {
    limit: options.limit ?? 0,
    scope: options.scope
  });
  const visible = records.filter((record) => !record.sensitive);
  const userRecords = visible.filter((record) => [
    "EXACT_USER_STATEMENT",
    "INFERRED_PREFERENCE"
  ].includes(record.type));
  const workspaceRecords = visible.filter((record) => ![
    "EXACT_USER_STATEMENT",
    "INFERRED_PREFERENCE",
    "TEMPORARY_CONTEXT"
  ].includes(record.type));

  await fs.mkdir(path.dirname(paths.userMemoryMarkdownPath), { recursive: true });
  await fs.writeFile(paths.userMemoryMarkdownPath, renderMemoryMarkdown("ClawGuard User Memory", userRecords));
  await fs.writeFile(paths.workspaceMemoryMarkdownPath, renderMemoryMarkdown("ClawGuard Workspace Memory", workspaceRecords));

  return {
    userMemoryMarkdownPath: paths.userMemoryMarkdownPath,
    workspaceMemoryMarkdownPath: paths.workspaceMemoryMarkdownPath,
    records: visible.length
  };
}

export async function searchAgentSessions(sessionsDir, query, { limit = 10 } = {}) {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [];
  }

  const sessions = await readAgentSessions(sessionsDir);
  return sessions
    .map((session) => ({
      session,
      score: scoreSession(session, terms)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || String(right.session.createdAt).localeCompare(String(left.session.createdAt)))
    .slice(0, limit)
    .map((item) => summarizeSession(item.session, item.score));
}

export async function createRecallSnapshot(task, context, options = {}) {
  const memory = await searchAgentMemory(context.paths.memoryPath, task, {
    limit: options.memoryLimit ?? context.agent?.recallMemoryLimit ?? 8,
    scope: context.agent?.memoryScope
  });
  const sessions = await searchAgentSessions(context.paths.sessionsDir, task, {
    limit: options.sessionLimit ?? context.agent?.recallSessionLimit ?? 5
  });
  const snapshot = {
    schemaVersion: "clawguard.agentRecallSnapshot.v1",
    task,
    sessionId: context.sessionId,
    createdAt: new Date().toISOString(),
    memory,
    sessions,
    summary: buildActiveRecallSummary({ task, memory, sessions })
  };

  await fs.mkdir(context.paths.recallDir, { recursive: true });
  const snapshotPath = path.join(
    context.paths.recallDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${context.sessionId}.json`
  );
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  return {
    ...snapshot,
    path: snapshotPath
  };
}

export async function bootstrapAgentMemory(context, options = {}) {
  const existing = await readAgentMemory(context.paths.memoryPath, {
    limit: 0,
    scope: context.agent?.memoryScope
  });
  const rawCandidates = await collectBootstrapCandidates(context, options);
  const candidates = rawCandidates
    .map((candidate) => normalizeMemoryRecord({
      ...candidate,
      source: candidate.source ?? "memory_bootstrap",
      scope: candidate.scope ?? context.agent?.memoryScope ?? "workspace"
    }, context))
    .map((record) => ({
      record,
      quality: assessMemoryQuality(record, existing)
    }));
  const allowed = candidates.filter((item) => item.quality.decision !== "block");
  const blocked = candidates.filter((item) => item.quality.decision === "block")
    .map((item) => ({
      record: redactRecord(item.record),
      quality: item.quality
    }));
  const proposals = [];

  for (const item of allowed.slice(0, options.limit ?? 20)) {
    proposals.push(await proposeAgentMemory({
      ...item.record,
      quality: item.quality
    }, context));
  }

  return {
    schemaVersion: "clawguard.agentMemoryBootstrap.v1",
    workspace: context.paths.workspace,
    proposed: proposals.length,
    blocked: blocked.length,
    candidates: allowed.map((item) => ({
      record: redactRecord(item.record),
      quality: item.quality
    })),
    blockedCandidates: blocked,
    proposals
  };
}

export async function exportAgentMemory(paths, options = {}) {
  const records = await readAgentMemory(paths.memoryPath, {
    limit: options.limit ?? 0,
    scope: options.scope
  });
  const safeRecords = options.includeSensitive
    ? records
    : records.map((record) => record.sensitive ? { ...record, content: "[sensitive memory redacted]" } : record);

  if (options.format === "json") {
    return {
      format: "json",
      content: `${JSON.stringify({
        schemaVersion: "clawguard.agentMemoryExport.v1",
        exportedAt: new Date().toISOString(),
        records: safeRecords
      }, null, 2)}\n`
    };
  }

  return {
    format: "markdown",
    content: renderMemoryMarkdown("ClawGuard Memory Export", safeRecords)
  };
}

export function proposeTaskOutcomeMemory(run) {
  if (run.status !== "completed") {
    return null;
  }

  const completedTools = run.steps
    .filter((item) => item.result?.ok)
    .map((item) => item.step.tool);
  const changedArtifacts = run.steps.flatMap((item) => item.result?.artifacts ?? []);
  const toolSummary = completedTools.length > 0 ? ` Tools used: ${[...new Set(completedTools)].join(", ")}.` : "";
  const artifactSummary = changedArtifacts.length > 0 ? ` Artifacts: ${changedArtifacts.slice(0, 5).join(", ")}.` : "";

  return {
    type: "TASK_OUTCOME",
    content: `Completed task: ${run.task}.${toolSummary}${artifactSummary}`,
    source: "agent_task_outcome",
    confidence: 0.8,
    scope: "workspace",
    sensitive: false
  };
}

export async function proposeAgentMemory(input, context) {
  const record = normalizeMemoryRecord({
    ...input,
    source: input.source ?? "agent_proposal"
  }, context);
  const existing = await readAgentMemory(context.paths.memoryPath, {
    limit: 0,
    scope: record.scope
  });
  const quality = input.quality ?? assessMemoryQuality(record, existing);
  if (quality.decision === "block") {
    return {
      ok: false,
      status: "blocked",
      output: {
        message: "Memory proposal blocked by quality checks.",
        record: redactRecord(record),
        quality
      },
      error: `Memory proposal blocked: ${quality.findings.map((finding) => finding.reason).join("; ")}`,
      artifacts: []
    };
  }
  const policy = classifyMemoryPolicy(record);
  const request = createAgentApprovalRequest({
    tool: "memory.propose",
    args: {
      type: record.type,
      content: record.sensitive ? "[sensitive memory redacted]" : record.content,
      scope: record.scope,
      sensitive: record.sensitive,
      policyTags: policy.tags
    },
    target: context.paths.memoryPath,
    destination: context.paths.memoryPath,
    risk: policy.risk,
    reason: "ClawGuard Agent proposes a memory after task execution; approval is required before saving.",
    requiredActions: ["review-memory-proposal", "review-memory-policy-tags", "approve-memory-write"],
    artifacts: [{
      type: "memory-record",
      record: {
        ...record,
        content: record.sensitive ? "[sensitive memory redacted]" : record.content
      },
      quality
    }]
  });
  const approvalRequest = await appendAgentApprovalRequest(context.paths.approvalPath, request);

  return {
    ok: false,
    status: "pending_approval",
    output: {
      message: "Memory proposal recorded as a pending approval.",
      record: {
        ...record,
        content: record.sensitive ? "[sensitive memory redacted]" : record.content
      },
      quality
    },
    error: null,
    approvalRequest,
    artifacts: []
  };
}

export function normalizeMemoryRecord(input, context = {}) {
  const type = String(input.type ?? "UNVERIFIED").trim().toUpperCase();
  if (!memoryTypes.has(type)) {
    throw new Error(`Invalid memory type: ${type}. Use one of: ${[...memoryTypes].join(", ")}`);
  }

  const rawContent = String(input.content ?? "").trim();
  const content = redactSensitiveText(rawContent);
  if (!content) {
    throw new Error("Memory content is required.");
  }

  const sensitive = Boolean(input.sensitive) || type === "SENSITIVE" || content !== rawContent;

  const record = {
    id: input.id ? String(input.id) : randomUUID(),
    type,
    content,
    source: String(input.source ?? "agent_cli"),
    confidence: normalizeConfidence(input.confidence),
    scope: String(input.scope ?? context.agent?.memoryScope ?? "workspace"),
    sensitive,
    ...(input.supersedes ? { supersedes: String(input.supersedes) } : {}),
    ...(input.replaceReason ? { replaceReason: String(input.replaceReason) } : {}),
    ...(Array.isArray(input.consolidates) ? { consolidates: input.consolidates.map(String) } : {}),
    ...(Array.isArray(input.inheritedPolicyTags) ? { inheritedPolicyTags: normalizePolicyTags(input.inheritedPolicyTags) } : {}),
    createdAt: input.createdAt ?? new Date().toISOString()
  };
  const policy = classifyMemoryPolicy(record);

  return {
    ...record,
    policy
  };
}

export function assessMemoryQuality(record, existingRecords = []) {
  const findings = [];
  const content = String(record.content ?? "");
  const normalized = normalizeForComparison(content);

  if (content.length < 12 || tokenize(content).length < 3) {
    findings.push({
      id: "too-vague",
      severity: "medium",
      reason: "Memory is too short or vague to be useful across sessions."
    });
  }

  if (existingRecords.some((item) => item.type === record.type && normalizeForComparison(item.content) === normalized)) {
    findings.push({
      id: "duplicate",
      severity: "medium",
      reason: "Equivalent memory already exists."
    });
  }

  if (hasPromptInjectionText(content)) {
    findings.push({
      id: "prompt-injection",
      severity: "high",
      reason: "Memory contains instruction-like text that could hijack future prompts."
    });
  }

  if (record.sensitive) {
    findings.push({
      id: "sensitive",
      severity: "high",
      reason: "Memory contains sensitive-looking data and must stay approval-gated."
    });
  }

  const policy = classifyMemoryPolicy(record);
  if (policy.tags.includes("rule-like-content") && !highApprovalMemoryTypes.has(record.type)) {
    findings.push({
      id: "rule-like-content",
      severity: "medium",
      reason: "Memory content looks like a rule or policy even though it was submitted as a lower-risk type."
    });
  }

  if (policy.tags.includes("provenance-mismatch")) {
    findings.push({
      id: "provenance-mismatch",
      severity: "medium",
      reason: "Memory was submitted as an exact user statement, but its source is not a direct user source."
    });
  }

  if (record.type === "UNVERIFIED" || record.confidence < 0.5) {
    findings.push({
      id: "low-confidence",
      severity: "low",
      reason: "Memory should be treated as uncertain unless verified later."
    });
  }

  const decision = findings.some((finding) => ["duplicate", "prompt-injection"].includes(finding.id) || (finding.id === "too-vague" && !record.sensitive))
    ? "block"
    : findings.some((finding) => ["sensitive", "low-confidence", "rule-like-content", "provenance-mismatch"].includes(finding.id))
      ? "manual_review"
      : "allow";

  return {
    decision,
    score: Math.max(0, 1 - findings.reduce((sum, finding) => sum + (finding.severity === "high" ? 0.4 : finding.severity === "medium" ? 0.25 : 0.1), 0)),
    findings
  };
}

export function memoryWriteNeedsApproval(record, agentConfig = {}) {
  if (classifyMemoryPolicy(record).approvalRequired) {
    return true;
  }

  return agentConfig.autoWriteMemory !== true;
}

export function classifyMemoryPolicy(record) {
  const tags = [];
  const type = String(record?.type ?? "").toUpperCase();
  const content = String(record?.content ?? "");
  const addTag = (tag) => {
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  };

  for (const tag of normalizePolicyTags(record?.inheritedPolicyTags)) {
    addTag(tag);
  }

  if (record?.sensitive || type === "SENSITIVE") {
    addTag("sensitive");
  }

  if (highApprovalMemoryTypes.has(type)) {
    addTag("high-risk-type");
  }

  if (hasRuleLikeMemoryText(content)) {
    addTag("rule-like-content");
  }

  if (type === "EXACT_USER_STATEMENT" && !isUserMemorySource(record?.source)) {
    addTag("provenance-mismatch");
  }

  if (Array.isArray(record?.consolidates) && record.consolidates.length > 0) {
    addTag("consolidated-memory");
  }

  const approvalRequired = tags.some((tag) => ["sensitive", "high-risk-type", "rule-like-content", "provenance-mismatch", "consolidated-memory"].includes(tag));

  return {
    approvalRequired,
    risk: tags.includes("sensitive") || tags.includes("high-risk-type") || tags.includes("rule-like-content") || tags.includes("provenance-mismatch") ? "high" : "medium",
    tags
  };
}

async function resolveMemoryApproval(record, context) {
  if (context.approvalId) {
    const decision = await readLatestDecision(context.paths.decisionsPath, context.approvalId);

    if (!decision) {
      return {
        approved: false,
        result: {
          ok: false,
          status: "pending_approval",
          output: null,
          error: `No decision recorded for approval ${context.approvalId}.`,
          approvalRequest: {
            id: context.approvalId,
            path: context.paths.approvalPath,
            status: "pending"
          },
          artifacts: []
        }
      };
    }

    if (decision.decision !== "approve") {
      return {
        approved: false,
        result: {
          ok: false,
          status: "blocked",
          output: null,
          error: decision.reason ?? `Approval ${context.approvalId} was denied.`,
          approvalDecision: decision,
          artifacts: []
        }
      };
    }

    return {
      approved: true,
      decision
    };
  }

  const request = createAgentApprovalRequest({
    tool: "memory.write",
    args: {
      type: record.type,
      content: record.sensitive ? "[sensitive memory redacted]" : record.content,
      scope: record.scope,
      sensitive: record.sensitive,
      policyTags: classifyMemoryPolicy(record).tags
    },
    target: context.paths.memoryPath,
    destination: context.paths.memoryPath,
    risk: classifyMemoryPolicy(record).risk,
    reason: "ClawGuard Agent requires approval before saving durable memory.",
    requiredActions: ["review-memory-policy-tags", "approve-memory-write"],
    artifacts: [{
      type: "memory-record",
      record: {
        ...redactRecord(record)
      }
    }]
  });
  const approvalRequest = await appendAgentApprovalRequest(context.paths.approvalPath, request);

  return {
    approved: false,
    result: {
      ok: false,
      status: "pending_approval",
      output: {
        message: "Approval required before saving memory.",
        record: redactRecord(record)
      },
      error: null,
      approvalRequest,
      artifacts: []
    }
  };
}

function normalizeConfidence(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }

  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Memory confidence must be between 0 and 1.");
  }
  return confidence;
}

function buildActiveRecallSummary({ task, memory, sessions }) {
  const lines = [
    `Active governed recall for task: ${task}`
  ];

  if (memory.length === 0 && sessions.length === 0) {
    lines.push("No relevant durable memory or prior sessions found.");
    return lines.join("\n");
  }

  if (memory.length > 0) {
    lines.push("Relevant durable memory:");
    for (const item of memory.slice(0, 8)) {
      lines.push(`- ${item.type} confidence=${item.confidence ?? "unknown"}: ${item.sensitive ? "[sensitive memory redacted]" : item.content}`);
    }
  }

  if (sessions.length > 0) {
    lines.push("Relevant prior sessions:");
    for (const session of sessions.slice(0, 5)) {
      lines.push(`- ${session.status} ${session.createdAt}: ${session.task} (${session.tools.join(", ") || "no tools"})`);
    }
  }

  lines.push("Use this recall as context, not as unquestionable truth. Keep risky actions approval-gated.");
  return lines.join("\n");
}

async function collectBootstrapCandidates(context) {
  const candidates = [];
  const workspace = context.paths.workspace;
  const packageJson = await readJsonFileIfPresent(path.join(workspace, "package.json"));
  if (packageJson) {
    if (packageJson.name) {
      candidates.push(memoryCandidate("PROJECT_RULE", `Project package name is ${packageJson.name}.`, "bootstrap:package.json", 0.95));
    }
    if (packageJson.version) {
      candidates.push(memoryCandidate("PROJECT_RULE", `Project package version is currently ${packageJson.version}.`, "bootstrap:package.json", 0.8));
    }
    for (const scriptName of ["test", "build", "lint", "typecheck", "safety:eval"]) {
      if (packageJson.scripts?.[scriptName]) {
        candidates.push(memoryCandidate("PROJECT_RULE", `Project ${scriptName} command is \`${packageJson.scripts[scriptName]}\`.`, "bootstrap:package.json", 0.9));
      }
    }
  }

  const readme = await readTextFileIfPresent(path.join(workspace, "README.md"), 12000);
  const readmeHeading = firstMarkdownHeading(readme);
  if (readmeHeading) {
    candidates.push(memoryCandidate("PROJECT_RULE", `Project README title is "${readmeHeading}".`, "bootstrap:README.md", 0.8));
  }

  const config = await readJsonFileIfPresent(path.join(workspace, ".clawguard.json"));
  if (config?.policy) {
    candidates.push(memoryCandidate("PROJECT_RULE", `ClawGuard policy preset for this workspace is ${config.policy}.`, "bootstrap:.clawguard.json", 0.95));
  }
  if (config?.agent?.safetyProfile) {
    candidates.push(memoryCandidate("PROJECT_RULE", `ClawGuard Agent safety profile is ${config.agent.safetyProfile}.`, "bootstrap:.clawguard.json", 0.95));
  }

  for (const filename of ["AGENTS.md", "CLAUDE.md", "MEMORY.md", "USER.md"]) {
    const text = await readTextFileIfPresent(path.join(workspace, filename), 10000);
    const usefulLine = firstUsefulInstructionLine(text);
    if (usefulLine) {
      candidates.push(memoryCandidate("PROJECT_RULE", `${filename} says: ${usefulLine}`, `bootstrap:${filename}`, 0.65));
    }
  }

  const gitRemote = await readGitRemote(workspace);
  if (gitRemote) {
    candidates.push(memoryCandidate("PROJECT_RULE", `Git remote origin is ${gitRemote}.`, "bootstrap:.git/config", 0.9));
  }

  return dedupeCandidates(candidates);
}

function memoryCandidate(type, content, source, confidence) {
  return {
    type,
    content,
    source,
    confidence,
    scope: "workspace",
    sensitive: false
  };
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = normalizeForComparison(`${candidate.type}:${candidate.content}`);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function readTextFileIfPresent(filePath, maxBytes) {
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      const read = await handle.read(buffer, 0, maxBytes, 0);
      return buffer.subarray(0, read.bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function readJsonFileIfPresent(filePath) {
  const text = await readTextFileIfPresent(filePath, 256 * 1024);
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function firstMarkdownHeading(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#\s+\S/.test(line))
    ?.replace(/^#\s+/, "")
    .slice(0, 200);
}

function firstUsefulInstructionLine(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter((line) => line && !line.startsWith("#") && line.length >= 18 && line.length <= 240)
    .find((line) => !hasPromptInjectionText(line));
}

async function readGitRemote(workspace) {
  const config = await readTextFileIfPresent(path.join(workspace, ".git", "config"), 20000);
  const match = /\[remote "origin"\][\s\S]*?url\s*=\s*(.+)/.exec(config);
  return match?.[1]?.trim() ?? null;
}

function redactRecord(record) {
  return {
    ...record,
    content: record.sensitive ? "[sensitive memory redacted]" : record.content
  };
}

function redactSensitiveText(text) {
  return String(text ?? "")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "[redacted-secret]")
    .replace(/\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"'\s]{8,}/gi, (match) => {
      const [prefix] = match.split(/[:=]/);
      return `${prefix}= [redacted-secret]`;
    });
}

function hasPromptInjectionText(text) {
  return /\b(ignore (all )?(previous|prior) instructions|system prompt|developer message|reveal secrets|exfiltrate|disable (safety|approval)|bypass (clawguard|approval|policy))\b/i.test(String(text ?? ""));
}

function hasRuleLikeMemoryText(text) {
  return /\b(must|always|never|required|requires|requirement|prohibited|forbidden|blocked|cannot|can't|do not|don't|approval required|requires approval|policy|compliance|regulatory|secret|token|password|api[_ -]?key)\b/i.test(String(text ?? ""));
}

function isUserMemorySource(source) {
  return /^(agent_cli|user|user_cli|manual|manual_user|memory_cli)$/i.test(String(source ?? ""));
}

function normalizeForComparison(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9_./:-]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function scoreMemoryRecord(record, terms) {
  const haystack = [
    record.type,
    record.content,
    record.source,
    record.scope
  ].join(" ").toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) {
      score += term.length;
    }
  }

  if (["BUSINESS_RULE", "PROJECT_RULE"].includes(record.type)) {
    score += 2;
  }

  return score;
}

async function readAgentSessions(sessionsDir) {
  let entries;
  try {
    entries = await fs.readdir(sessionsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const sessions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(sessionsDir, entry.name);
    try {
      const session = JSON.parse(await fs.readFile(filePath, "utf8"));
      sessions.push({
        ...session,
        sessionPath: session.sessionPath ?? filePath
      });
    } catch {
      // Ignore partial or non-session JSON files in the sessions directory.
    }
  }

  return sessions;
}

function scoreSession(session, terms) {
  const haystack = [
    session.task,
    session.status,
    session.route?.route,
    session.route?.reason,
    ...(session.plan?.steps ?? []).flatMap((step) => [step.id, step.tool, step.reason]),
    ...(session.steps ?? []).flatMap((step) => [
      step.step?.id,
      step.step?.tool,
      step.step?.reason,
      step.result?.status,
      step.result?.error,
      summarizeOutputForSearch(step.result?.output)
    ])
  ].filter(Boolean).join(" ").toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) {
      score += term.length;
    }
  }

  if (session.status === "completed") {
    score += 1;
  }

  return score;
}

function summarizeSession(session, score) {
  return {
    sessionId: session.sessionId,
    task: session.task,
    status: session.status,
    createdAt: session.createdAt,
    score,
    sessionPath: session.sessionPath,
    route: session.route?.route ?? null,
    tools: [...new Set((session.steps ?? []).map((step) => step.step?.tool).filter(Boolean))],
    errors: (session.steps ?? []).map((step) => step.result?.error).filter(Boolean)
  };
}

function summarizeOutputForSearch(output) {
  if (output === null || output === undefined) {
    return "";
  }

  if (typeof output === "string") {
    return output.slice(0, 2000);
  }

  try {
    return JSON.stringify(output).slice(0, 4000);
  } catch {
    return "";
  }
}

function renderMemoryMarkdown(title, records) {
  const lines = [
    `# ${title}`,
    "",
    "Generated by ClawGuard Agent from governed JSONL memory. Edit durable memory through `clawguard agent memory add` so approvals and audit stay intact.",
    ""
  ];

  if (records.length === 0) {
    lines.push("No approved memory records yet.", "");
    return lines.join("\n");
  }

  const groups = new Map();
  for (const record of records) {
    const group = memoryGroup(record.type);
    groups.set(group, [...(groups.get(group) ?? []), record]);
  }

  for (const [group, groupRecords] of groups) {
    lines.push(`## ${group}`, "");
    for (const record of groupRecords) {
      const confidence = Number.isFinite(record.confidence) ? ` confidence=${record.confidence}` : "";
      lines.push(`- ${record.content}`);
      lines.push(`  - type=${record.type} scope=${record.scope} source=${record.source}${confidence} createdAt=${record.createdAt}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function memoryGroup(type) {
  if (["EXACT_USER_STATEMENT", "INFERRED_PREFERENCE"].includes(type)) {
    return "User Preferences";
  }

  if (["BUSINESS_RULE", "PROJECT_RULE"].includes(type)) {
    return "Rules";
  }

  if (["TASK_OUTCOME", "WORKED", "FAILED", "DECISION"].includes(type)) {
    return "Task Outcomes";
  }

  return "Other Memory";
}

function isDurableMemoryRecord(record) {
  return record && typeof record === "object" && memoryTypes.has(String(record.type ?? "")) && typeof record.content === "string";
}

async function findEffectiveMemoryRecord(memoryPath, memoryId) {
  const id = String(memoryId ?? "").trim();
  if (!id) {
    throw new Error("Memory id is required.");
  }

  const records = await readAgentMemory(memoryPath, { limit: 0 });
  const record = records.find((item) => item.id === id);
  if (!record) {
    throw new Error(`No active memory record found for id ${id}.`);
  }
  return record;
}

async function readApprovalRequestsSafe(approvalPath) {
  try {
    const content = await fs.readFile(path.resolve(approvalPath), "utf8");
    return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readDecisionsSafe(decisionsPath) {
  try {
    const content = await fs.readFile(path.resolve(decisionsPath), "utf8");
    return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function chooseConsolidatedType(records) {
  return [...records]
    .map((record) => String(record.type ?? "UNVERIFIED").toUpperCase())
    .sort((left, right) => (memoryTypeRiskRank[right] ?? 1) - (memoryTypeRiskRank[left] ?? 1))[0] ?? "UNVERIFIED";
}

function collectInheritedPolicyTags(records) {
  return normalizePolicyTags(records.flatMap((record) => record?.policy?.tags ?? record?.inheritedPolicyTags ?? []));
}

function normalizePolicyTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
}
