export const defaultAsflcConfig = {
  bufferDelta: 0.15,
  epsilon: 0.01,
  maxBranches: 5,
  maxIterations: 3,
  confidenceFloor: 0.25,
  uncertaintyReviewThreshold: 3.5
};

export const asflcRoutes = {
  LOCAL: "LOCAL",
  VERIFY_FIRST: "VERIFY_FIRST",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  ESCALATE: "ESCALATE",
  BLOCK: "BLOCK"
};

const routeRank = {
  [asflcRoutes.LOCAL]: 0,
  [asflcRoutes.VERIFY_FIRST]: 1,
  [asflcRoutes.APPROVAL_REQUIRED]: 2,
  [asflcRoutes.ESCALATE]: 3,
  [asflcRoutes.BLOCK]: 4
};

const approvalFlags = new Set([
  "customer-facing",
  "external-publish",
  "paid-spend",
  "customer-data",
  "pricing",
  "revenue-impact",
  "reputation-risk",
  "business-rule",
  "memory-write"
]);

const escalationFlags = new Set([
  "legal",
  "compliance",
  "medical",
  "tax",
  "employment",
  "owner-decision"
]);

const blockFlags = new Set([
  "deceptive",
  "illegal",
  "fake-review",
  "credential-exposure",
  "privacy-violation",
  "unsafe-health-claim",
  "bypass-approval"
]);

export function evaluateAsflcDecision(input, config = {}) {
  const mergedConfig = { ...defaultAsflcConfig, ...config };
  const chains = Array.isArray(input?.chains) ? input.chains.slice(0, mergedConfig.maxBranches) : [];

  if (chains.length === 0) {
    throw new Error("A-S-FLC decision requires at least one chain.");
  }

  const scoredChains = rankAsflcChains(chains, mergedConfig);
  const best = scoredChains[0];
  const routeDecision = routeAsflcDecision(best, {
    ...input,
    config: mergedConfig
  });

  return {
    schemaVersion: "clawguard.asflcDecision.v1",
    task: String(input?.task ?? best.title ?? best.id ?? "decision"),
    chosenAction: best.action ?? best.title ?? best.id,
    route: routeDecision.route,
    routeReason: routeDecision.reason,
    verificationNeeded: routeDecision.route === asflcRoutes.VERIFY_FIRST || routeDecision.verificationNeeded,
    approvalRequired: routeDecision.route === asflcRoutes.APPROVAL_REQUIRED,
    riskFlags: routeDecision.riskFlags,
    confidence: best.confidence,
    breakdown: best.breakdown,
    chains: scoredChains,
    config: {
      bufferDelta: mergedConfig.bufferDelta,
      maxBranches: mergedConfig.maxBranches,
      maxIterations: mergedConfig.maxIterations,
      epsilon: mergedConfig.epsilon
    }
  };
}

export function rankAsflcChains(chains, config = {}) {
  const mergedConfig = { ...defaultAsflcConfig, ...config };
  return chains
    .map((chain, index) => scoreAsflcChain(chain, mergedConfig, index))
    .sort((a, b) => {
      const netDelta = b.breakdown.net - a.breakdown.net;
      if (Math.abs(netDelta) > mergedConfig.epsilon) {
        return netDelta;
      }

      return routeRank[a.routeHint] - routeRank[b.routeHint];
    });
}

export function scoreAsflcChain(chain, config = {}, index = 0) {
  const mergedConfig = { ...defaultAsflcConfig, ...config };
  const events = Array.isArray(chain?.events) ? chain.events : [];
  const eventBreakdowns = events.map((event) => scoreEvent(event));
  const positiveExact = sum(eventBreakdowns.map((event) => event.positives));
  const negativeEstimates = eventBreakdowns.flatMap((event) => (event.negativeScores.length > 0 ? event.negativeScores : [event.negatives]));
  const negativeEstimated = sum(negativeEstimates);
  const uncertaintyFactor = variance(negativeEstimates) + 1;
  const negativeBuffered = negativeEstimated + mergedConfig.bufferDelta * uncertaintyFactor;
  const net = positiveExact - negativeBuffered;
  const confidence = computeConfidence({ positiveExact, negativeBuffered, uncertaintyFactor }, mergedConfig);
  const riskFlags = uniqueStrings([
    ...(chain?.riskFlags ?? []),
    ...events.flatMap((event) => event.riskFlags ?? [])
  ]);

  return {
    id: String(chain?.id ?? `chain-${index + 1}`),
    title: chain?.title,
    action: chain?.action,
    routeHint: normalizeRoute(chain?.route ?? chain?.routeHint),
    risk: normalizeRisk(chain?.risk),
    blocked: Boolean(chain?.blocked) || events.some((event) => event.blocked === true),
    approvalRequired: Boolean(chain?.approvalRequired) || events.some((event) => event.approvalRequired === true),
    requiresExpert: Boolean(chain?.requiresExpert) || events.some((event) => event.requiresExpert === true),
    verificationNeeded: Boolean(chain?.verificationNeeded) || events.some((event) => event.verificationNeeded === true),
    riskFlags,
    confidence,
    breakdown: {
      positiveExact: roundScore(positiveExact),
      negativeEstimated: roundScore(negativeEstimated),
      uncertaintyFactor: roundScore(uncertaintyFactor),
      negativeBuffered: roundScore(negativeBuffered),
      net: roundScore(net)
    },
    events: eventBreakdowns
  };
}

