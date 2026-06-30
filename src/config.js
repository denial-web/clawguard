import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeToolAutonomyConfig } from "./agent/autonomy.js";
import { normalizeProtectedAssetsConfig } from "./agent/protected-assets.js";
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
  modelRouting: {},
  agent: {
    enabled: true,
    provider: "mock",
    model: null,
    baseUrl: null,
    apiKeyEnv: null,
    safetyProfile: "developer",
    stateDir: ".clawguard/agent",
    auditPath: ".clawguard/agent/audit.jsonl",
    memoryPath: ".clawguard/agent/memory.jsonl",
    userMemoryMarkdownPath: ".clawguard/agent/USER.md",
    workspaceMemoryMarkdownPath: ".clawguard/agent/MEMORY.md",
    sessionsDir: ".clawguard/agent/sessions",
    recallDir: ".clawguard/agent/recall",
    thinkingDir: ".clawguard/agent/thinking",
    backupsDir: ".clawguard/agent/backups",
    proposedDir: ".clawguard/agent/proposed",
    subagentsDir: ".clawguard/agent/subagents",
    trustedSkillDirs: ["skills"],
    trustedSkillsDir: ".clawguard/agent/skills",
    approvalPath: ".clawguard/approvals.jsonl",
    decisionsPath: ".clawguard/decisions.jsonl",
    autoWriteMemory: false,
    memoryReadLimit: 50,
    memoryScope: "workspace",
    memoryMirrorLimit: 500,
    recallMemoryLimit: 8,
    recallSessionLimit: 5,
    autoProposeTaskOutcomeMemory: true,
    thinking: {
      enabled: true,
      auto: true,
      maxIterations: 2,
      providerMode: "auto"
    },
    shellTimeoutMs: 10000,
    shellMaxBufferBytes: 256 * 1024,
    outputLimitBytes: 65536,
    toolOutputScan: {
      enabled: true,
      captureObservations: true,
      maxObservationBytes: 4096
    },
    injectionCritic: {
      enabled: false,
      baseUrl: null,
      modelId: "nexus:local",
      apiKeyEnv: "NEXUS_AGENT_API_KEY",
      failClosed: false
    },
    toolAutonomy: {
      preset: "developer",
      overrides: {}
    },
    protectedAssets: {
      enabled: true,
      defaultPatterns: true,
      assets: []
    },
    integrations: {
      webSearch: {
        provider: null,
        apiKeyEnv: null,
        baseUrl: null
      },
      webFetch: {
        enabled: false,
        maxBytes: 65536
      },
      github: {
        allowedRepos: [],
        tokenEnv: "GITHUB_TOKEN",
        apiBase: "https://api.github.com",
        mock: false
      },
      browserBridge: {
        enabled: false,
        allowPrivateUrls: false,
        allowedDomains: [],
        mode: "dry-run",
        driver: "fetch"
      },
      notifications: {
        telegram: {
          chatId: null,
          botTokenEnv: "TELEGRAM_BOT_TOKEN",
          apiBase: "https://api.telegram.org"
        }
      }
    }
  }
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
    writeReportPath: cliOptions.writeReportPath,
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
  normalized.agent = normalizeAgentConfig(normalized.agent, source);

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

