export const policyPresets = new Set(["personal", "governed", "enterprise"]);

const decisionRank = {
  allow: 0,
  warn: 1,
  manual_review: 2,
  sandbox_required: 3,
  dual_approval: 4,
  block: 5
};

const sensitiveEnterpriseRules = new Set([
  "remote-code-execution",
  "credential-access",
  "data-exfiltration",
  "destructive-shell",
  "undeclared-env-access",
  "mcp-secret-env",
  "mcp-shell-execution",
  "mcp-broad-filesystem-access",
  "dependency-install-script",
  "dependency-direct-source"
]);

export function evaluatePolicy(scanResult, preset = "personal") {
  const normalizedPreset = normalizePolicyPreset(preset);
  const findings = scanResult.findings ?? [];
  const ruleIds = new Set(findings.map((finding) => finding.ruleId));
  const level = scanResult.level ?? "info";
  const decision = decisionFor(normalizedPreset, level, ruleIds);

  return {
    preset: normalizedPreset,
    decision,
    rank: decisionRank[decision],
    reason: reasonFor(decision, level, ruleIds),
    requiredActions: requiredActionsFor(decision, ruleIds)
  };
}

export function normalizePolicyPreset(preset) {
  if (!policyPresets.has(preset)) {
    throw new Error(`Invalid policy preset. Use one of: ${[...policyPresets].join(", ")}`);
  }

  return preset;
}

export function policyShouldFail(policy, minimumDecision = "manual_review") {
  const decision = policy?.decision ?? "allow";

  if (!(minimumDecision in decisionRank)) {
    throw new Error(`Invalid policy fail decision: ${minimumDecision}`);
  }

  return decisionRank[decision] >= decisionRank[minimumDecision];
}

function decisionFor(preset, level, ruleIds) {
  if (preset === "enterprise" && hasSensitiveEnterpriseFinding(ruleIds)) {
    return "block";
  }

  if (level === "critical") {
    return "block";
  }

  if (preset === "personal") {
    if (level === "high") return "manual_review";
    if (level === "medium") return "warn";
    return "allow";
  }

  if (preset === "governed") {
    if (level === "high") return "sandbox_required";
    if (level === "medium") return "manual_review";
    if (level === "low") return "warn";
    return "allow";
  }

  if (level === "high") return "dual_approval";
  if (level === "medium") return "manual_review";
  if (level === "low") return "warn";
  return "allow";
}

function hasSensitiveEnterpriseFinding(ruleIds) {
  for (const ruleId of ruleIds) {
    if (sensitiveEnterpriseRules.has(ruleId)) {
      return true;
    }
  }

  return false;
}

function reasonFor(decision, level, ruleIds) {
  if (decision === "allow") {
    return "No policy action required.";
  }

  if (ruleIds.has("remote-code-execution")) {
    return "Remote code execution behavior requires blocking or explicit review.";
  }

  if (ruleIds.has("undeclared-env-access")) {
    return "The skill uses environment secrets that are not declared in metadata.";
  }

  if (level === "critical") {
    return "Aggregate risk score exceeds the critical policy threshold.";
  }

  if (decision === "sandbox_required") {
    return "High-risk behavior should run only with sandboxing or constrained tools.";
  }

  if (decision === "dual_approval") {
    return "High-risk enterprise behavior requires stronger approval.";
  }

  if (decision === "manual_review") {
    return "Risky behavior requires human review before trust is granted.";
  }

  if (level === "medium") {
    return "Medium-risk findings should be visible before install or merge.";
  }

  return "Low-risk findings should be visible before install or merge.";
}

function requiredActionsFor(decision, ruleIds) {
  const actions = [];

  if (decision === "allow") {
    return actions;
  }

  if (["manual_review", "sandbox_required", "dual_approval", "block"].includes(decision)) {
    actions.push("manual-review");
  }

  if (["sandbox_required", "dual_approval"].includes(decision)) {
    actions.push("sandbox");
  }

  if (decision === "dual_approval") {
    actions.push("second-approval");
  }

  if (decision === "block") {
    actions.push("do-not-install");
  }

  if (ruleIds.has("undeclared-env-access") || ruleIds.has("undeclared-network-access")) {
    actions.push("declare-requirements");
  }

  if (ruleIds.has("dependency-unpinned-spec") || ruleIds.has("dependency-lockfile-missing")) {
    actions.push("pin-dependencies");
  }

  return [...new Set(actions)];
}
