import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { appendAuditEvent, readAuditEvents, verifyAuditChain } from "./audit.js";
import { buildToolResultAuditEvent } from "./tool-observation-audit.js";
import { createInjectionCriticRunState } from "./injection-critic.js";
import {
  canOverrideToolAutonomy,
  listAutonomyToolPolicies,
  normalizeAutonomyMode,
  normalizeAutonomyPreset,
  normalizeToolAutonomyConfig,
  resolveToolAutonomy
} from "./autonomy.js";
import {
  appendAgentApprovalRequest,
  appendAgentApprovalDecision,
  createAgentApprovalRequest,
  createAgentApprovalDecision,
  readApprovalRequests,
  readLatestDecision
} from "./approvals.js";
import {
  bootstrapAgentMemory,
  consolidateAgentMemory,
  createRecallSnapshot,
  exportAgentMemory,
  proposeAgentMemory,
  proposeTaskOutcomeMemory,
  readAgentMemory,
  refreshMemoryMirrors,
  removeAgentMemory,
  replaceAgentMemory,
  reviewAgentMemory,
  searchAgentMemory,
  searchAgentSessions,
  writeAgentMemory
} from "./memory.js";
import { ensureAgentState, resolveAgentPaths, resolveWorkspacePath } from "./paths.js";
import { validateAgentPlan } from "./planner.js";
import {
  defaultProtectedAssetPatterns,
  inspectProtectedPath,
  inspectProtectedShellArgv,
  normalizeProtectedAsset,
  normalizeProtectedAssetsConfig
} from "./protected-assets.js";
import { createPlanWithProvider } from "./providers.js";
import { createRecipePlan } from "./recipes.js";
import { routeAgentTask } from "./router.js";
import {
  createAgentSkillTemplate,
  installAgentSkill,
  listAgentSkills,
  loadTrustedAgentSkills,
  removeTrustedAgentSkill,
  showAgentSkill,
  trustWorkspaceAgentSkill,
  validateAgentSkillDirectory
} from "./skills.js";
import { createSubagentPlan, createTeamAssignments, getSubagentProfile, listSubagentProfiles, summarizeSubagentRun } from "./subagents.js";
import { readThinkingArtifact, runDeepThinking, shouldUseDeepThinking } from "./thinking.js";
import { defaultAgentTools, executeAgentTool, listAgentTools } from "./tools.js";
import { defaultConfig, loadConfig, normalizeConfig } from "../config.js";

export async function initAgent(options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const configPath = path.resolve(workspace, options.configPath ?? ".clawguard.json");
  const existing = await readJsonIfPresent(configPath);
  const baseConfig = existing ?? defaultConfig;
  const nextAgent = {
    ...defaultConfig.agent,
    ...(baseConfig.agent ?? {}),
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.model ? { model: options.model } : {}),
    ...(options.safetyProfile ? { safetyProfile: options.safetyProfile } : {})
  };
  const nextConfig = normalizeConfig({
    ...baseConfig,
    agent: nextAgent
  }, configPath);
  const paths = resolveAgentPaths(workspace, nextConfig.agent, { configPath });

  await fs.mkdir(workspace, { recursive: true });
  await ensureAgentState(paths);
  await refreshMemoryMirrors(paths, {
    scope: nextConfig.agent.memoryScope,
    limit: nextConfig.agent.memoryMirrorLimit
  });

  let written = false;
  let skipped = false;
  if (!existing || options.force || !existing.agent) {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
    written = true;
  } else {
    skipped = true;
  }

  return {
    schemaVersion: "clawguard.agentInit.v1",
    ok: true,
    workspace,
    configPath,
    written,
    skipped,
    agent: summarizeAgentConfig(nextConfig.agent),
    paths: publicPaths(paths),
    nextCommands: [
      "clawguard agent run \"inspect this project and propose safe cleanup\"",
      "clawguard agent tools list",
      "clawguard agent audit show"
    ]
  };
}

