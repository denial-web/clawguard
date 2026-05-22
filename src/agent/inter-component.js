import { randomUUID } from "node:crypto";

export const interComponentSchemaVersion = "clawguard.interComponentMessage.v1";

const runtimeVerifiers = new Set([
  "policy_engine",
  "critic",
  "data_broker",
  "tool_runtime",
  "approval_system"
]);

export function wrapToolOutputMessage({
  messageId,
  source = { component: "tool_runtime", componentType: "external_tool" },
  destination = { component: "planner" },
  allowedUse = ["planning_context", "display_to_user"],
  payload = {},
  createdAt
} = {}) {
  return createInterComponentMessage({
    messageId,
    source,
    destination,
    trust: "untrusted_tool_output",
    allowedUse,
    payload,
    createdAt,
    provenance: {
      wrappedBy: "clawguard.tool_output_wrapper",
      verifiedBy: null,
      signature: null
    }
  });
}

export function createInterComponentMessage({
  messageId = randomUUID(),
  source,
  destination,
  trust,
  allowedUse,
  payload = {},
  provenance = {},
  runtimeTrace = null,
  createdAt = new Date().toISOString()
} = {}) {
  return {
    schemaVersion: interComponentSchemaVersion,
    messageId,
    source,
    destination,
    trust,
    allowedUse,
    createdAt,
    payload,
    provenance: {
      wrappedBy: nonEmptyString(provenance.wrappedBy) ?? source?.component ?? "clawguard",
      verifiedBy: verifiedByFromRuntimeTrace(runtimeTrace),
      signature: provenance.signature ?? null
    }
  };
}

function verifiedByFromRuntimeTrace(runtimeTrace) {
  if (!runtimeTrace || typeof runtimeTrace !== "object" || Array.isArray(runtimeTrace)) {
    return null;
  }

  const component = nonEmptyString(runtimeTrace.component);
  const traceId = nonEmptyString(runtimeTrace.traceId);
  if (!runtimeVerifiers.has(component) || !traceId) {
    return null;
  }

  return { component, traceId };
}

function nonEmptyString(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}
