const CHECK_SCHEMA_VERSION = "clawguard.check.v1";
const MAX_CHECK_SUMMARY_LENGTH = 280;
const MAX_CHECK_FINDINGS = 10;

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export function createCheckResult(scanResult, options = {}) {
  const decision = mapCheckDecision(scanResult.policy.decision);
  const sortedFindings = sortCheckFindings(scanResult.findings);
  const findingSummary = {
    critical: scanResult.summary?.critical ?? 0,
    high: scanResult.summary?.high ?? 0,
    medium: scanResult.summary?.medium ?? 0,
    low: scanResult.summary?.low ?? 0
  };
  const checkResult = {
    schemaVersion: CHECK_SCHEMA_VERSION,
    target: scanResult.target,
    decision,
    risk: scanResult.level,
    summary: createCheckSummary(scanResult, decision, sortedFindings),
    recommendedAction: mapRecommendedAction(decision),
    policyPreset: scanResult.options?.policy ?? scanResult.policy.preset,
    findingSummary,
    findings: sortedFindings.slice(0, MAX_CHECK_FINDINGS).map(toCheckFinding),
    requiredActions: scanResult.policy.requiredActions ?? [],
    scanReportPath: options.scanReportPath ?? null,
    configPath: scanResult.configPath ?? null,
    generatedAt: options.generatedAt ?? new Date().toISOString()
  };

  return checkResult;
}

export function checkExitCode(decision) {
  if (decision === "allow") {
    return 0;
  }

  if (decision === "block") {
    return 2;
  }

  return 1;
}

export function mapCheckDecision(scanDecision) {
  if (scanDecision === "allow") {
    return "allow";
  }

  if (scanDecision === "block") {
    return "block";
  }

  return "manual_review";
}

export function mapRecommendedAction(checkDecision) {
  if (checkDecision === "allow") {
    return "auto_install";
  }

  if (checkDecision === "block") {
    return "reject";
  }

  return "require_user_approval";
}

function sortCheckFindings(findings) {
  if (!Array.isArray(findings)) {
    return [];
  }

  return [...findings].sort((a, b) => {
    const severityDelta = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return (a.file ?? "").localeCompare(b.file ?? "");
  });
}

function toCheckFinding(finding) {
  return {
    ruleId: finding.ruleId,
    title: finding.title,
    severity: finding.severity,
    file: finding.file,
    line: finding.line,
    evidence: finding.evidence
  };
}

function createCheckSummary(scanResult, decision, sortedFindings) {
  const top = sortedFindings[0];
  const total = (scanResult.summary?.critical ?? 0) + (scanResult.summary?.high ?? 0) + (scanResult.summary?.medium ?? 0) + (scanResult.summary?.low ?? 0);

  if (decision === "block") {
    if (top) {
      return clampSummary(`Blocked: ${top.title}.`);
    }

    return clampSummary("Blocked by policy.");
  }

  if (decision === "manual_review") {
    if (top) {
      return clampSummary(`Manual review: ${top.title}.`);
    }

    const requiredAction = scanResult.policy.requiredActions?.[0];

    if (requiredAction) {
      return clampSummary(`Manual review: ${requiredAction}.`);
    }

    return clampSummary("Manual review required by policy.");
  }

  if (total === 0) {
    return clampSummary("No risky patterns detected.");
  }

  return clampSummary(`Allowed with ${total} low-severity finding(s) noted.`);
}

function clampSummary(text) {
  const oneLine = String(text).replace(/\s+/g, " ").trim();

  if (oneLine.length <= MAX_CHECK_SUMMARY_LENGTH) {
    return oneLine;
  }

  return `${oneLine.slice(0, MAX_CHECK_SUMMARY_LENGTH - 3)}...`;
}