export async function runAgentTask(task, options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const loadedConfig = await loadConfig(workspace, options.configPath);
  const config = loadedConfig.config;
  const paths = resolveAgentPaths(workspace, config.agent, {
    configPath: loadedConfig.path ?? path.join(workspace, ".clawguard.json"),
    approvalPath: options.approvalPath,
    decisionsPath: options.decisionsPath
  });
  await ensureAgentState(paths);

  const sessionId = randomUUID();
  const context = {
    sessionId,
    task,
    config,
    policy: config.policy,
    agent: {
      ...config.agent,
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.model ? { model: options.model } : {}),
      injectionCritic: {
        ...config.agent.injectionCritic,
        ...(options.injectionCritic ? { enabled: true } : {})
      }
    },
    paths,
    approvalId: options.approvalId,
    injectionCriticRun: createInjectionCriticRunState()
  };
  const tools = listAgentTools();
  if (options.team) {
    return runAgentTeamTask(task, {
      ...context,
      tools
    }, {
      ...options,
      configPath: loadedConfig.path,
      workspace
    });
  }
  const memory = await readAgentMemory(paths.memoryPath, { limit: context.agent.memoryReadLimit });
  const recall = await createRecallSnapshot(task, context);
  const auditRecall = await appendAuditEvent(paths.auditPath, "recall.created", {
    task,
    memoryMatches: recall.memory.length,
    sessionMatches: recall.sessions.length,
    recallPath: recall.path
  });
  const skills = await loadTrustedAgentSkills(context);
  const route = routeAgentTask(task, {
    agent: context.agent,
    skills,
    memory: recall.memory.length > 0 ? recall.memory : memory,
    tools
  });
  const planContext = {
    ...context,
    tools,
    memory: recall.memory.length > 0 ? recall.memory : memory,
    skills,
    route,
    recall
  };
  const initialPlan = await createOrLoadPlan(task, planContext, options);
  const thinkingTrigger = shouldUseDeepThinking(task, planContext, options);
  let thinkingRun = null;
  const plan = thinkingTrigger.triggered
    ? (thinkingRun = await runDeepThinking(task, {
      ...planContext,
      initialPlan
    }, {
      ...options,
      trigger: thinkingTrigger
    })).finalPlan
    : initialPlan;
  const auditPlan = await appendAuditEvent(paths.auditPath, "plan.created", {
    route,
    task: plan.task,
    steps: plan.steps.map((step) => ({
      id: step.id,
      tool: step.tool,
      risk: step.risk,
      reason: step.reason
    }))
  });
  const results = [];
  let status = "completed";

  for (const step of plan.steps) {
    let result;
    try {
      if (step.tool === "subagent.delegate") {
        result = await executeSubagentDelegateStep(step, context, {
          fallbackTask: task,
          parentSessionId: sessionId
        });
      } else {
        result = await executeAgentTool(step, context);
      }
    } catch (error) {
      result = {
        ok: false,
        status: "error",
        output: null,
        error: error.message,
        artifacts: []
      };
    }

    const auditResult = await appendAuditEvent(paths.auditPath, "tool.result", buildToolResultAuditEvent({
      result,
      step,
      agent: context.agent
    }));
    const stepResult = {
      step,
      result: {
        ...result,
        auditId: auditResult.id
      }
    };
    results.push(stepResult);

    if (!result.ok) {
      status = result.status ?? "blocked";
      break;
    }
  }

  const sessionPath = path.join(paths.sessionsDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${sessionId}.json`);
  const run = {
    schemaVersion: "clawguard.agentRun.v1",
    sessionId,
    status,
    task: plan.task,
    configPath: loadedConfig.path,
    workspace,
    route,
    thinking: thinkingRun?.summary ?? {
      enabled: false,
      triggeredBy: thinkingTrigger.triggeredBy,
      reasons: thinkingTrigger.reasons
    },
    recall: {
      ...recall,
      auditId: auditRecall.id
    },
    plan,
    planAuditId: auditPlan.id,
    steps: results,
    paths: publicPaths(paths),
    sessionPath,
    createdAt: new Date().toISOString()
  };

  if (context.agent.autoProposeTaskOutcomeMemory) {
    const outcome = proposeTaskOutcomeMemory(run);
    if (outcome) {
      const proposal = await proposeAgentMemory(outcome, context);
      run.memoryProposals = [proposal];
    }
  }

  await fs.writeFile(sessionPath, `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

export async function runAgentChat(options = {}) {
  const prompt = options.prompt ?? await readChatPrompt();
  if (!prompt.trim()) {
    throw new Error("agent chat requires a prompt on stdin or an interactive terminal.");
  }
  return runAgentTask(prompt.trim(), options);
}

export async function listAgentMemory(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const records = await readAgentMemory(context.paths.memoryPath, {
    limit: options.limit,
    scope: options.scope
  });

  return {
    schemaVersion: "clawguard.agentMemoryList.v1",
    memoryPath: context.paths.memoryPath,
    records
  };
}

export async function addAgentMemory(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const result = await writeAgentMemory(options, {
    ...context,
    approvalId: options.approvalId
  });
  const audit = await appendAuditEvent(context.paths.auditPath, "memory.write", {
    ok: result.ok,
    status: result.status ?? (result.ok ? "completed" : "blocked"),
    type: options.type,
    sensitive: Boolean(options.sensitive),
    approvalRequest: result.approvalRequest ?? null
  });

  return {
    schemaVersion: "clawguard.agentMemoryWrite.v1",
    ...result,
    auditId: audit.id
  };
}

export async function reviewAgentMemoryCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  return reviewAgentMemory(context, {
    limit: options.limit,
    memoryLimit: options.memoryLimit
  });
}

