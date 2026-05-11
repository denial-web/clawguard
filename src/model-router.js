import { createBudgetCheck } from "./budget.js";

export const modelRecommendationSchemaVersion = "clawguard.modelRecommendation.v1";

const defaultRouting = {
  defaultProfile: "cheap",
  approvalProfiles: ["premium"],
  longContextTokens: 64000,
  premiumContextTokens: 180000,
  profiles: {
    local: {
      description: "Private or low-cost local model.",
      model: null,
      fallbacks: []
    },
    cheap: {
      description: "Low-cost everyday model.",
      model: null,
      fallbacks: []
    },
    strong: {
      description: "Stronger reasoning model for coding, security, and tool-heavy tasks.",
      model: null,
      fallbacks: []
    },
    premium: {
      description: "Highest-capability model for hard or very long-context work.",
      model: null,
      fallbacks: [],
      approvalRequired: true
    }
  }
};

const simpleTaskTerms = [
  "classify",
  "classification",
  "extract",
  "format",
  "rewrite",
  "summarize",
  "summary",
  "translate"
];

const strongTaskTerms = [
  "agent",
  "architecture",
  "audit",
  "bug",
  "code",
  "debug",
  "exploit",
  "install",
  "permission",
  "policy",
  "review",
  "security",
  "shell",
  "skill",
  "threat",
  "tool"
];

const premiumTaskTerms = [
  "complex",
  "deep",
  "enterprise",
  "large codebase",
  "migration",
  "research",
  "strategy"
];

export function recommendModel(options = {}) {
  const task = String(options.task ?? "").trim();
  const taskType = normalizeText(options.taskType, "general");
  const privacy = normalizeLevel(options.privacy, ["low", "medium", "high"], "low", "--privacy");
  const toolRisk = normalizeLevel(options.toolRisk, ["none", "low", "medium", "high"], "none", "--tool-risk");
  const inputTokens = normalizeNonNegativeInteger(options.inputTokens ?? 0, "--input-tokens");
  const outputTokens = normalizeNonNegativeInteger(options.outputTokens ?? 0, "--output-tokens");
  const totalTokens = inputTokens + outputTokens;
  const routing = mergeRouting(options.modelRouting);
  const inferredTaskType = inferTaskType(task, taskType);
  const signals = collectSignals({
    task,
    taskType,
    inferredTaskType,
    privacy,
    toolRisk,
    totalTokens,
    routing
  });
  const profileScores = scoreProfiles(routing, signals);
  const recommendedProfile = selectProfile(profileScores, routing.defaultProfile);
  const profile = routing.profiles[recommendedProfile] ?? {};
  const recommendedModel = normalizeModelRef(profile.model);
  const fallbackModels = collectFallbackModels(recommendedProfile, routing);
  const requiredActions = [];
  let decision = "allow";
  let reason = `Recommended ${recommendedProfile} profile based on ${signals.length} routing signal${signals.length === 1 ? "" : "s"}.`;
  let budget = null;

  if (!recommendedModel) {
    decision = "manual_review";
    requiredActions.push("configure-model-routing-profile");
    reason = `Recommended ${recommendedProfile} profile, but no model is configured for that profile.`;
  }

  if (routing.approvalProfiles.includes(recommendedProfile) || profile.approvalRequired) {
    decision = maxDecision(decision, "manual_review");
    requiredActions.push("owner-model-approval");
  }

  if (recommendedModel) {
    budget = maybeCreateBudget({
      modelRef: recommendedModel,
      inputTokens,
      outputTokens,
      budgets: options.budgets,
      models: options.models
    });

    if (budget) {
      decision = maxDecision(decision, budget.decision);
      if (budget.decision !== "allow") {
        requiredActions.push(...budget.requiredActions);
      }
    }
  }

  return {
    schemaVersion: modelRecommendationSchemaVersion,
    recommendedAt: new Date().toISOString(),
    decision,
    reason,
    recommendedProfile,
    recommendedModel,
    fallbackModels,
    task: {
      text: task,
      taskType,
      inferredTaskType,
      privacy,
      toolRisk,
      inputTokens,
      outputTokens,
      totalTokens
    },
    profileScores,
    signals,
    budget,
    requiredActions: [...new Set(requiredActions)]
  };
}

export function modelRecommendationExitCode(decision) {
  if (decision === "allow") {
    return 0;
  }

  if (decision === "block") {
    return 2;
  }

  return 1;
}

function mergeRouting(configRouting = {}) {
  const routing = {
    ...defaultRouting,
    ...configRouting,
    profiles: {
      ...defaultRouting.profiles,
      ...(configRouting.profiles ?? {})
    }
  };

  routing.approvalProfiles = Array.isArray(routing.approvalProfiles)
    ? routing.approvalProfiles.map((profile) => String(profile))
    : defaultRouting.approvalProfiles;
  routing.longContextTokens = normalizeNonNegativeInteger(
    routing.longContextTokens,
    "modelRouting.longContextTokens"
  );
  routing.premiumContextTokens = normalizeNonNegativeInteger(
    routing.premiumContextTokens,
    "modelRouting.premiumContextTokens"
  );

  return routing;
}