export function routeAsflcDecision(chain, options = {}) {
  const config = options.config ?? defaultAsflcConfig;
  const riskFlags = uniqueStrings([...(options.riskFlags ?? []), ...(chain.riskFlags ?? [])]);
  const flagSet = new Set(riskFlags);
  const hasFlag = (flags) => flags.some((flag) => flagSet.has(flag));
  const explicitRoute = normalizeRoute(options.route ?? options.routeHint ?? chain.routeHint);
  const net = Number(chain.breakdown?.net ?? 0);

  if (explicitRoute === asflcRoutes.BLOCK || chain.blocked || chain.risk === "critical" || hasFlag([...blockFlags])) {
    return {
      route: asflcRoutes.BLOCK,
      reason: "Action is blocked by explicit policy, critical risk, or asymmetric downside.",
      riskFlags,
      verificationNeeded: false
    };
  }

  if (net < 0) {
    return {
      route: asflcRoutes.BLOCK,
      reason: "Buffered downside exceeds exact positive value.",
      riskFlags,
      verificationNeeded: false
    };
  }

  if (explicitRoute === asflcRoutes.ESCALATE || chain.requiresExpert || hasFlag([...escalationFlags])) {
    return {
      route: asflcRoutes.ESCALATE,
      reason: "Decision needs owner, legal, compliance, or specialist authority.",
      riskFlags,
      verificationNeeded: true
    };
  }

  if (
    explicitRoute === asflcRoutes.APPROVAL_REQUIRED ||
    chain.approvalRequired ||
    chain.risk === "high" ||
    hasFlag([...approvalFlags])
  ) {
    return {
      route: asflcRoutes.APPROVAL_REQUIRED,
      reason: "Action can affect customers, money, reputation, policy, or external state.",
      riskFlags,
      verificationNeeded: false
    };
  }

  if (
    explicitRoute === asflcRoutes.VERIFY_FIRST ||
    chain.verificationNeeded ||
    chain.confidence < config.confidenceFloor ||
    chain.breakdown.uncertaintyFactor >= config.uncertaintyReviewThreshold
  ) {
    return {
      route: asflcRoutes.VERIFY_FIRST,
      reason: "Decision has enough uncertainty to verify before action.",
      riskFlags,
      verificationNeeded: true
    };
  }

  return {
    route: asflcRoutes.LOCAL,
    reason: "Low-risk local action with positive buffered net value.",
    riskFlags,
    verificationNeeded: false
  };
}

function scoreEvent(event) {
  const negativeScores = scoresFor(event?.negatives ?? event?.negative ?? event?.downsides);
  return {
    id: event?.id,
    title: event?.title,
    positives: roundScore(sumScores(event?.positives ?? event?.positive ?? event?.benefits)),
    negatives: roundScore(sum(negativeScores)),
    negativeScores,
    riskFlags: uniqueStrings(event?.riskFlags ?? []),
    blocked: Boolean(event?.blocked),
    approvalRequired: Boolean(event?.approvalRequired),
    requiresExpert: Boolean(event?.requiresExpert),
    verificationNeeded: Boolean(event?.verificationNeeded)
  };
}

function sumScores(value) {
  return sum(scoresFor(value));
}

function scoresFor(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => roundScore(scoreValue(item))).filter((item) => Number.isFinite(item));
}

function scoreValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    const score = numberOrZero(value.score ?? value.value ?? value.estimate);
    const weight = numberOrDefault(value.weight, 1);
    return score * weight;
  }

  return 0;
}

function computeConfidence(scores, config) {
  const denominator = Math.max(scores.positiveExact + scores.negativeBuffered, 1);
  const margin = Math.abs(scores.positiveExact - scores.negativeBuffered) / denominator;
  const uncertaintyPenalty = Math.min(0.5, (scores.uncertaintyFactor - 1) * config.bufferDelta);
  return roundScore(Math.max(0, Math.min(1, margin - uncertaintyPenalty)));
}

function variance(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length < 2) {
    return 0;
  }

  const mean = sum(clean) / clean.length;
  return sum(clean.map((value) => (value - mean) ** 2)) / clean.length;
}

function sum(values) {
  return values.reduce((total, value) => total + numberOrZero(value), 0);
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrDefault(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function roundScore(value) {
  return Math.round(numberOrZero(value) * 1000) / 1000;
}

function normalizeRoute(value) {
  const route = String(value ?? asflcRoutes.LOCAL).trim().toUpperCase();
  return Object.values(asflcRoutes).includes(route) ? route : asflcRoutes.LOCAL;
}

function normalizeRisk(value) {
  const risk = String(value ?? "low").trim().toLowerCase();
  return ["low", "medium", "high", "critical"].includes(risk) ? risk : "low";
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}