function normalizeAgentConfig(agent, source) {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) {
    throw new Error(`Invalid agent in ${source}: expected an object.`);
  }

  const normalized = {
    ...defaultConfig.agent,
    ...agent
  };

  return {
    enabled: Boolean(normalized.enabled),
    provider: normalizeOptionalString(normalized.provider, "agent.provider", source) ?? "mock",
    model: normalizeNullableString(normalized.model, "agent.model", source),
    baseUrl: normalizeNullableString(normalized.baseUrl, "agent.baseUrl", source),
    apiKey: normalizeNullableString(normalized.apiKey, "agent.apiKey", source),
    apiKeyEnv: normalizeNullableString(normalized.apiKeyEnv, "agent.apiKeyEnv", source),
    safetyProfile: normalizeOptionalString(normalized.safetyProfile, "agent.safetyProfile", source) ?? "developer",
    stateDir: normalizeOptionalString(normalized.stateDir, "agent.stateDir", source) ?? defaultConfig.agent.stateDir,
    auditPath: normalizeOptionalString(normalized.auditPath, "agent.auditPath", source) ?? defaultConfig.agent.auditPath,
    memoryPath: normalizeOptionalString(normalized.memoryPath, "agent.memoryPath", source) ?? defaultConfig.agent.memoryPath,
    userMemoryMarkdownPath: normalizeOptionalString(normalized.userMemoryMarkdownPath, "agent.userMemoryMarkdownPath", source) ?? defaultConfig.agent.userMemoryMarkdownPath,
    workspaceMemoryMarkdownPath: normalizeOptionalString(normalized.workspaceMemoryMarkdownPath, "agent.workspaceMemoryMarkdownPath", source) ?? defaultConfig.agent.workspaceMemoryMarkdownPath,
    sessionsDir: normalizeOptionalString(normalized.sessionsDir, "agent.sessionsDir", source) ?? defaultConfig.agent.sessionsDir,
    recallDir: normalizeOptionalString(normalized.recallDir, "agent.recallDir", source) ?? defaultConfig.agent.recallDir,
    thinkingDir: normalizeOptionalString(normalized.thinkingDir, "agent.thinkingDir", source) ?? defaultConfig.agent.thinkingDir,
    backupsDir: normalizeOptionalString(normalized.backupsDir, "agent.backupsDir", source) ?? defaultConfig.agent.backupsDir,
    proposedDir: normalizeOptionalString(normalized.proposedDir, "agent.proposedDir", source) ?? defaultConfig.agent.proposedDir,
    subagentsDir: normalizeOptionalString(normalized.subagentsDir, "agent.subagentsDir", source) ?? defaultConfig.agent.subagentsDir,
    trustedSkillDirs: normalizeStringArray(normalized.trustedSkillDirs, "agent.trustedSkillDirs", source),
    trustedSkillsDir: normalizeOptionalString(normalized.trustedSkillsDir, "agent.trustedSkillsDir", source) ?? defaultConfig.agent.trustedSkillsDir,
    approvalPath: normalizeOptionalString(normalized.approvalPath, "agent.approvalPath", source) ?? defaultConfig.agent.approvalPath,
    decisionsPath: normalizeOptionalString(normalized.decisionsPath, "agent.decisionsPath", source) ?? defaultConfig.agent.decisionsPath,
    autoWriteMemory: Boolean(normalized.autoWriteMemory),
    memoryReadLimit: normalizePositiveInteger(normalized.memoryReadLimit, "agent.memoryReadLimit", source),
    memoryScope: normalizeOptionalString(normalized.memoryScope, "agent.memoryScope", source) ?? "workspace",
    memoryMirrorLimit: normalizePositiveInteger(normalized.memoryMirrorLimit, "agent.memoryMirrorLimit", source),
    recallMemoryLimit: normalizePositiveInteger(normalized.recallMemoryLimit, "agent.recallMemoryLimit", source),
    recallSessionLimit: normalizePositiveInteger(normalized.recallSessionLimit, "agent.recallSessionLimit", source),
    autoProposeTaskOutcomeMemory: normalized.autoProposeTaskOutcomeMemory !== false,
    thinking: normalizeAgentThinking(normalized.thinking, source),
    shellTimeoutMs: normalizePositiveInteger(normalized.shellTimeoutMs, "agent.shellTimeoutMs", source),
    shellMaxBufferBytes: normalizePositiveInteger(normalized.shellMaxBufferBytes, "agent.shellMaxBufferBytes", source),
    outputLimitBytes: normalizePositiveInteger(normalized.outputLimitBytes, "agent.outputLimitBytes", source),
    toolOutputScan: normalizeAgentToolOutputScan(normalized.toolOutputScan, source),
    injectionCritic: normalizeAgentInjectionCritic(normalized.injectionCritic, source),
    toolAutonomy: normalizeAgentToolAutonomy(normalized.toolAutonomy, source),
    protectedAssets: normalizeAgentProtectedAssets(normalized.protectedAssets, source),
    integrations: normalizeAgentIntegrations(normalized.integrations, source)
  };
}