function collectSignals({ task, taskType, inferredTaskType, privacy, toolRisk, totalTokens, routing }) {
  const signals = [];

  signals.push({
    id: "default-profile",
    profile: routing.defaultProfile,
    weight: 1,
    reason: `Default routing profile is ${routing.defaultProfile}.`
  });

  if (privacy === "high") {
    signals.push({
      id: "high-privacy",
      profile: "local",
      weight: 8,
      reason: "High privacy favors a local model when available."
    });
  } else if (privacy === "medium") {
    signals.push({
      id: "medium-privacy",
      profile: "local",
      weight: 3,
      reason: "Medium privacy gives local models a small preference."
    });
  }

  if (toolRisk === "high") {
    signals.push({
      id: "high-tool-risk",
      profile: "strong",
      weight: 8,
      reason: "High tool risk needs stronger reasoning before actions are taken."
    });
  } else if (toolRisk === "medium") {
    signals.push({
      id: "medium-tool-risk",
      profile: "strong",
      weight: 4,
      reason: "Medium tool risk favors a stronger model."
    });
  }

  if (["chat", "classification", "summarization", "translation", "rewrite"].includes(inferredTaskType)) {
    signals.push({
      id: "simple-task",
      profile: "cheap",
      weight: 4,
      reason: `Task type ${inferredTaskType} is usually safe for a cheaper model.`
    });
  }

  if (["agent-control", "architecture", "coding", "security", "skill-install"].includes(inferredTaskType)) {
    signals.push({
      id: "strong-task",
      profile: "strong",
      weight: 6,
      reason: `Task type ${inferredTaskType} benefits from stronger reasoning.`
    });
  }

  if (["deep-research", "migration", "strategy"].includes(inferredTaskType)) {
    signals.push({
      id: "premium-task",
      profile: "premium",
      weight: 5,
      reason: `Task type ${inferredTaskType} may need a premium model.`
    });
  }

  if (totalTokens > routing.premiumContextTokens) {
    signals.push({
      id: "premium-context",
      profile: "premium",
      weight: 7,
      reason: `Estimated ${totalTokens} tokens exceeds premium context threshold ${routing.premiumContextTokens}.`
    });
  } else if (totalTokens > routing.longContextTokens) {
    signals.push({
      id: "long-context",
      profile: "strong",
      weight: 5,
      reason: `Estimated ${totalTokens} tokens exceeds long context threshold ${routing.longContextTokens}.`
    });
  }

  if (!task && taskType === "general") {
    signals.push({
      id: "missing-task-context",
      profile: "strong",
      weight: 2,
      reason: "No task text was supplied, so routing is conservative."
    });
  }

  return signals;
}

function scoreProfiles(routing, signals) {
  const scores = Object.fromEntries(Object.keys(routing.profiles).map((profile) => [profile, 0]));

  for (const signal of signals) {
    if (!(signal.profile in scores)) {
      scores[signal.profile] = 0;
    }
    scores[signal.profile] += signal.weight;
  }

  return scores;
}

function selectProfile(profileScores, defaultProfile) {
  const priority = ["premium", "strong", "local", "cheap"];

  return Object.entries(profileScores)
    .sort(([leftProfile, leftScore], [rightProfile, rightScore]) => {
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return priority.indexOf(leftProfile) - priority.indexOf(rightProfile);
    })
    .find(([, score]) => score > 0)?.[0] ?? defaultProfile;
}

function inferTaskType(task, explicitTaskType) {
  if (explicitTaskType !== "general") {
    return explicitTaskType;
  }

  const text = task.toLowerCase();

  if (includesAny(text, ["install", "skill", "clawhub", "openclaw", "hermes"])) {
    return "skill-install";
  }

  if (includesAny(text, ["security", "threat", "exploit", "audit", "permission", "credential", "secret"])) {
    return "security";
  }

  if (includesAny(text, ["code", "debug", "bug", "test", "refactor", "implement"])) {
    return "coding";
  }

  if (includesAny(text, ["architecture", "design system", "system design"])) {
    return "architecture";
  }

  if (includesAny(text, ["agent", "tool", "shell", "browser", "message"])) {
    return "agent-control";
  }

  if (includesAny(text, premiumTaskTerms)) {
    return "strategy";
  }

  if (includesAny(text, simpleTaskTerms)) {
    return "summarization";
  }

  if (includesAny(text, strongTaskTerms)) {
    return "security";
  }

  return "general";
}

function collectFallbackModels(recommendedProfile, routing) {
  const profile = routing.profiles[recommendedProfile] ?? {};
  const configuredFallbacks = Array.isArray(profile.fallbacks)
    ? profile.fallbacks.map(normalizeModelRef).filter(Boolean)
    : [];

  const profileFallbacks = ["premium", "strong", "cheap", "local"]
    .filter((candidate) => candidate !== recommendedProfile)
    .map((candidate) => normalizeModelRef(routing.profiles[candidate]?.model))
    .filter(Boolean);

  return [...new Set([...configuredFallbacks, ...profileFallbacks])];
}

function maybeCreateBudget({ modelRef, inputTokens, outputTokens, budgets, models }) {
  const parsed = parseModelRef(modelRef);

  if (!parsed) {
    return null;
  }

  const hasPricing = (models ?? []).some((candidate) => {
    return candidate.provider === parsed.provider && candidate.model === parsed.model;
  });

  if (!hasPricing) {
    return null;
  }

  return createBudgetCheck({
    provider: parsed.provider,
    model: parsed.model,
    inputTokens,
    outputTokens,
    budgets,
    models
  });
}

function parseModelRef(modelRef) {
  const [provider, ...modelParts] = String(modelRef).split("/");
  const model = modelParts.join("/");

  if (!provider || !model) {
    return null;
  }

  return { provider, model };
}

function maxDecision(left, right) {
  const order = {
    allow: 0,
    warn: 1,
    manual_review: 2,
    sandbox_required: 3,
    dual_approval: 4,
    block: 5
  };

  return order[right] > order[left] ? right : left;
}

function normalizeLevel(value, allowed, fallback, name) {
  const normalized = normalizeText(value, fallback);

  if (!allowed.includes(normalized)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}.`);
  }

  return normalized;
}

function normalizeText(value, fallback) {
  return String(value ?? fallback).trim().toLowerCase();
}

function normalizeModelRef(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeNonNegativeInteger(value, name) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return number;
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}
