import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { appendAuditEvent, readAuditEvents, verifyAuditChain } from "./audit.js";
import {
  createRecallSnapshot,
  exportAgentMemory,
  proposeAgentMemory,
  proposeTaskOutcomeMemory,
  readAgentMemory,
  refreshMemoryMirrors,
  searchAgentMemory,
  searchAgentSessions,
  writeAgentMemory
} from "./memory.js";
import { ensureAgentState, resolveAgentPaths } from "./paths.js";
import { validateAgentPlan } from "./planner.js";
import { createPlanWithProvider } from "./providers.js";
import { createRecipePlan } from "./recipes.js";
import { routeAgentTask } from "./router.js";
import { listAgentSkills, loadTrustedAgentSkills, showAgentSkill } from "./skills.js";
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
    config,
    policy: config.policy,
    agent: {
      ...config.agent,
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.model ? { model: options.model } : {})
    },
    paths,
    approvalId: options.approvalId
  };
  const tools = listAgentTools();
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
  const plan = await createOrLoadPlan(task, {
    ...context,
    tools,
    memory: recall.memory.length > 0 ? recall.memory : memory,
    skills,
    route,
    recall
  }, options);
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
      result = await executeAgentTool(step, context);
    } catch (error) {
      result = {
        ok: false,
        status: "error",
        output: null,
        error: error.message,
        artifacts: []
      };
    }

    const auditResult = await appendAuditEvent(paths.auditPath, "tool.result", {
      step: {
        id: step.id,
        tool: step.tool,
        risk: step.risk
      },
      ok: result.ok,
      status: result.status ?? (result.ok ? "completed" : "blocked"),
      error: result.error ?? null,
      approvalRequest: result.approvalRequest ?? null,
      artifacts: result.artifacts ?? []
    });
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

export async function listAgentToolsCommand() {
  return {
    schemaVersion: "clawguard.agentToolsList.v1",
    tools: listAgentTools()
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
    trustedSkillsDir: paths.trustedSkillsDir,
    userMemoryMarkdownPath: paths.userMemoryMarkdownPath,
    workspaceMemoryMarkdownPath: paths.workspaceMemoryMarkdownPath,
    recallDir: paths.recallDir,
    approvalPath: paths.approvalPath,
    decisionsPath: paths.decisionsPath
  };
}