function normalizeAgentThinking(thinking = {}, source) {
  if (!thinking || typeof thinking !== "object" || Array.isArray(thinking)) {
    throw new Error(`Invalid agent.thinking in ${source}: expected an object.`);
  }

  const normalized = {
    ...defaultConfig.agent.thinking,
    ...thinking
  };
  const providerMode = normalizeOptionalString(normalized.providerMode, "agent.thinking.providerMode", source) ?? "auto";
  if (!["auto", "mock", "model"].includes(providerMode)) {
    throw new Error(`Invalid agent.thinking.providerMode in ${source}. Use auto, mock, or model.`);
  }

  return {
    enabled: normalized.enabled !== false,
    auto: normalized.auto !== false,
    maxIterations: Math.min(normalizePositiveInteger(normalized.maxIterations, "agent.thinking.maxIterations", source), 5),
    providerMode
  };
}

function normalizeAgentToolOutputScan(toolOutputScan = {}, source) {
  if (!toolOutputScan || typeof toolOutputScan !== "object" || Array.isArray(toolOutputScan)) {
    throw new Error(`Invalid agent.toolOutputScan in ${source}: expected an object.`);
  }

  const normalized = {
    ...defaultConfig.agent.toolOutputScan,
    ...toolOutputScan
  };

  return {
    enabled: normalized.enabled !== false,
    captureObservations: normalized.captureObservations !== false,
    maxObservationBytes: normalizePositiveInteger(
      normalized.maxObservationBytes,
      "agent.toolOutputScan.maxObservationBytes",
      source
    ),
    ...(Array.isArray(normalized.tools)
      ? { tools: normalizeStringArray(normalized.tools, "agent.toolOutputScan.tools", source) }
      : {}),
    ...(Array.isArray(normalized.captureTools)
      ? { captureTools: normalizeStringArray(normalized.captureTools, "agent.toolOutputScan.captureTools", source) }
      : {})
  };
}

function normalizeAgentInjectionCritic(injectionCritic = {}, source) {
  if (!injectionCritic || typeof injectionCritic !== "object" || Array.isArray(injectionCritic)) {
    throw new Error(`Invalid agent.injectionCritic in ${source}: expected an object.`);
  }

  const normalized = {
    ...defaultConfig.agent.injectionCritic,
    ...injectionCritic
  };

  return {
    enabled: normalized.enabled === true,
    baseUrl: normalizeNullableString(normalized.baseUrl, "agent.injectionCritic.baseUrl", source),
    modelId: normalizeOptionalString(normalized.modelId, "agent.injectionCritic.modelId", source) ?? "nexus:local",
    apiKeyEnv: normalizeOptionalString(normalized.apiKeyEnv, "agent.injectionCritic.apiKeyEnv", source) ?? "NEXUS_AGENT_API_KEY",
    failClosed: normalized.failClosed === true
  };
}

function normalizeAgentToolAutonomy(toolAutonomy = {}, source) {
  try {
    return normalizeToolAutonomyConfig(toolAutonomy);
  } catch (error) {
    throw new Error(`Invalid agent.toolAutonomy in ${source}: ${error.message}`);
  }
}

function normalizeAgentProtectedAssets(protectedAssets = {}, source) {
  if (!protectedAssets || typeof protectedAssets !== "object" || Array.isArray(protectedAssets)) {
    throw new Error(`Invalid agent.protectedAssets in ${source}: expected an object.`);
  }

  if (protectedAssets.assets !== undefined && !Array.isArray(protectedAssets.assets)) {
    throw new Error(`Invalid agent.protectedAssets.assets in ${source}: expected an array.`);
  }

  for (const [index, asset] of (protectedAssets.assets ?? []).entries()) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      throw new Error(`Invalid agent.protectedAssets.assets[${index}] in ${source}: expected an object.`);
    }

    if (!asset.path || typeof asset.path !== "string") {
      throw new Error(`Invalid agent.protectedAssets.assets[${index}] in ${source}: expected path.`);
    }
  }

  const normalized = normalizeProtectedAssetsConfig(protectedAssets);
  return normalized;
}

