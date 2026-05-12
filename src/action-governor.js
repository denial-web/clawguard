import { randomUUID } from "node:crypto";

export const actionTypes = new Set([
  "read",
  "draft",
  "recommend",
  "write-local",
  "install-skill",
  "send-external",
  "customer-impacting",
  "money-movement"
]);

export const dataClasses = new Set([
  "public",
  "internal",
  "confidential",
  "customer-pii",
  "payment-data",
  "credentials",
  "regulatory"
]);

const lowRiskActionTypes = new Set(["read", "draft", "recommend"]);
const reviewActionTypes = new Set(["write-local", "install-skill", "send-external"]);
const sensitiveDataClasses = new Set(["customer-pii", "payment-data", "credentials", "regulatory"]);
const finalRegulatedPattern = /\b(approve|approval|close|finali[sz]e|freeze|unfreeze|kyc|aml|loan|card\s+change|account\s+change|settle|submit)\b/i;
const moneyMovementPattern = /\b(transfer|pay|payment|refund|reverse|settle|debit|credit|wire|remit|withdraw|deposit)\b/i;

export function createActionPlan(options = {}) {
  const actionType = normalizeActionType(options.actionType ?? inferActionType(options));
  const dataClass = normalizeDataClass(options.dataClass ?? "internal");
  const task = String(options.task ?? "").trim();
  const recoverability = normalizeRecoverability(options.recoverability ?? inferRecoverability(actionType));
  const decision = decideAction({
    actionType,
    dataClass,
    task,
    recoverability,
    actor: options.actor ?? "local-user",
    checker: options.checker
  });
  const requiredActions = requiredActionsFor({ decision, actionType, dataClass, recoverability });

  return {
    schemaVersion: "clawguard.actionPlan.v1",
    id: options.id ?? randomUUID(),
    createdAt: new Date().toISOString(),
    decision,
    reason: reasonFor({ decision, actionType, dataClass, task, recoverability }),
    requiredActions,
    action: {
      type: actionType,
      dataClass,
      task,
      tool: options.tool,
      target: options.target,
      externalTarget: options.externalTarget
    },
    actor: {
      name: options.actor ?? "local-user",
      role: options.role,
      businessUnit: options.businessUnit
    },
    approvalChain: {
      maker: options.actor ?? "local-user",
      checker: options.checker,
      segregationOfDuties: options.checker ? options.checker !== (options.actor ?? "local-user") : undefined
    },
    recovery: {
      recoverability,
      reversible: recoverability === "reversible",
      strategy: recoveryStrategyFor(actionType, recoverability)
    },
    policy: {
      preset: options.profile ?? "financial-internal",
      nonGoals: [
        "No autonomous money movement.",
        "No final regulated decisions without bank-approved procedures."
      ]
    }
  };
}

export function actionDecisionExitCode(decision) {
  if (decision === "block") return 2;
  if (["manual_review", "dual_approval"].includes(decision)) return 1;
  return 0;
}

export function normalizeActionType(actionType) {
  const normalized = String(actionType ?? "").trim().toLowerCase();

  if (!actionTypes.has(normalized)) {
    throw new Error(`Invalid action type. Use one of: ${[...actionTypes].join(", ")}`);
  }

  return normalized;
}

export function normalizeDataClass(dataClass) {
  const normalized = String(dataClass ?? "").trim().toLowerCase();

  if (!dataClasses.has(normalized)) {
    throw new Error(`Invalid data class. Use one of: ${[...dataClasses].join(", ")}`);
  }

  return normalized;
}

function inferActionType(options) {
  const text = [options.task, options.tool, options.target, options.externalTarget].filter(Boolean).join(" ");

  if (moneyMovementPattern.test(text)) return "money-movement";
  if (finalRegulatedPattern.test(text)) return "customer-impacting";
  return "recommend";
}

function normalizeRecoverability(recoverability) {
  const normalized = String(recoverability ?? "").trim().toLowerCase();

  if (!["reversible", "compensating", "irreversible"].includes(normalized)) {
    throw new Error("Invalid recoverability. Use one of: reversible, compensating, irreversible");
  }

  return normalized;
}

function inferRecoverability(actionType) {
  if (["write-local", "install-skill"].includes(actionType)) return "reversible";
  if (["send-external", "customer-impacting"].includes(actionType)) return "compensating";
  if (actionType === "money-movement") return "irreversible";
  return "reversible";
}

function decideAction({ actionType, dataClass, task, recoverability, actor, checker }) {
  if (checker && checker === actor && requiresIndependentChecker({ actionType, dataClass, task })) {
    return "block";
  }

  if (actionType === "money-movement") {
    return "block";
  }

  if (actionType === "customer-impacting" || finalRegulatedPattern.test(task)) {
    return "dual_approval";
  }

  if (recoverability === "irreversible") {
    return "block";
  }

  if (actionType === "send-external" && sensitiveDataClasses.has(dataClass)) {
    return "dual_approval";
  }

  if (reviewActionTypes.has(actionType)) {
    return "manual_review";
  }

  if (lowRiskActionTypes.has(actionType) && sensitiveDataClasses.has(dataClass)) {
    return "manual_review";
  }

  return "allow";
}

function requiredActionsFor({ decision, actionType, dataClass, recoverability }) {
  const actions = [];

  if (decision === "allow") {
    return actions;
  }

  if (["manual_review", "dual_approval", "block"].includes(decision)) {
    actions.push("human-review");
  }

  if (decision === "dual_approval") {
    actions.push("maker-checker-approval");
  }

  if (decision === "block") {
    actions.push("do-not-execute");
  }

  if (sensitiveDataClasses.has(dataClass)) {
    actions.push("protect-sensitive-data");
  }

  if (["write-local", "install-skill"].includes(actionType)) {
    actions.push("capture-pre-action-snapshot");
  }

  if (recoverability !== "reversible") {
    actions.push("create-compensating-record");
  }

  return [...new Set(actions)];
}

function reasonFor({ decision, actionType, dataClass, task, recoverability }) {
  if (decision === "block" && actionType !== "money-movement" && recoverability !== "irreversible") {
    return "Sensitive financial actions cannot be approved by the same maker/checker.";
  }

  if (actionType === "money-movement") {
    return "Money movement is blocked in the financial-governor MVP.";
  }

  if (actionType === "customer-impacting" || finalRegulatedPattern.test(task)) {
    return "Customer-impacting or final regulated decisions require maker-checker approval.";
  }

  if (recoverability === "irreversible") {
    return "Irreversible actions are blocked unless a bank-approved recovery procedure exists.";
  }

  if (actionType === "send-external" && sensitiveDataClasses.has(dataClass)) {
    return "Sending sensitive financial data outside the local environment requires dual approval.";
  }

  if (decision === "manual_review") {
    return "This action changes trust, files, tools, external state, or sensitive context and needs review.";
  }

  return "Low-risk internal action is allowed by the financial-governor baseline.";
}

function requiresIndependentChecker({ actionType, dataClass, task }) {
  return actionType === "customer-impacting"
    || actionType === "send-external"
    || sensitiveDataClasses.has(dataClass)
    || finalRegulatedPattern.test(task);
}

function recoveryStrategyFor(actionType, recoverability) {
  if (recoverability === "irreversible") {
    return "block-or-escalate";
  }

  if (recoverability === "compensating") {
    return "create-compensating-record-and-incident";
  }

  if (actionType === "install-skill") {
    return "quarantine-installed-skill-and-restore-prior-state";
  }

  if (actionType === "write-local") {
    return "restore-pre-action-snapshot";
  }

  return "preserve-journal-and-mark-superseded";
}