export async function decideAgentMemoryCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const approvals = await readApprovalRequests(context.paths.approvalPath);
  const approval = approvals.find((item) => item.id === options.approvalId);

  if (!approval) {
    throw new Error(`No approval found for id ${options.approvalId}.`);
  }

  const tool = String(approval.agentAction?.tool ?? approval.tool ?? "");
  if (!tool.startsWith("memory.")) {
    throw new Error(`Approval ${options.approvalId} is for ${tool || "unknown"}, not a memory action.`);
  }

  const decision = createAgentApprovalDecision(approval, {
    decision: options.decision,
    actor: options.actor,
    reason: options.reason,
    approvalPath: context.paths.approvalPath
  });
  const decisionRef = await appendAgentApprovalDecision(context.paths.decisionsPath, decision);
  let writeResult = null;

  if (decision.decision === "approve") {
    const record = approval.agentAction?.artifacts?.find((artifact) => artifact.type === "memory-record")?.record;
    if (record) {
      writeResult = await writeAgentMemory(record, {
        ...context,
        approvalId: options.approvalId
      });
    }
  }

  const audit = await appendAuditEvent(context.paths.auditPath, "memory.approval_decision", {
    approvalId: options.approvalId,
    decision: decision.decision,
    writeStatus: writeResult?.status ?? null
  });

  return {
    schemaVersion: "clawguard.agentMemoryDecision.v1",
    approval: {
      id: approval.id,
      tool,
      createdAt: approval.createdAt,
      risk: approval.risk
    },
    decision: {
      ...decisionRef,
      decidedAt: decision.decidedAt,
      reason: decision.reason
    },
    writeResult,
    auditId: audit.id
  };
}

export async function removeAgentMemoryCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const result = await removeAgentMemory(options.memoryId, context, {
    reason: options.reason
  });
  const audit = await appendAuditEvent(context.paths.auditPath, "memory.remove", {
    memoryId: options.memoryId,
    tombstoneId: result.event.id,
    reason: result.event.reason
  });

  return {
    schemaVersion: "clawguard.agentMemoryRemove.v1",
    ...result,
    auditId: audit.id
  };
}

export async function replaceAgentMemoryCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const result = await replaceAgentMemory(options.memoryId, options, context);
  const audit = await appendAuditEvent(context.paths.auditPath, "memory.replace", {
    memoryId: options.memoryId,
    ok: result.ok,
    status: result.status,
    replacementId: result.output?.replacement?.id ?? null
  });

  return {
    schemaVersion: "clawguard.agentMemoryReplace.v1",
    ...result,
    auditId: audit.id
  };
}

export async function consolidateAgentMemoryCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const result = await consolidateAgentMemory(options.query, context, {
    limit: options.limit,
    scope: options.scope
  });
  const audit = await appendAuditEvent(context.paths.auditPath, "memory.consolidate", {
    query: options.query,
    ok: result.ok,
    status: result.status,
    matchedRecords: result.matchedRecords?.length ?? 0,
    approvalRequest: result.approvalRequest ?? null
  });

  return {
    ...result,
    auditId: audit.id
  };
}

export async function searchAgentMemoryCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const records = await searchAgentMemory(context.paths.memoryPath, options.query, {
    limit: options.limit,
    scope: options.scope
  });

  return {
    schemaVersion: "clawguard.agentMemorySearch.v1",
    memoryPath: context.paths.memoryPath,
    query: options.query,
    records
  };
}

export async function searchAgentSessionsCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const sessions = await searchAgentSessions(context.paths.sessionsDir, options.query, {
    limit: options.limit
  });

  return {
    schemaVersion: "clawguard.agentSessionSearch.v1",
    sessionsDir: context.paths.sessionsDir,
    query: options.query,
    sessions
  };
}

export async function recallAgentMemoryCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const sessionId = options.sessionId ?? randomUUID();
  const recall = await createRecallSnapshot(options.query, {
    ...context,
    sessionId
  }, {
    memoryLimit: options.memoryLimit,
    sessionLimit: options.sessionLimit
  });
  const audit = await appendAuditEvent(context.paths.auditPath, "recall.created", {
    task: options.query,
    memoryMatches: recall.memory.length,
    sessionMatches: recall.sessions.length,
    recallPath: recall.path,
    command: "memory.recall"
  });

  return {
    ...recall,
    schemaVersion: "clawguard.agentMemoryRecall.v1",
    auditId: audit.id
  };
}

export async function bootstrapAgentMemoryCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const result = await bootstrapAgentMemory(context, {
    limit: options.limit
  });
  const audit = await appendAuditEvent(context.paths.auditPath, "memory.bootstrap", {
    proposed: result.proposed,
    blocked: result.blocked
  });

  return {
    ...result,
    auditId: audit.id
  };
}

export async function exportAgentMemoryCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  await refreshMemoryMirrors(context.paths, {
    scope: options.scope ?? context.agent.memoryScope,
    limit: context.agent.memoryMirrorLimit
  });
  const exported = await exportAgentMemory(context.paths, options);

  return {
    schemaVersion: "clawguard.agentMemoryExport.v1",
    memoryPath: context.paths.memoryPath,
    userMemoryMarkdownPath: context.paths.userMemoryMarkdownPath,
    workspaceMemoryMarkdownPath: context.paths.workspaceMemoryMarkdownPath,
    ...exported
  };
}

