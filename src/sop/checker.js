import { promises as fs } from "node:fs";
import path from "node:path";

export async function checkSopWorkflow(pack, workflowPath) {
  const resolvedPath = path.resolve(workflowPath);
  const workflow = JSON.parse(await fs.readFile(resolvedPath, "utf8"));
  const missingEvidence = findMissingEvidence(pack, workflow);
  const thresholdFindings = findThresholdFindings(pack, workflow);
  const approvalFindings = findApprovalFindings(pack, workflow);
  const blockedActions = findBlockedActions(pack, workflow, {
    missingEvidence,
    thresholdFindings,
    approvalFindings
  });
  const decision = decideSopResult({ missingEvidence, thresholdFindings, approvalFindings, blockedActions });

  return {
    schemaVersion: "clawguard.sopCheck.v1",
    pack: {
      id: pack.id,
      title: pack.title,
      industry: pack.industry,
      role: pack.role
    },
    workflowPath: resolvedPath,
    decision,
    missingEvidence,
    thresholdFindings,
    approvalFindings,
    blockedActions,
    requiredActions: requiredActionsFor({ decision, missingEvidence, thresholdFindings, approvalFindings, blockedActions }),
    sources: pack.sources ?? []
  };
}

export function sopDecisionExitCode(decision) {
  if (decision === "block") {
    return 2;
  }

  if (decision === "manual_review") {
    return 1;
  }

  return 0;
}

function findMissingEvidence(pack, workflow) {
  return pack.evidence
    .filter((item) => item.required !== false)
    .filter((item) => !hasEvidence(workflow, item))
    .map((item) => ({
      id: item.id,
      title: item.title,
      severity: item.severity ?? "medium",
      recommendation: item.recommendation ?? "Collect this evidence before marking the SOP complete."
    }));
}

function findThresholdFindings(pack, workflow) {
  const findings = [];

  for (const threshold of pack.thresholds ?? []) {
    const value = getByPath(workflow, threshold.field);
    if (typeof value !== "number") {
      continue;
    }

    if (typeof threshold.max === "number" && value > threshold.max) {
      findings.push({
        id: threshold.id,
        title: threshold.title,
        severity: threshold.severity ?? "medium",
        field: threshold.field,
        value,
        limit: threshold.max,
        decision: threshold.decision ?? "manual_review",
        recommendation: threshold.recommendation ?? "Escalate this variance for manager review."
      });
    }
  }

  return findings;
}

function findApprovalFindings(pack, workflow) {
  return (pack.approvals ?? [])
    .filter((approval) => approval.required !== false)
    .filter((approval) => !hasApproval(workflow, approval))
    .map((approval) => ({
      id: approval.id,
      title: approval.title,
      severity: approval.severity ?? "medium",
      recommendation: approval.recommendation ?? "Record the required approval before completing this SOP."
    }));
}

function findBlockedActions(pack, workflow, context) {
  const actions = new Set(arrayOfStrings(workflow.actions));
  const missingIds = new Set(context.missingEvidence.map((item) => item.id));
  const approvalIds = new Set(context.approvalFindings.map((item) => item.id));
  const thresholdIds = new Set(context.thresholdFindings.map((item) => item.id));
  const blocked = [];

  for (const rule of pack.blockedActions ?? []) {
    if (rule.action && !actions.has(rule.action)) {
      continue;
    }

    const missingBlocked = (rule.whenMissing ?? []).filter((id) => missingIds.has(id) || approvalIds.has(id));
    const thresholdBlocked = (rule.whenThreshold ?? []).filter((id) => thresholdIds.has(id));
    const explicitAction = rule.action && actions.has(rule.action) && (rule.whenMissing ?? []).length === 0 && (rule.whenThreshold ?? []).length === 0;

    if (missingBlocked.length > 0 || thresholdBlocked.length > 0 || explicitAction) {
      blocked.push({
        id: rule.id,
        title: rule.title,
        severity: rule.severity ?? "high",
        action: rule.action,
        reason: rule.reason ?? "This action is blocked by the SOP pack.",
        blockedBy: [...missingBlocked, ...thresholdBlocked],
        recommendation: rule.recommendation ?? "Stop and request human manager review."
      });
    }
  }

  return blocked;
}

function decideSopResult(result) {
  if (result.blockedActions.length > 0) {
    return "block";
  }

  if (result.missingEvidence.length > 0 || result.thresholdFindings.length > 0 || result.approvalFindings.length > 0) {
    return "manual_review";
  }

  return "allow";
}

function requiredActionsFor(result) {
  const actions = [];

  if (result.missingEvidence.length > 0) {
    actions.push("collect-missing-evidence");
  }

  if (result.thresholdFindings.length > 0) {
    actions.push("review-threshold-variance");
  }

  if (result.approvalFindings.length > 0) {
    actions.push("record-required-approval");
  }

  if (result.blockedActions.length > 0) {
    actions.push("do-not-complete-sop");
  }

  return actions;
}

function hasEvidence(workflow, item) {
  const candidates = [item.id, ...(item.aliases ?? [])];
  return candidates.some((candidate) => isPresent(getByPath(workflow.evidence ?? {}, candidate)) || isPresent(getByPath(workflow, candidate)));
}

function hasApproval(workflow, approval) {
  const candidates = [approval.id, approval.evidenceId, ...(approval.aliases ?? [])].filter(Boolean);
  return candidates.some((candidate) => isPresent(getByPath(workflow.approvals ?? {}, candidate)) || isPresent(getByPath(workflow.evidence ?? {}, candidate)));
}

function isPresent(value) {
  if (value === true) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return false;
}

function getByPath(value, dottedPath) {
  if (!dottedPath) {
    return undefined;
  }

  return String(dottedPath)
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), value);
}

function arrayOfStrings(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === "string");
}
