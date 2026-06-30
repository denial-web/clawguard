import { createHash } from "node:crypto";
import { extractObservableText, shouldScanToolOutput } from "./tool-output-scan.js";

export const toolObservationSchemaVersion = "clawguard.toolObservation.v1";

const DEFAULT_MAX_OBSERVATION_BYTES = 4096;

export function redactToolObservationText(text) {
  return String(text ?? "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "[redacted-secret]")
    .replace(/\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"'\s]{8,}/gi, (match) => {
      const [prefix] = match.split(/[:=]/);
      return `${prefix}= [redacted-secret]`;
    })
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi, "Bearer [redacted-secret]");
}

export function truncateUtf8ByBytes(text, maxBytes) {
  const source = String(text ?? "");
  if (Buffer.byteLength(source, "utf8") <= maxBytes) {
    return { text: source, truncated: false };
  }

  let lo = 0;
  let hi = source.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = source.slice(0, mid);
    if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return { text: source.slice(0, lo), truncated: true };
}

export function buildToolObservationRecord(result, step, agentConfig = {}) {
  const scanConfig = agentConfig.toolOutputScan ?? {};
  if (scanConfig.captureObservations === false) {
    return null;
  }

  if (!shouldCaptureObservationTool(step?.tool, scanConfig)) {
    return null;
  }

  const raw = extractObservableText(result?.output);
  if (!raw.trim()) {
    return null;
  }

  const maxBytes = normalizeMaxObservationBytes(scanConfig.maxObservationBytes);
  const redacted = redactToolObservationText(raw);
  const { text: content, truncated } = truncateUtf8ByBytes(redacted, maxBytes);

  const record = {
    schemaVersion: toolObservationSchemaVersion,
    tool: step.tool,
    trust: "untrusted_tool_output",
    redacted: true,
    truncated,
    bytesStored: Buffer.byteLength(content, "utf8"),
    contentHash: createHash("sha256").update(redacted, "utf8").digest("hex"),
    content
  };

  if (result?.toolOutputScan) {
    record.scan = {
      decision: result.toolOutputScan.decision,
      poisoned: result.toolOutputScan.poisoned,
      findings: (result.toolOutputScan.findings ?? []).map((finding) => ({
        id: finding.id,
        severity: finding.severity
      }))
    };
  }

  return record;
}

export function buildToolResultAuditEvent({ result, step, agent }) {
  const observation = buildToolObservationRecord(result, step, agent ?? {});
  return {
    step: {
      id: step.id,
      tool: step.tool,
      risk: step.risk,
      reason: step.reason
    },
    ok: result.ok,
    status: result.status ?? (result.ok ? "completed" : "blocked"),
    error: result.error ?? null,
    approvalRequest: result.approvalRequest ?? null,
    artifacts: result.artifacts ?? [],
    autonomy: result.autonomy ?? null,
    toolOutputScan: result.toolOutputScan ?? null,
    ...(observation ? { observation } : {})
  };
}

function shouldCaptureObservationTool(toolName, config = {}) {
  if (Array.isArray(config.captureTools) && config.captureTools.length > 0) {
    return config.captureTools.includes(String(toolName ?? "").trim());
  }

  return shouldScanToolOutput(toolName, config);
}

function normalizeMaxObservationBytes(value) {
  const parsed = Number(value ?? DEFAULT_MAX_OBSERVATION_BYTES);
  if (!Number.isFinite(parsed) || parsed < 256) {
    return DEFAULT_MAX_OBSERVATION_BYTES;
  }
  return Math.min(Math.floor(parsed), 32 * 1024);
}