function normalizeAgentIntegrations(integrations = {}, source) {
  if (!integrations || typeof integrations !== "object" || Array.isArray(integrations)) {
    throw new Error(`Invalid agent.integrations in ${source}: expected an object.`);
  }

  const defaults = defaultConfig.agent.integrations;
  const webSearch = {
    ...defaults.webSearch,
    ...(integrations.webSearch ?? {})
  };
  const webFetch = {
    ...defaults.webFetch,
    ...(integrations.webFetch ?? {})
  };
  const github = {
    ...defaults.github,
    ...(integrations.github ?? {})
  };
  const browserBridge = {
    ...defaults.browserBridge,
    ...(integrations.browserBridge ?? {})
  };
  const notifications = {
    telegram: {
      ...defaults.notifications.telegram,
      ...(integrations.notifications?.telegram ?? {})
    }
  };

  return {
    webSearch: {
      provider: normalizeNullableString(webSearch.provider, "agent.integrations.webSearch.provider", source),
      apiKeyEnv: normalizeNullableString(webSearch.apiKeyEnv, "agent.integrations.webSearch.apiKeyEnv", source),
      baseUrl: normalizeNullableString(webSearch.baseUrl, "agent.integrations.webSearch.baseUrl", source)
    },
    webFetch: {
      enabled: Boolean(webFetch.enabled),
      maxBytes: normalizePositiveInteger(webFetch.maxBytes, "agent.integrations.webFetch.maxBytes", source)
    },
    github: {
      allowedRepos: normalizeStringArray(github.allowedRepos, "agent.integrations.github.allowedRepos", source)
        .map((repo) => repo.toLowerCase()),
      tokenEnv: normalizeOptionalString(github.tokenEnv, "agent.integrations.github.tokenEnv", source) ?? "GITHUB_TOKEN",
      apiBase: normalizeOptionalString(github.apiBase, "agent.integrations.github.apiBase", source) ?? "https://api.github.com",
      mock: Boolean(github.mock)
    },
    browserBridge: {
      enabled: Boolean(browserBridge.enabled),
      allowPrivateUrls: Boolean(browserBridge.allowPrivateUrls),
      allowedDomains: normalizeStringArray(browserBridge.allowedDomains, "agent.integrations.browserBridge.allowedDomains", source)
        .map((domain) => domain.toLowerCase()),
      mode: normalizeOptionalString(browserBridge.mode, "agent.integrations.browserBridge.mode", source) ?? "dry-run",
      driver: normalizeOptionalString(browserBridge.driver, "agent.integrations.browserBridge.driver", source) ?? "fetch"
    },
    notifications: {
      telegram: {
        chatId: normalizeNullableString(notifications.telegram.chatId, "agent.integrations.notifications.telegram.chatId", source),
        botTokenEnv: normalizeOptionalString(notifications.telegram.botTokenEnv, "agent.integrations.notifications.telegram.botTokenEnv", source) ?? "TELEGRAM_BOT_TOKEN",
        apiBase: normalizeOptionalString(notifications.telegram.apiBase, "agent.integrations.notifications.telegram.apiBase", source) ?? "https://api.telegram.org"
      }
    }
  };
}

function normalizeStringArray(value, name, source) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${name} in ${source}: expected an array.`);
  }

  return value.map((item, index) => {
    const text = String(item ?? "").trim();
    if (!text) {
      throw new Error(`Invalid ${name}[${index}] in ${source}: expected a non-empty string.`);
    }
    return text;
  });
}

function normalizeOptionalString(value, name, source) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const text = String(value).trim();
  if (!text) {
    throw new Error(`Invalid ${name} in ${source}: expected a non-empty string.`);
  }
  return text;
}

function normalizeNullableString(value, name, source) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return normalizeOptionalString(value, name, source);
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