export async function listAgentSkillsCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const skills = await listAgentSkills(context);

  return {
    schemaVersion: "clawguard.agentSkillsList.v1",
    skillDirs: context.agent.trustedSkillDirs,
    trustedSkillsDir: context.paths.trustedSkillsDir,
    skills
  };
}

export async function showAgentSkillCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const skill = await showAgentSkill(context, options.name);

  return {
    schemaVersion: "clawguard.agentSkillShow.v1",
    skill
  };
}

export async function validateAgentSkillCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const validation = await validateAgentSkillDirectory(context, options.source);
  return {
    schemaVersion: "clawguard.agentSkillValidation.v1",
    ...validation
  };
}

export async function installAgentSkillCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const result = await installAgentSkill(context, options.source, {
    name: options.name,
    approvalId: options.approvalId
  });
  return {
    schemaVersion: "clawguard.agentSkillInstall.v1",
    ...result
  };
}

export async function createAgentSkillCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const result = await createAgentSkillTemplate(context, options.name, {
    type: options.type
  });
  return {
    schemaVersion: "clawguard.agentSkillCreate.v1",
    ...result
  };
}

export async function trustAgentSkillCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const result = await trustWorkspaceAgentSkill(context, options.name);
  return {
    schemaVersion: "clawguard.agentSkillTrust.v1",
    ...result
  };
}

export async function removeAgentSkillCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const result = await removeTrustedAgentSkill(context, options.name);
  return {
    schemaVersion: "clawguard.agentSkillRemove.v1",
    ...result
  };
}

export async function listAgentToolsCommand() {
  return {
    schemaVersion: "clawguard.agentToolsList.v1",
    tools: listAgentTools()
  };
}

export async function showAgentAutonomyCommand(options = {}) {
  const context = await loadAgentContext(options);
  return {
    schemaVersion: "clawguard.agentAutonomyShow.v1",
    configPath: context.paths.configPath,
    toolAutonomy: normalizeToolAutonomyConfig(context.agent.toolAutonomy),
    tools: listAutonomyToolPolicies(context.agent)
  };
}

export async function setAgentAutonomyPresetCommand(options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const loaded = await loadMutableAgentConfig(workspace, options.configPath);
  const preset = normalizeAutonomyPreset(options.preset);
  loaded.raw.agent ??= {};
  const current = normalizeToolAutonomyConfig(loaded.raw.agent.toolAutonomy ?? defaultConfig.agent.toolAutonomy);
  loaded.raw.agent.toolAutonomy = {
    preset,
    overrides: current.overrides
  };

  const nextConfig = normalizeConfig(loaded.raw, loaded.configPath);
  await writeConfigFile(loaded.configPath, nextConfig);
  return {
    schemaVersion: "clawguard.agentAutonomyWrite.v1",
    ok: true,
    action: "set-preset",
    configPath: loaded.configPath,
    toolAutonomy: nextConfig.agent.toolAutonomy
  };
}

export async function setAgentToolAutonomyCommand(options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const loaded = await loadMutableAgentConfig(workspace, options.configPath);
  const tool = String(options.tool ?? "").trim();
  if (!canOverrideToolAutonomy(tool)) {
    throw new Error(`${tool || "Tool"} cannot be made full-auto. It is unknown or locked by ClawGuard's safety floor.`);
  }
  const mode = normalizeAutonomyMode(options.mode);
  loaded.raw.agent ??= {};
  const current = normalizeToolAutonomyConfig(loaded.raw.agent.toolAutonomy ?? defaultConfig.agent.toolAutonomy);
  current.overrides[tool] = mode;
  loaded.raw.agent.toolAutonomy = current;

  const nextConfig = normalizeConfig(loaded.raw, loaded.configPath);
  await writeConfigFile(loaded.configPath, nextConfig);
  return {
    schemaVersion: "clawguard.agentAutonomyWrite.v1",
    ok: true,
    action: "set-tool",
    tool,
    mode,
    configPath: loaded.configPath,
    toolAutonomy: nextConfig.agent.toolAutonomy
  };
}

export async function resetAgentAutonomyCommand(options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const loaded = await loadMutableAgentConfig(workspace, options.configPath);
  loaded.raw.agent ??= {};
  loaded.raw.agent.toolAutonomy = defaultConfig.agent.toolAutonomy;

  const nextConfig = normalizeConfig(loaded.raw, loaded.configPath);
  await writeConfigFile(loaded.configPath, nextConfig);
  return {
    schemaVersion: "clawguard.agentAutonomyWrite.v1",
    ok: true,
    action: "reset",
    configPath: loaded.configPath,
    toolAutonomy: nextConfig.agent.toolAutonomy
  };
}

export async function listAgentSubagentsCommand() {
  return {
    schemaVersion: "clawguard.agentSubagentsList.v1",
    profiles: listSubagentProfiles()
  };
}

