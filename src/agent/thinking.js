import { promises as fs } from "node:fs";
import path from "node:path";
import { appendAuditEvent } from "./audit.js";
import { validateAgentPlan } from "./planner.js";
import { listRolePacks, showRolePackCommand } from "./role-intelligence.js";

const readOnlyThinkingTools = new Set([
  "file.list",
  "file.read",
  "file.diff",
  "git.status",
  "git.diff",
  "git.log",
  "memory.search",
  "web.search",
  "web.fetch",
  "github.repo_read",
  "github.issue_draft",
  "shell.dry_run"
]);

const riskyExecutionTools = new Set([
  "file.write_safe",
  "project.cleanup_safe",
  "shell.execute_approved",
  "skill.install_guarded",
  "memory.propose",
  "github.issue_create_approved",
  "browser.open",
  "browser.extract",
  "browser.click_proposed",
  "browser.type_proposed",
  "app.open_proposed",
  "app.action_proposed",
  "subagent.delegate"
]);

export function shouldUseDeepThinking(task, context = {}, options = {}) {
  const config = context.agent?.thinking ?? {};
  if (options.think === false) {
    return {
      enabled: false,
      triggered: false,
      triggeredBy: "disabled-by-flag",
      reasons: ["--no-think was provided."]
    };
  }

  if (options.think === true) {
    return {
      enabled: true,
      triggered: true,
      triggeredBy: "flag",
      reasons: ["--think was provided."]
    };
  }

  if (options.plan || options.planPath || options.recipeName) {
    return {
      enabled: false,
      triggered: false,
      triggeredBy: "explicit-plan",
      reasons: ["Explicit plans and recipes preserve their current behavior unless --think is provided."]
    };
  }

  if (config.enabled === false) {
    return {
      enabled: false,
      triggered: false,
      triggeredBy: "disabled-by-config",
      reasons: ["agent.thinking.enabled is false."]
    };
  }

  if (config.auto === false) {
    return {
      enabled: false,
      triggered: false,
      triggeredBy: "auto-disabled",
      reasons: ["agent.thinking.auto is false."]
    };
  }

  const reasons = deepThinkingReasons(task, context);
  return {
    enabled: reasons.length > 0,
    triggered: reasons.length > 0,
    triggeredBy: reasons.length > 0 ? "auto" : "not-needed",
    reasons
  };
}

