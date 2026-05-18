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

export async function readAgentMemory(memoryPath, { limit = 50, scope } = {}) {
  let content;
  try {
    content = await fs.readFile(path.resolve(memoryPath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const records = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((record) => !scope || record.scope === scope);

  return Number.isSafeInteger(limit) && limit > 0 ? records.slice(-limit) : records;
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
    output: record,
    error: null,
    artifacts: [context.paths.memoryPath]
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
    sessions
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
  const request = createAgentApprovalRequest({
    tool: "memory.propose",
    args: {
      type: record.type,
      content: record.sensitive ? "[sensitive memory redacted]" : record.content,
      scope: record.scope,
      sensitive: record.sensitive
    },
    target: context.paths.memoryPath,
    destination: context.paths.memoryPath,
    risk: record.sensitive || record.type === "BUSINESS_RULE" ? "high" : "medium",
    reason: "ClawGuard Agent proposes a memory after task execution; approval is required before saving.",
    requiredActions: ["review-memory-proposal", "approve-memory-write"],
    artifacts: [{
      type: "memory-record",
      record: {
        ...record,
        content: record.sensitive ? "[sensitive memory redacted]" : record.content
      }
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
      }
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

  const content = String(input.content ?? "").trim();
  if (!content) {
    throw new Error("Memory content is required.");
  }

  const sensitive = Boolean(input.sensitive) || type === "SENSITIVE";

  return {
    type,
    content,
    source: String(input.source ?? "agent_cli"),
    confidence: normalizeConfidence(input.confidence),
    scope: String(input.scope ?? context.agent?.memoryScope ?? "workspace"),
    sensitive,
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export function memoryWriteNeedsApproval(record, agentConfig = {}) {
  if (record.sensitive || ["BUSINESS_RULE", "PROJECT_RULE", "DECISION"].includes(record.type)) {
    return true;
  }

  return agentConfig.autoWriteMemory !== true;
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
      sensitive: record.sensitive
    },
    target: context.paths.memoryPath,
    destination: context.paths.memoryPath,
    risk: record.sensitive || record.type === "BUSINESS_RULE" ? "high" : "medium",
    reason: "ClawGuard Agent requires approval before saving durable memory.",
    requiredActions: ["approve-memory-write"],
    artifacts: [{
      type: "memory-record",
      record: {
        ...record,
        content: record.sensitive ? "[sensitive memory redacted]" : record.content
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
        message: "Approval required before saving memory."
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