export async function showAgentSubagentCommand(options = {}) {
  return {
    schemaVersion: "clawguard.agentSubagentShow.v1",
    profile: getSubagentProfile(options.name)
  };
}

export async function showAgentThinkingCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  return readThinkingArtifact(context.paths, options.sessionId);
}

export async function delegateAgentTaskCommand(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const run = await executeSubagentRun(context, {
    profile: options.profile,
    task: options.task,
    maxSteps: options.maxSteps,
    parentSessionId: options.parentSessionId ?? randomUUID()
  });

  return {
    schemaVersion: "clawguard.agentDelegate.v1",
    ...run
  };
}

export async function listAgentProtectedAssetsCommand(options = {}) {
  const context = await loadAgentContext(options);
  const protectedAssets = normalizeProtectedAssetsConfig(context.agent.protectedAssets);

  return {
    schemaVersion: "clawguard.agentProtectedAssetsList.v1",
    configPath: context.paths.configPath,
    enabled: protectedAssets.enabled,
    defaultPatterns: protectedAssets.defaultPatterns,
    defaultPatternList: protectedAssets.defaultPatterns ? defaultProtectedAssetPatterns : [],
    assets: protectedAssets.assets
  };
}

export async function addAgentProtectedAssetCommand(options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const loaded = await loadMutableAgentConfig(workspace, options.configPath);
  const current = normalizeProtectedAssetsConfig(loaded.raw.agent?.protectedAssets ?? defaultConfig.agent.protectedAssets);
  const asset = normalizeProtectedAsset({
    id: options.id,
    type: options.type,
    path: options.path,
    operations: options.operations,
    decision: options.decision,
    reason: options.reason
  });

  if (!asset) {
    throw new Error("agent protected add requires a valid id and --path.");
  }

  const existingIndex = current.assets.findIndex((item) => item.id === asset.id);
  const action = existingIndex >= 0 ? "updated" : "added";
  if (existingIndex >= 0) {
    current.assets[existingIndex] = asset;
  } else {
    current.assets.push(asset);
  }

  loaded.raw.agent ??= {};
  loaded.raw.agent.protectedAssets = {
    enabled: current.enabled,
    defaultPatterns: current.defaultPatterns,
    assets: current.assets
  };

  const nextConfig = normalizeConfig(loaded.raw, loaded.configPath);
  await writeConfigFile(loaded.configPath, nextConfig);

  return {
    schemaVersion: "clawguard.agentProtectedAssetWrite.v1",
    ok: true,
    action,
    configPath: loaded.configPath,
    asset,
    protectedAssets: nextConfig.agent.protectedAssets
  };
}

export async function checkAgentProtectedAssetCommand(options = {}) {
  const context = await loadAgentContext(options);
  let result;

  if (options.argv?.length > 0) {
    result = inspectProtectedShellArgv(options.argv, context.agent.protectedAssets);
    return {
      schemaVersion: "clawguard.agentProtectedAssetCheck.v1",
      kind: "shell",
      argv: options.argv,
      decision: result.decision,
      risk: result.risk,
      protected: result.protected,
      result
    };
  }

  const operation = options.operation ?? "read";
  const target = await resolveWorkspacePath(context.paths.workspace, options.path, { optional: true });
  result = inspectProtectedPath(context.paths.workspace, target, operation, context.agent.protectedAssets);

  return {
    schemaVersion: "clawguard.agentProtectedAssetCheck.v1",
    kind: "path",
    operation,
    path: result.path,
    decision: result.decision,
    risk: result.risk,
    protected: result.protected,
    result
  };
}

export async function showAgentAudit(options = {}) {
  const context = await loadAgentContext(options);
  await ensureAgentState(context.paths);
  const events = await readAuditEvents(context.paths.auditPath, {
    limit: options.limit
  });
  const verification = options.verify ? await verifyAuditChain(context.paths.auditPath) : undefined;

  return {
    schemaVersion: "clawguard.agentAuditShow.v1",
    auditPath: context.paths.auditPath,
    verification,
    events
  };
}

export function agentRunExitCode(run) {
  if (run.status === "completed") {
    return 0;
  }

  if (run.status === "pending_approval") {
    return 1;
  }

  return 2;
}

async function executeSubagentDelegateStep(step, context, options = {}) {
  const autonomy = resolveToolAutonomy(step, context);
  if (autonomy.effectiveMode === "block") {
    return {
      ok: false,
      status: "blocked",
      output: { autonomy },
      error: autonomy.reason,
      artifacts: [{ type: "tool-autonomy", autonomy }],
      autonomy
    };
  }

  if (autonomy.approvalRequired) {
    const approved = await resolveRuntimeApproval(step, context, autonomy);
    if (!approved.approved) {
      return {
        ...approved.result,
        autonomy,
        artifacts: [
          ...(approved.result.artifacts ?? []),
          { type: "tool-autonomy", autonomy }
        ]
      };
    }
  }

  const childRun = await executeSubagentRun(context, {
    profile: step.args?.profile ?? "researcher",
    task: step.args?.task ?? options.fallbackTask,
    maxSteps: step.args?.maxSteps,
    parentSessionId: options.parentSessionId ?? context.sessionId
  });

  return {
    ok: childRun.status === "completed",
    status: childRun.status,
    output: summarizeSubagentRun(childRun),
    error: childRun.status === "completed" ? null : "Subagent paused or blocked.",
    artifacts: [
      childRun.sessionPath,
      { type: "tool-autonomy", autonomy }
    ],
    autonomy
  };
}

