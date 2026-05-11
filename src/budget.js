import { promises as fs } from "node:fs";
import path from "node:path";

export const budgetSchemaVersion = "clawguard.budget.v1";

export async function runBudgetCheck(options = {}) {
  const result = createBudgetCheck(options);

  if (options.auditLogPath) {
    await appendBudgetAuditLog(options.auditLogPath, result);
    result.auditLogPath = path.resolve(options.auditLogPath);
  }

  return result;
}

export function createBudgetCheck(options = {}) {
  const provider = normalizeRequiredText(options.provider, "--provider");
  const model = normalizeRequiredText(options.model, "--model");
  const inputTokens = normalizeNonNegativeInteger(options.inputTokens, "--input-tokens");
  const outputTokens = normalizeNonNegativeInteger(options.outputTokens, "--output-tokens");
  const pricing = resolvePricing({
    provider,
    model,
    inputUsdPer1M: options.inputUsdPer1M,
    outputUsdPer1M: options.outputUsdPer1M,
    models: options.models
  });
  const limits = resolveLimits(options);
  const estimatedInputUsd = roundUsd((inputTokens / 1_000_000) * pricing.inputUsdPer1M);
  const estimatedOutputUsd = roundUsd((outputTokens / 1_000_000) * pricing.outputUsdPer1M);
  const estimatedUsd = roundUsd(estimatedInputUsd + estimatedOutputUsd);
  const totalTokens = inputTokens + outputTokens;
  const { decision, reason, requiredActions } = evaluateBudgetDecision({
    estimatedUsd,
    inputTokens,
    outputTokens,
    totalTokens,
    limits
  });

  return {
    schemaVersion: budgetSchemaVersion,
    checkedAt: new Date().toISOString(),
    provider,
    model,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens
    },
    pricing,
    cost: {
      estimatedInputUsd,
      estimatedOutputUsd,
      estimatedUsd
    },
    limits,
    decision,
    reason,
    requiredActions
  };
}

export function budgetExitCode(decision) {
  if (decision === "allow") {
    return 0;
  }

  if (decision === "block") {
    return 2;
  }

  return 1;
}

function resolvePricing({ provider, model, inputUsdPer1M, outputUsdPer1M, models = [] }) {
  if (inputUsdPer1M !== undefined || outputUsdPer1M !== undefined) {
    return {
      source: "cli",
      inputUsdPer1M: normalizeNonNegativeNumber(inputUsdPer1M, "--input-usd-per-1m"),
      outputUsdPer1M: normalizeNonNegativeNumber(outputUsdPer1M, "--output-usd-per-1m")
    };
  }

  const match = models.find((candidate) => {
    return candidate.provider === provider && candidate.model === model;
  });

  if (!match) {
    throw new Error("budget check requires pricing via --input-usd-per-1m and --output-usd-per-1m, or a matching model in .clawguard.json.");
  }

  return {
    source: "config",
    inputUsdPer1M: match.inputUsdPer1M,
    outputUsdPer1M: match.outputUsdPer1M
  };
}

function resolveLimits(options) {
  const budgets = options.budgets ?? {};

  return {
    approvalRequestUsd: normalizeOptionalNonNegativeNumber(
      options.approvalRequestUsd ?? budgets.approvalRequestUsd,
      "approvalRequestUsd"
    ),
    maxRequestUsd: normalizeOptionalNonNegativeNumber(
      options.maxRequestUsd ?? budgets.maxRequestUsd,
      "maxRequestUsd"
    ),
    maxInputTokens: normalizeOptionalNonNegativeInteger(
      options.maxInputTokens ?? budgets.maxInputTokens,
      "maxInputTokens"
    ),
    maxOutputTokens: normalizeOptionalNonNegativeInteger(
      options.maxOutputTokens ?? budgets.maxOutputTokens,
      "maxOutputTokens"
    ),
    maxTotalTokens: normalizeOptionalNonNegativeInteger(
      options.maxTotalTokens ?? budgets.maxTotalTokens,
      "maxTotalTokens"
    )
  };
}

function evaluateBudgetDecision({ estimatedUsd, inputTokens, outputTokens, totalTokens, limits }) {
  const blockers = [];

  if (limits.maxRequestUsd !== undefined && estimatedUsd > limits.maxRequestUsd) {
    blockers.push(`estimated cost $${formatUsd(estimatedUsd)} exceeds max request $${formatUsd(limits.maxRequestUsd)}`);
  }

  if (limits.maxInputTokens !== undefined && inputTokens > limits.maxInputTokens) {
    blockers.push(`input tokens ${inputTokens} exceed max input tokens ${limits.maxInputTokens}`);
  }

  if (limits.maxOutputTokens !== undefined && outputTokens > limits.maxOutputTokens) {
    blockers.push(`output tokens ${outputTokens} exceed max output tokens ${limits.maxOutputTokens}`);
  }

  if (limits.maxTotalTokens !== undefined && totalTokens > limits.maxTotalTokens) {
    blockers.push(`total tokens ${totalTokens} exceed max total tokens ${limits.maxTotalTokens}`);
  }

  if (blockers.length > 0) {
    return {
      decision: "block",
      reason: blockers.join("; "),
      requiredActions: ["reduce-token-usage", "use-cheaper-model", "owner-review"]
    };
  }

  if (limits.approvalRequestUsd !== undefined && estimatedUsd > limits.approvalRequestUsd) {
    return {
      decision: "manual_review",
      reason: `estimated cost $${formatUsd(estimatedUsd)} exceeds approval threshold $${formatUsd(limits.approvalRequestUsd)}`,
      requiredActions: ["owner-budget-approval"]
    };
  }

  return {
    decision: "allow",
    reason: "Estimated request is within configured budget limits.",
    requiredActions: []
  };
}

async function appendBudgetAuditLog(auditLogPath, result) {
  const resolvedPath = path.resolve(auditLogPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.appendFile(resolvedPath, `${JSON.stringify(result)}\n`);
}

function normalizeRequiredText(value, name) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`budget check requires ${name}.`);
  }

  return text;
}

function normalizeNonNegativeInteger(value, name) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return number;
}

function normalizeOptionalNonNegativeInteger(value, name) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return normalizeNonNegativeInteger(value, name);
}

function normalizeNonNegativeNumber(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return number;
}

function normalizeOptionalNonNegativeNumber(value, name) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return normalizeNonNegativeNumber(value, name);
}

function roundUsd(value) {
  return Number(value.toFixed(8));
}

function formatUsd(value) {
  return roundUsd(value).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