export async function runDeepThinking(task, context, options = {}) {
  const trigger = options.trigger ?? shouldUseDeepThinking(task, context, options);
  const maxIterations = Math.max(1, Math.min(Number(options.thinkingIterations ?? context.agent?.thinking?.maxIterations ?? 2) || 2, 5));
  const startedAudit = await appendAuditEvent(context.paths.auditPath, "thinking.started", {
    sessionId: context.sessionId,
    task,
    triggeredBy: trigger.triggeredBy,
    reasons: trigger.reasons,
    maxIterations
  });
  const roleContext = await matchRoleContext(task);
  const contextSummary = createThinkingContextSummary(task, context, roleContext, trigger);
  const contextAudit = await appendAuditEvent(context.paths.auditPath, "thinking.context", {
    sessionId: context.sessionId,
    roleMatch: roleContext?.pack?.id ?? null,
    memoryMatches: context.recall?.memory?.length ?? 0,
    sessionMatches: context.recall?.sessions?.length ?? 0
  });

  let currentPlan = validateAgentPlan(context.initialPlan, context.tools);
  const initialPlan = structuredClone(currentPlan);
  const critiques = [];
  const revisedPlans = [];
  const iterations = [];

  for (let index = 0; index < maxIterations; index += 1) {
    const critique = createDeterministicCritique(task, currentPlan, {
      ...context,
      roleContext
    });
    const critiqueAudit = await appendAuditEvent(context.paths.auditPath, "thinking.critique", {
      sessionId: context.sessionId,
      iteration: index + 1,
      findingCount: critique.findings.length,
      severity: critique.severity
    });
    critiques.push({
      ...critique,
      auditId: critiqueAudit.id
    });

    if (!critique.requiresRevision) {
      iterations.push({
        index: index + 1,
        revised: false,
        reason: "Current plan satisfies deterministic thinking checks."
      });
      break;
    }

    const revised = revisePlanForCritique(task, currentPlan, critique, {
      ...context,
      roleContext
    });
    const validated = validateAgentPlan(revised, context.tools);
    revisedPlans.push(validated);
    iterations.push({
      index: index + 1,
      revised: true,
      reason: critique.summary
    });

    if (plansEqual(validated, currentPlan)) {
      currentPlan = validated;
      break;
    }
    currentPlan = validated;
  }

  const safetyFindings = createSafetyFindings(task, currentPlan, roleContext);
  const completedAudit = await appendAuditEvent(context.paths.auditPath, "thinking.completed", {
    sessionId: context.sessionId,
    finalStepCount: currentPlan.steps.length,
    safetyFindingCount: safetyFindings.length,
    roleMatch: roleContext?.pack?.id ?? null
  });
  const createdAt = new Date().toISOString();
  const artifact = {
    schemaVersion: "clawguard.agentThinking.v1",
    sessionId: context.sessionId,
    task: String(task ?? ""),
    triggeredBy: trigger.triggeredBy,
    triggerReasons: trigger.reasons,
    iterations,
    contextSummary,
    initialPlan,
    critiques,
    revisedPlans,
    finalPlan: currentPlan,
    safetyFindings,
    roleContext: roleContext ? summarizeRoleContext(roleContext) : null,
    provider: {
      mode: context.agent?.thinking?.providerMode ?? "auto",
      plannerProvider: context.agent?.provider ?? "mock",
      model: context.agent?.model ?? null,
      critiqueProvider: "deterministic"
    },
    auditIds: {
      started: startedAudit.id,
      context: contextAudit.id,
      completed: completedAudit.id
    },
    createdAt
  };
  const artifactPath = path.join(context.paths.thinkingDir, `${createdAt.replace(/[:.]/g, "-")}-${context.sessionId}.json`);
  await fs.mkdir(context.paths.thinkingDir, { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

  return {
    artifact,
    artifactPath,
    finalPlan: currentPlan,
    summary: summarizeThinkingArtifact(artifact, artifactPath)
  };
}

export async function readThinkingArtifact(paths, sessionId) {
  const requested = String(sessionId ?? "").trim();
  if (!requested) {
    throw new Error("agent thinking show requires a session id.");
  }

  const files = await fs.readdir(paths.thinkingDir).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const candidates = files
    .filter((file) => file.endsWith(".json"))
    .filter((file) => requested === "latest" || file.includes(requested))
    .sort()
    .reverse();

  if (candidates.length === 0) {
    throw new Error(`No thinking artifact found for session: ${requested}`);
  }

  const artifactPath = path.join(paths.thinkingDir, candidates[0]);
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
  return {
    schemaVersion: "clawguard.agentThinkingShow.v1",
    path: artifactPath,
    artifact
  };
}

export function createDeterministicCritique(task, plan, context = {}) {
  const findings = [];
  const lowerTask = String(task ?? "").toLowerCase();
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const tools = steps.map((step) => step.tool);
  const roleTask = isRoleLikeTask(lowerTask);
  const complexTask = isComplexThinkingTask(lowerTask);

  if ((roleTask || complexTask) && isShallowInspectionPlan(steps)) {
    findings.push(finding("shallow-plan", "medium", "Plan only inspects files; professional tasks need memory, context, and explicit boundaries."));
  }

  if (roleTask && !context.roleContext) {
    findings.push(finding("missing-role-context", "medium", "Role-like task has no matching role pack; surface missing authority and cadence facts before risky action."));
  }

  if (context.roleContext && !tools.includes("memory.search")) {
    findings.push(finding("missing-role-memory-search", "low", "Role-like task should search governed memory before producing role work."));
  }

  if (steps.some((step) => riskyExecutionTools.has(step.tool))) {
    findings.push(finding("risky-tool-boundary", "high", "Plan includes a risky tool; final execution may proceed only through existing approval and protected-asset policy."));
  }

  if (steps.length > 0 && !readOnlyThinkingTools.has(steps[0].tool)) {
    findings.push(finding("missing-read-first", "medium", "Plan should inspect or recall context before attempting action."));
  }

  if (mentionsProtectedAsset(lowerTask) || steps.some((step) => mentionsProtectedAsset(JSON.stringify(step.args ?? {})))) {
    findings.push(finding("protected-asset-context", "critical", "Task or plan mentions protected assets; tool-layer protected asset approval must remain authoritative."));
  }

  const severity = strongestSeverity(findings);
  return {
    schemaVersion: "clawguard.agentThinkingCritique.v1",
    summary: findings.length > 0 ? "Plan needs governed thinking revisions before execution." : "Plan satisfies deterministic thinking checks.",
    severity,
    requiresRevision: findings.some((item) => ["low", "medium", "high"].includes(item.severity)),
    findings
  };
}

function revisePlanForCritique(task, plan, critique, context = {}) {
  const lowerTask = String(task ?? "").toLowerCase();
  const roleTask = isRoleLikeTask(lowerTask);
  const complexTask = isComplexThinkingTask(lowerTask);
  const steps = [];

  if (roleTask || complexTask) {
    steps.push(step("think-search-memory", "memory.search", { query: task, limit: roleTask ? 8 : 5 }, "Search governed memory before professional planning.", "low"));
  }

  steps.push(step("think-list-files", "file.list", { path: ".", maxDepth: 2, maxEntries: 120 }, "Inspect local workspace context before action.", "low"));
  steps.push(step("think-read-readme", "file.read", { path: "README.md", optional: true, maxBytes: 24000 }, "Read available project or business overview.", "low"));

  if (!roleTask && (complexTask || context.route?.path === "thinking")) {
    steps.push(step("think-git-status", "git.status", {}, "Inspect project state when available without shell execution.", "low"));
  }

  for (const original of plan.steps ?? []) {
    if (steps.some((candidate) => candidate.tool === original.tool && JSON.stringify(candidate.args) === JSON.stringify(original.args ?? {}))) {
      continue;
    }
    steps.push(original);
  }

  return {
    task: plan.task ?? String(task ?? ""),
    steps: dedupeSteps(steps).slice(0, 20)
  };
}

function createThinkingContextSummary(task, context, roleContext, trigger) {
  return {
    task: String(task ?? ""),
    route: context.route?.path ?? "unknown",
    trigger,
    recall: {
      memoryMatches: context.recall?.memory?.length ?? 0,
      sessionMatches: context.recall?.sessions?.length ?? 0,
      summary: context.recall?.summary ?? null
    },
    skills: (context.skills ?? []).map((skill) => ({
      name: skill.name,
      description: skill.description,
      risk: skill.risk
    })).slice(0, 20),
    role: roleContext ? {
      id: roleContext.pack.id,
      title: roleContext.pack.title,
      validationQuestions: roleContext.validationQuestions
    } : null
  };
}

function createSafetyFindings(task, plan, roleContext) {
  const findings = [];
  const critique = createDeterministicCritique(task, plan, { roleContext });
  findings.push(...critique.findings.filter((item) => ["high", "critical"].includes(item.severity)));

  if (roleContext) {
    for (const action of roleContext.actions ?? []) {
      if (["APPROVAL_REQUIRED", "ESCALATE", "BLOCK"].includes(action.route)) {
        findings.push(finding(`role-${action.route.toLowerCase()}-${action.id}`, action.route === "BLOCK" ? "critical" : "high", `${action.title}: ${action.route}`));
      }
    }
  }

  return dedupeFindings(findings);
}

function summarizeThinkingArtifact(artifact, artifactPath) {
  return {
    enabled: true,
    triggeredBy: artifact.triggeredBy,
    reasons: artifact.triggerReasons,
    iterations: artifact.iterations.length,
    findingCount: artifact.critiques.reduce((total, critique) => total + critique.findings.length, 0),
    safetyFindingCount: artifact.safetyFindings.length,
    roleMatch: artifact.roleContext?.pack?.id ?? null,
    artifactPath
  };
}

async function matchRoleContext(task) {
  const lowerTask = String(task ?? "").toLowerCase();
  if (!isRoleLikeTask(lowerTask)) {
    return null;
  }

  const packs = await listRolePacks();
  const matched = packs.find((pack) => rolePackMatches(lowerTask, pack));
  if (!matched) {
    return null;
  }

  return showRolePackCommand({ roleId: matched.id });
}

function rolePackMatches(lowerTask, pack) {
  const idTokens = String(pack.id ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const roleText = String(pack.role ?? "").toLowerCase().replace(/-/g, " ");
  const titleText = String(pack.title ?? "").toLowerCase();
  const industry = String(pack.industry ?? "").toLowerCase();
  const score = [
    industry && lowerTask.includes(industry),
    roleText && lowerTask.includes(roleText),
    titleText && lowerTask.includes(titleText),
    idTokens.filter((token) => token.length > 2 && lowerTask.includes(token)).length >= 2
  ].filter(Boolean).length;
  return score >= 2;
}

function summarizeRoleContext(roleContext) {
  return {
    pack: roleContext.pack,
    artifacts: roleContext.artifacts,
    actions: roleContext.actions.map((action) => ({
      id: action.id,
      title: action.title,
      route: action.route,
      approvalRequired: action.approvalRequired,
      verificationNeeded: action.verificationNeeded,
      riskFlags: action.riskFlags
    })),
    validationQuestions: roleContext.validationQuestions
  };
}

function deepThinkingReasons(task, context = {}) {
  const lower = String(task ?? "").toLowerCase();
  const reasons = [];
  if (isRoleLikeTask(lower)) reasons.push("Task appears to involve a professional role, business, job, or operating cadence.");
  if (isComplexThinkingTask(lower)) reasons.push("Task asks for analysis, strategy, review, investigation, planning, or architecture.");
  if (String(task ?? "").length > 700) reasons.push("Task is long enough to benefit from explicit critique and revision.");
  if (context.route?.needsThinking || context.route?.path === "thinking") reasons.push("Runtime router marked the task as thinking-heavy.");
  return reasons;
}

function isRoleLikeTask(lowerTask) {
  return /\b(role|job|career|business|company|manager|operator|owner|assistant|responsibilit(?:y|ies)|routine|daily|weekly|monthly|cadence|marketing|sales|customer|cafe|restaurant|shop|store|bank|government)\b/i.test(lowerTask);
}

function isComplexThinkingTask(lowerTask) {
  return /\b(plan|strategy|strategic|analy[sz]e|compare|review|roadmap|debug|investigate|architecture|refactor|release plan|professional|workflow|objective|target|kpi)\b/i.test(lowerTask);
}

function isShallowInspectionPlan(steps) {
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > 3) {
    return false;
  }
  return steps.every((step) => ["file.list", "file.read"].includes(step.tool));
}

function mentionsProtectedAsset(value) {
  return /\b(\.env|secret|credential|token|database|customer data|prod(?:uction)?\s+db|prod\.sqlite|\.sqlite|\.sql|\.dump|backup|backups|drop database|truncate|delete from)\b/i.test(String(value ?? ""));
}

function step(id, tool, args, reason, risk) {
  return { id, tool, args, reason, risk };
}

function finding(id, severity, message) {
  return { id, severity, message };
}

function strongestSeverity(findings) {
  const order = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return findings.reduce((best, item) => order[item.severity] > order[best] ? item.severity : best, "none");
}

function dedupeSteps(steps) {
  const seen = new Set();
  const output = [];
  for (const item of steps) {
    const key = item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function dedupeFindings(findings) {
  const seen = new Set();
  const output = [];
  for (const item of findings) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function plansEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