async function resolveRuntimeApproval(step, context, autonomy) {
  if (context.approvalId) {
    const decision = await readLatestDecision(context.paths.decisionsPath, context.approvalId);
    if (decision?.decision === "approve") {
      const scopeError = await validateRuntimeApprovalScope(context.approvalId, step, context);
      if (scopeError) {
        return {
          approved: false,
          result: {
            ok: false,
            status: "blocked",
            output: null,
            error: scopeError,
            approvalDecision: decision,
            artifacts: []
          }
        };
      }
      return { approved: true, decision };
    }
    return {
      approved: false,
      result: {
        ok: false,
        status: decision ? "blocked" : "pending_approval",
        output: null,
        error: decision?.reason ?? `No decision recorded for approval ${context.approvalId}.`,
        approvalDecision: decision ?? undefined,
        approvalRequest: decision ? undefined : {
          id: context.approvalId,
          path: context.paths.approvalPath,
          status: "pending"
        },
        artifacts: []
      }
    };
  }

  const request = createAgentApprovalRequest({
    tool: step.tool,
    args: step.args,
    target: context.paths.workspace,
    destination: context.paths.workspace,
    risk: step.risk ?? "medium",
    reason: autonomy.reason,
    requiredActions: ["review-autonomy-policy", "approve-subagent-delegation"],
    artifacts: [{ type: "tool-autonomy", autonomy }]
  });
  const approvalRequest = await appendAgentApprovalRequest(context.paths.approvalPath, request);
  return {
    approved: false,
    result: {
      ok: false,
      status: "pending_approval",
      output: {
        message: "Approval required before this delegation can execute."
      },
      error: null,
      approvalRequest,
      artifacts: [{ type: "tool-autonomy", autonomy }]
    }
  };
}

async function validateRuntimeApprovalScope(approvalId, step, context) {
  const approvals = await readApprovalRequests(context.paths.approvalPath);
  const approval = approvals.find((item) => item.id === approvalId);
  if (!approval) {
    return `Approval ${approvalId} does not match a recorded approval request.`;
  }

  const approvedTool = String(approval.agentAction?.tool ?? approval.tool ?? "");
  if (approvedTool && approvedTool !== step.tool) {
    return `Approval ${approvalId} is for ${approvedTool}, not ${step.tool}.`;
  }

  const workspace = path.resolve(context.paths.workspace);
  for (const field of ["target", "destination"]) {
    if (approval[field] && path.resolve(approval[field]) !== workspace) {
      return `Approval ${approvalId} is scoped to a different ${field}.`;
    }
  }

  return null;
}

async function runAgentTeamTask(task, context, options = {}) {
  const parentSessionId = context.sessionId;
  const assignments = createTeamAssignments(task, {
    maxSubagents: options.maxSubagents
  });
  const gateStep = {
    id: "team-delegate",
    tool: "subagent.delegate",
    args: {
      task,
      profiles: assignments.map((assignment) => assignment.profile)
    },
    risk: "medium",
    reason: "Delegate bounded work to a local subagent team."
  };
  const gateAutonomy = resolveToolAutonomy(gateStep, context);
  const gateResult = await resolveTeamDelegationGate(gateStep, context, gateAutonomy);
  if (!gateResult.allowed) {
    return writeAgentTeamRun({
      task,
      context,
      options,
      parentSessionId,
      assignments,
      childRuns: [],
      status: gateResult.result.status ?? "blocked",
      gateResult: gateResult.result
    });
  }

  const auditTeam = await appendAuditEvent(context.paths.auditPath, "subagent.team.created", {
    task,
    parentSessionId,
    assignments,
    autonomy: gateAutonomy
  });
  const childRuns = [];
  let status = "completed";

  for (const assignment of assignments) {
    const childRun = await executeSubagentRun(context, {
      profile: assignment.profile,
      task: assignment.task,
      parentSessionId
    });
    childRuns.push(childRun);
    if (childRun.status !== "completed") {
      status = childRun.status;
      break;
    }
  }

  return writeAgentTeamRun({
    task,
    context,
    options,
    parentSessionId,
    assignments,
    childRuns,
    status,
    planAuditId: auditTeam.id,
    gateAutonomy
  });
}

