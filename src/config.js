import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultScanOptions } from "./scanner.js";
import { normalizePolicyPreset } from "./policy.js";

export const defaultConfig = {
  policy: "personal",
  failOn: "critical",
  failOnPolicy: false,
  policyFailOn: "manual_review",
  maxFileSizeBytes: defaultScanOptions.maxFileSizeBytes,
  maxFindingsPerRulePerFile: defaultScanOptions.maxFindingsPerRulePerFile,
  suppressions: [],
  budgets: {},
  models: [],
  modelRouting: {}
};

const failLevels = new Set(["none", "low", "medium", "high", "critical"]);
const policyDecisions = new Set(["warn", "manual_review", "sandbox_required", "dual_approval", "block"]);

export async function loadConfig(targetPath = ".", configPath = null) {
  const resolvedConfigPath = configPath
    ? path.resolve(configPath)
    : await findConfigPath(targetPath);

  if (!resolvedConfigPath) {
    return {
      path: null,
      config: { ...defaultConfig }
    };
  }

  let parsed;

  try {
    parsed = JSON.parse(await fs.readFile(resolvedConfigPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read config ${resolvedConfigPath}: ${error.message}`);
  }

  return {
    path: resolvedConfigPath,
    config: normalizeConfig(parsed, resolvedConfigPath)
  };
}

export function mergeConfig(config, cliOptions = {}) {
  const normalized = normalizeConfig({
    ...config,
    ...definedOnly({
      policy: cliOptions.policy,
      failOn: cliOptions.failOn,
      failOnPolicy: cliOptions.failOnPolicy,
      policyFailOn: cliOptions.policyFailOn,
      maxFileSizeBytes: cliOptions.maxFileSizeBytes,
      maxFindingsPerRulePerFile: cliOptions.maxFindingsPerRulePerFile
    })
  });

  return {
    ...normalized,
    target: cliOptions.target ?? ".",
    json: Boolean(cliOptions.json),
    configPath: cliOptions.configPath,
    htmlPath: cliOptions.htmlPath,
    sarifPath: cliOptions.sarifPath,
    installDir: cliOptions.installDir,
    installName: cliOptions.installName,
    dryRun: Boolean(cliOptions.dryRun),
    approvalOut: cliOptions.approvalOut,
    approvalMode: cliOptions.approvalMode ?? "non-allow"
  };
}

export function normalizeConfig(config = {}, source = "config") {
  const normalized = {
    ...defaultConfig,
    ...config
  };

  normalized.policy = normalizePolicyPreset(normalized.policy);

  if (!failLevels.has(normalized.failOn)) {
    throw new Error(`Invalid failOn in ${source}. Use one of: ${[...failLevels].join(", ")}`);
  }

  if (!policyDecisions.has(normalized.policyFailOn)) {
    throw new Error(`Invalid policyFailOn in ${source}. Use one of: ${[...policyDecisions].join(", ")}`);
  }

  normalized.failOnPolicy = Boolean(normalized.failOnPolicy);
  normalized.maxFileSizeBytes = normalizeSize(normalized.maxFileSizeBytes, "maxFileSizeBytes", source);
  normalized.maxFindingsPerRulePerFile = normalizePositiveInteger(
    normalized.maxFindingsPerRulePerFile,
    "maxFindingsPerRulePerFile",
    source
  );
  normalized.suppressions = normalizeSuppressions(normalized.suppressions, source);
  normalized.budgets = normalizeBudgets(normalized.budgets, source);
  normalized.models = normalizeModels(normalized.models, source);
  normalized.modelRouting = normalizeModelRouting(normalized.modelRouting, source);

  return normalized;
}

export function parseSize(value) {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    throw new Error("Missing size value");
  }

  const match = /^(\d+)(b|kb|mb)?$/i.exec(String(value).trim());
  if (!match) {
    throw new Error("Use bytes, kb, or mb.");
  }

  const amount = Number(match[1]);
  if (amount <= 0) {
    throw new Error("Size must be greater than 0.");
  }

  const unit = (match[2] ?? "b").toLowerCase();
  const multipliers = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024
  };

  return amount * multipliers[unit];
}

async function findConfigPath(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  let stats;

  try {
    stats = await fs.lstat(resolvedTarget);
  } catch {
    return null;
  }

  let currentDir = stats.isDirectory() ? resolvedTarget : path.dirname(resolvedTarget);

  while (true) {
    const candidate = path.join(currentDir, ".clawguard.json");

    try {
      const candidateStats = await fs.lstat(candidate);
      if (candidateStats.isFile()) {
        return candidate;
      }
    } catch {
      // Keep walking upward.
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      return null;
    }
    currentDir = parent;
  }
}

function normalizeSize(value, name, source) {
  try {
    const size = parseSize(value);
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw new Error("Size must be a positive integer.");
    }
    return size;
  } catch (error) {
    throw new Error(`Invalid ${name} in ${source}: ${error.message}`);
  }
}

function normalizePositiveInteger(value, name, source) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`Invalid ${name} in ${source}: expected a positive integer.`);
  }

  return number;
}

function normalizeSuppressions(suppressions, source) {
  if (!Array.isArray(suppressions)) {
    throw new Error(`Invalid suppressions in ${source}: expected an array.`);
  }

  return suppressions.map((suppression, index) => {
    if (!suppression || typeof suppression !== "object") {
      throw new Error(`Invalid suppression ${index} in ${source}: expected an object.`);
    }

    if (!suppression.ruleId || !suppression.reason) {
      throw new Error(`Invalid suppression ${index} in ${source}: ruleId and reason are required.`);
    }

    return {
      ruleId: String(suppression.ruleId),
      path: suppression.path ? String(suppression.path) : null,
      reason: String(suppression.reason),
      expires: suppression.expires ? String(suppression.expires) : null,
      allowCritical: Boolean(suppression.allowCritical)
    };
  });
}

function normalizeBudgets(budgets, source) {
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) {
    throw new Error(`Invalid budgets in ${source}: expected an object.`);
  }

  return {
    approvalRequestUsd: normalizeOptionalNonNegativeNumber(budgets.approvalRequestUsd, "approvalRequestUsd", source),
    maxRequestUsd: normalizeOptionalNonNegativeNumber(budgets.maxRequestUsd, "maxRequestUsd", source),
    maxInputTokens: normalizeOptionalNonNegativeInteger(budgets.maxInputTokens, "maxInputTokens", source),
    maxOutputTokens: normalizeOptionalNonNegativeInteger(budgets.maxOutputTokens, "maxOutputTokens", source),
    maxTotalTokens: normalizeOptionalNonNegativeInteger(budgets.maxTotalTokens, "maxTotalTokens", source)
  };
}

function normalizeModels(models, source) {
  if (!Array.isArray(models)) {
    throw new Error(`Invalid models in ${source}: expected an array.`);
  }

  return models.map((model, index) => {
    if (!model || typeof model !== "object") {
      throw new Error(`Invalid model ${index} in ${source}: expected an object.`);
    }

    const provider = String(model.provider ?? "").trim();
    const modelName = String(model.model ?? "").trim();

    if (!provider || !modelName) {
      throw new Error(`Invalid model ${index} in ${source}: provider and model are required.`);
    }

    return {
      provider,
      model: modelName,
      inputUsdPer1M: normalizeNonNegativeNumber(model.inputUsdPer1M, `models[${index}].inputUsdPer1M`, source),
      outputUsdPer1M: normalizeNonNegativeNumber(model.outputUsdPer1M, `models[${index}].outputUsdPer1M`, source)
    };
  });
}

function normalizeModelRouting(modelRouting, source) {
  if (!modelRouting || typeof modelRouting !== "object" || Array.isArray(modelRouting)) {
    throw new Error(`Invalid modelRouting in ${source}: expected an object.`);
  }

  const normalized = {};

  if (modelRouting.defaultProfile !== undefined) {
    normalized.defaultProfile = String(modelRouting.defaultProfile);
  }

  if (modelRouting.approvalProfiles !== undefined) {
    if (!Array.isArray(modelRouting.approvalProfiles)) {
      throw new Error(`Invalid modelRouting.approvalProfiles in ${source}: expected an array.`);
    }
    normalized.approvalProfiles = modelRouting.approvalProfiles.map((profile) => String(profile));
  }

  normalized.longContextTokens = normalizeOptionalNonNegativeInteger(
    modelRouting.longContextTokens,
    "modelRouting.longContextTokens",
    source
  );
  normalized.premiumContextTokens = normalizeOptionalNonNegativeInteger(
    modelRouting.premiumContextTokens,
    "modelRouting.premiumContextTokens",
    source
  );

  if (modelRouting.profiles !== undefined) {
    if (!modelRouting.profiles || typeof modelRouting.profiles !== "object" || Array.isArray(modelRouting.profiles)) {
      throw new Error(`Invalid modelRouting.profiles in ${source}: expected an object.`);
    }

    normalized.profiles = Object.fromEntries(Object.entries(modelRouting.profiles).map(([name, profile]) => {
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        throw new Error(`Invalid modelRouting profile ${name} in ${source}: expected an object.`);
      }

      return [String(name), {
        model: profile.model === undefined ? null : String(profile.model),
        description: profile.description === undefined ? "" : String(profile.description),
        fallbacks: Array.isArray(profile.fallbacks) ? profile.fallbacks.map((fallback) => String(fallback)) : [],
        approvalRequired: Boolean(profile.approvalRequired)
      }];
    }));
  }

  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
}

function normalizeOptionalNonNegativeInteger(value, name, source) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Invalid ${name} in ${source}: expected a non-negative integer.`);
  }

  return number;
}

function normalizeNonNegativeNumber(value, name, source) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Invalid ${name} in ${source}: expected a non-negative number.`);
  }

  return number;
}

function normalizeOptionalNonNegativeNumber(value, name, source) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return normalizeNonNegativeNumber(value, name, source);
}

function definedOnly(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}
