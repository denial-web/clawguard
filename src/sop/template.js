export function createSopWorkflowTemplate(pack) {
  return {
    schemaVersion: "clawguard.sopWorkflow.v1",
    pack: pack.id,
    task: defaultTaskFor(pack),
    role: pack.role,
    actions: defaultActionsFor(pack),
    evidence: Object.fromEntries((pack.evidence ?? []).map((item) => [item.id, null])),
    approvals: Object.fromEntries((pack.approvals ?? []).map((item) => [item.id, null])),
    metrics: metricsTemplateFor(pack),
    notes: []
  };
}

export function defaultSopWorkflowPath(pack) {
  return `${pack.id.replaceAll("/", "-")}.workflow.json`;
}

function defaultTaskFor(pack) {
  if (pack.id === "small-business/milk-tea/closing") {
    return "Close the milk tea shop";
  }

  return pack.title;
}

function defaultActionsFor(pack) {
  const actions = new Set();

  for (const rule of pack.blockedActions ?? []) {
    if (rule.action && ((rule.whenMissing ?? []).length > 0 || (rule.whenThreshold ?? []).length > 0)) {
      actions.add(rule.action);
    }
  }

  return [...actions];
}

function metricsTemplateFor(pack) {
  const metrics = {};

  for (const threshold of pack.thresholds ?? []) {
    setByPath(metrics, threshold.field.replace(/^metrics\./, ""), null);
  }

  return metrics;
}

function setByPath(target, dottedPath, value) {
  const parts = String(dottedPath).split(".").filter(Boolean);
  let current = target;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }

    current[part] = current[part] ?? {};
    current = current[part];
  }
}
