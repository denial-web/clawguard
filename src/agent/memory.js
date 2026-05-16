import { promises as fs } from "node:fs";
import path from "node:path";
import { appendAgentApprovalRequest, createAgentApprovalRequest, readLatestDecision } from "./approvals.js";

const memoryTypes = new Set([
  "EXACT_USER_STATEMENT",
  "INFERRED_PREFERENCE",
  "BUSINESS_RULE",
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

  return {
    ok: true,
    status: "completed",
    output: record,
    error: null,
    artifacts: [context.paths.memoryPath]
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
  if (record.sensitive || record.type === "BUSINESS_RULE") {
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