async function resolveTeamDelegationGate(step, context, autonomy) {
  if (autonomy.effectiveMode === "block") {
    return {
      allowed: false,
      result: {
        ok: false,
        status: "blocked",
        output: { autonomy },
        error: autonomy.reason,
        artifacts: [{ type: "tool-autonomy", autonomy }],
        autonomy
      }
    };
  }

  if (!autonomy.approvalRequired) {
    return { allowed: true };
  }

  const approved = await resolveRuntimeApproval(step, context, autonomy);
  if (approved.approved) {
    return { allowed: true };
  }

  return {
    allowed: false,
    result: {
      ...approved.result,
      autonomy,
      artifacts: [
        ...(approved.result.artifacts ?? []),
        { type: "tool-autonomy", autonomy }
      ]
    }
  };
}

async function writeAgentTeamRun({
  task,
  context,
  options,
  parentSessionId,
  assignments,
  childRuns,
  status,
  planAuditId,
  gateResult,
  gateAutonomy
}) {
  const sessionPath = path.join(context.paths.sessionsDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${parentSessionId}-team.json`);
  const steps = gateResult ? [{
    step: {
      id: "team-delegate",
      tool: "subagent.delegate",
      args: {
        task,
        profiles: assignments.map((assignment) => assignment.profile)
      },
      risk: "medium",
      reason: "Delegate bounded work to a local subagent team."
    },
    result: gateResult
  }] : childRuns.map((childRun, index) => ({
    step: {
      id: `team-${index + 1}`,
      tool: "subagent.delegate",
      args: {
        profile: childRun.profile,
        task: childRun.task
      },
      risk: "medium",
      reason: `Delegate bounded work to ${childRun.profile}.`
    },
    result: {
      ok: childRun.status === "completed",
      status: childRun.status,
      output: summarizeSubagentRun(childRun),
      error: childRun.status === "completed" ? null : "Subagent paused or blocked.",
      artifacts: [childRun.sessionPath],
      autonomy: gateAutonomy ?? null
    }
  }));

  const run = {
    schemaVersion: "clawguard.agentTeamRun.v1",
    sessionId: parentSessionId,
    status,
    task,
    configPath: options.configPath,
    workspace: options.workspace,
    plan: {
      task,
      steps: assignments.map((assignment, index) => ({
        id: `team-${index + 1}`,
        tool: "subagent.delegate",
        args: assignment,
        risk: "medium",
        reason: `Delegate bounded work to ${assignment.profile}.`
      }))
    },
    planAuditId: planAuditId ?? null,
    subagents: childRuns.map(summarizeSubagentRun),
    childRuns,
    steps,
    paths: publicPaths(context.paths),
    sessionPath,
    createdAt: new Date().toISOString()
  };

  await fs.writeFile(sessionPath, `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

async function executeSubagentRun(parentContext, options = {}) {
  const profile = getSubagentProfile(options.profile);
  const childSessionId = randomUUID();
  const parentSessionId = options.parentSessionId ?? parentContext.sessionId ?? randomUUID();
  const plan = filterSubagentPlan(createSubagentPlan(profile.name, options.task, {
    maxSteps: options.maxSteps
  }), parentContext);
  const allowedTools = new Set(profile.allowedTools);
  const childContext = {
    ...parentContext,
    sessionId: childSessionId,
    approvalId: options.approvalId ?? parentContext.approvalId,
    subagent: {
      profile: profile.name,
      allowedTools,
      maxSteps: profile.maxSteps,
      maxOutputBytes: profile.maxOutputBytes,
      parentSessionId,
      depth: 1
    }
  };
  const assignedAudit = await appendAuditEvent(parentContext.paths.auditPath, "subagent.assigned", {
    parentSessionId,
    childSessionId,
    profile: profile.name,
    task: plan.task,
    allowedTools: profile.allowedTools,
    maxSteps: profile.maxSteps
  });
  const planAudit = await appendAuditEvent(parentContext.paths.auditPath, "subagent.plan.created", {
    parentSessionId,
    childSessionId,
    profile: profile.name,
    steps: plan.steps.map((step) => ({
      id: step.id,
      tool: step.tool,
      risk: step.risk,
      reason: step.reason
    }))
  });
  const steps = [];
  let status = "completed";

  for (const step of plan.steps) {
    let result;
    try {
      result = await executeAgentTool(step, childContext);
    } catch (error) {
      result = {
        ok: false,
        status: "error",
        output: null,
        error: error.message,
        artifacts: []
      };
    }

    const audit = await appendAuditEvent(parentContext.paths.auditPath, "subagent.tool.result", {
      parentSessionId,
      childSessionId,
      profile: profile.name,
      ...buildToolResultAuditEvent({
        result,
        step,
        agent: childContext.agent
      })
    });
    steps.push({
      step,
      result: {
        ...limitSubagentResult(result, profile.maxOutputBytes),
        auditId: audit.id
      }
    });

    if (!result.ok) {
      status = result.status ?? "blocked";
      break;
    }
  }

  const completedAudit = await appendAuditEvent(parentContext.paths.auditPath, "subagent.completed", {
    parentSessionId,
    childSessionId,
    profile: profile.name,
    status,
    steps: steps.length
  });
  const sessionPath = path.join(parentContext.paths.subagentsDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${childSessionId}-${profile.name}.json`);
  const run = {
    schemaVersion: "clawguard.subagentRun.v1",
    parentSessionId,
    sessionId: childSessionId,
    profile: profile.name,
    status,
    task: plan.task,
    allowedTools: profile.allowedTools,
    maxSteps: profile.maxSteps,
    maxOutputBytes: profile.maxOutputBytes,
    assignedAuditId: assignedAudit.id,
    planAuditId: planAudit.id,
    completedAuditId: completedAudit.id,
    plan,
    steps,
    sessionPath,
    createdAt: new Date().toISOString()
  };

  await fs.mkdir(parentContext.paths.subagentsDir, { recursive: true });
  await fs.writeFile(sessionPath, `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

function limitSubagentResult(result, maxOutputBytes) {
  const outputText = JSON.stringify(result.output ?? null);
  if (Buffer.byteLength(outputText) <= maxOutputBytes) {
    return result;
  }

  return {
    ...result,
    output: {
      truncated: true,
      bytes: Buffer.byteLength(outputText),
      preview: outputText.slice(0, maxOutputBytes)
    }
  };
}

function filterSubagentPlan(plan, context) {
  const webSearchProvider = context.agent?.integrations?.webSearch?.provider;
  const webFetchEnabled = context.agent?.integrations?.webFetch?.enabled || webSearchProvider === "mock";
  return {
    ...plan,
    steps: plan.steps.filter((step) => {
      if (step.tool === "web.search" && !webSearchProvider) {
        return false;
      }
      if (step.tool === "web.fetch" && !webFetchEnabled) {
        return false;
      }
      return true;
    })
  };
}

async function createOrLoadPlan(task, context, options) {
  if (options.plan) {
    return validateAgentPlan(options.plan, defaultAgentTools);
  }

  if (options.planPath) {
    const raw = await fs.readFile(path.resolve(options.planPath), "utf8");
    return validateAgentPlan(JSON.parse(raw), defaultAgentTools);
  }

  if (options.recipeName) {
    return validateAgentPlan(createRecipePlan(options.recipeName, task), defaultAgentTools);
  }

  const plan = await createPlanWithProvider(task, context);
  return validateAgentPlan(plan, defaultAgentTools);
}

async function loadAgentContext(options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const loadedConfig = await loadConfig(workspace, options.configPath);
  const paths = resolveAgentPaths(workspace, loadedConfig.config.agent, {
    configPath: loadedConfig.path ?? path.join(workspace, ".clawguard.json"),
    approvalPath: options.approvalPath,
    decisionsPath: options.decisionsPath
  });

  return {
    config: loadedConfig.config,
    policy: loadedConfig.config.policy,
    agent: loadedConfig.config.agent,
    paths,
    approvalId: options.approvalId
  };
}

async function loadMutableAgentConfig(workspace, configPath) {
  const loaded = await loadConfig(workspace, configPath);
  const resolvedConfigPath = loaded.path ?? path.join(workspace, ".clawguard.json");
  const raw = await readJsonIfPresent(resolvedConfigPath) ?? {};

  return {
    configPath: resolvedConfigPath,
    raw
  };
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeConfigFile(configPath, config) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function readChatPrompt() {
  if (!process.stdin.isTTY) {
    return process.stdin.read() ?? await readAllStdin();
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    return await rl.question("clawguard agent> ");
  } finally {
    rl.close();
  }
}

async function readAllStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))).toString("utf8");
}

function summarizeAgentConfig(agent) {
  return {
    provider: agent.provider,
    model: agent.model,
    safetyProfile: agent.safetyProfile,
    autoWriteMemory: agent.autoWriteMemory,
    autoProposeTaskOutcomeMemory: agent.autoProposeTaskOutcomeMemory,
    thinking: agent.thinking,
    protectedAssets: {
      enabled: agent.protectedAssets?.enabled !== false,
      defaultPatterns: agent.protectedAssets?.defaultPatterns !== false,
      customAssets: Array.isArray(agent.protectedAssets?.assets) ? agent.protectedAssets.assets.length : 0
    },
    toolAutonomy: agent.toolAutonomy,
    trustedSkillDirs: agent.trustedSkillDirs
  };
}

function publicPaths(paths) {
  return {
    stateDir: paths.stateDir,
    auditPath: paths.auditPath,
    memoryPath: paths.memoryPath,
    sessionsDir: paths.sessionsDir,
    backupsDir: paths.backupsDir,
    proposedDir: paths.proposedDir,
    subagentsDir: paths.subagentsDir,
    thinkingDir: paths.thinkingDir,
    trustedSkillsDir: paths.trustedSkillsDir,
    userMemoryMarkdownPath: paths.userMemoryMarkdownPath,
    workspaceMemoryMarkdownPath: paths.workspaceMemoryMarkdownPath,
    recallDir: paths.recallDir,
    approvalPath: paths.approvalPath,
    decisionsPath: paths.decisionsPath
  };
}
