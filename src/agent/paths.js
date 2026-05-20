import { promises as fs } from "node:fs";
import path from "node:path";

export const defaultAgentStateDir = ".clawguard/agent";

export function resolveAgentPaths(workspace, agentConfig = {}, overrides = {}) {
  const resolvedWorkspace = path.resolve(workspace);
  const stateDir = resolveUnderWorkspace(resolvedWorkspace, overrides.stateDir ?? agentConfig.stateDir ?? defaultAgentStateDir);

  return {
    workspace: resolvedWorkspace,
    configPath: overrides.configPath ? path.resolve(overrides.configPath) : path.join(resolvedWorkspace, ".clawguard.json"),
    stateDir,
    auditPath: resolveUnderWorkspace(resolvedWorkspace, overrides.auditPath ?? agentConfig.auditPath ?? path.join(defaultAgentStateDir, "audit.jsonl")),
    memoryPath: resolveUnderWorkspace(resolvedWorkspace, overrides.memoryPath ?? agentConfig.memoryPath ?? path.join(defaultAgentStateDir, "memory.jsonl")),
    userMemoryMarkdownPath: resolveUnderWorkspace(resolvedWorkspace, overrides.userMemoryMarkdownPath ?? agentConfig.userMemoryMarkdownPath ?? path.join(defaultAgentStateDir, "USER.md")),
    workspaceMemoryMarkdownPath: resolveUnderWorkspace(resolvedWorkspace, overrides.workspaceMemoryMarkdownPath ?? agentConfig.workspaceMemoryMarkdownPath ?? path.join(defaultAgentStateDir, "MEMORY.md")),
    sessionsDir: resolveUnderWorkspace(resolvedWorkspace, overrides.sessionsDir ?? agentConfig.sessionsDir ?? path.join(defaultAgentStateDir, "sessions")),
    recallDir: resolveUnderWorkspace(resolvedWorkspace, overrides.recallDir ?? agentConfig.recallDir ?? path.join(defaultAgentStateDir, "recall")),
    thinkingDir: resolveUnderWorkspace(resolvedWorkspace, overrides.thinkingDir ?? agentConfig.thinkingDir ?? path.join(defaultAgentStateDir, "thinking")),
    backupsDir: resolveUnderWorkspace(resolvedWorkspace, overrides.backupsDir ?? agentConfig.backupsDir ?? path.join(defaultAgentStateDir, "backups")),
    proposedDir: resolveUnderWorkspace(resolvedWorkspace, overrides.proposedDir ?? agentConfig.proposedDir ?? path.join(defaultAgentStateDir, "proposed")),
    subagentsDir: resolveUnderWorkspace(resolvedWorkspace, overrides.subagentsDir ?? agentConfig.subagentsDir ?? path.join(defaultAgentStateDir, "subagents")),
    trustedSkillsDir: resolveUnderWorkspace(resolvedWorkspace, overrides.trustedSkillsDir ?? agentConfig.trustedSkillsDir ?? path.join(defaultAgentStateDir, "skills")),
    approvalPath: resolveUnderWorkspace(resolvedWorkspace, overrides.approvalPath ?? agentConfig.approvalPath ?? ".clawguard/approvals.jsonl"),
    decisionsPath: resolveUnderWorkspace(resolvedWorkspace, overrides.decisionsPath ?? agentConfig.decisionsPath ?? ".clawguard/decisions.jsonl")
  };
}

export async function ensureAgentState(paths) {
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.sessionsDir, { recursive: true });
  await fs.mkdir(paths.recallDir, { recursive: true });
  await fs.mkdir(paths.thinkingDir, { recursive: true });
  await fs.mkdir(paths.backupsDir, { recursive: true });
  await fs.mkdir(paths.proposedDir, { recursive: true });
  await fs.mkdir(paths.subagentsDir, { recursive: true });
  await fs.mkdir(paths.trustedSkillsDir, { recursive: true });
  await fs.mkdir(path.dirname(paths.auditPath), { recursive: true });
  await fs.mkdir(path.dirname(paths.memoryPath), { recursive: true });
  await fs.mkdir(path.dirname(paths.userMemoryMarkdownPath), { recursive: true });
  await fs.mkdir(path.dirname(paths.workspaceMemoryMarkdownPath), { recursive: true });
  await fs.mkdir(path.dirname(paths.approvalPath), { recursive: true });
  await fs.mkdir(path.dirname(paths.decisionsPath), { recursive: true });
}

export async function resolveWorkspacePath(workspace, inputPath = ".", { forWrite = false, optional = false } = {}) {
  const resolvedWorkspace = await canonicalWorkspace(workspace);
  const requestedPath = path.resolve(resolvedWorkspace, String(inputPath));
  assertInside(resolvedWorkspace, requestedPath, inputPath);

  try {
    const realPath = await fs.realpath(requestedPath);
    assertInside(resolvedWorkspace, realPath, inputPath);
  } catch (error) {
    if (error.code !== "ENOENT" || (!forWrite && !optional)) {
      throw error;
    }
  }

  if (forWrite) {
    await assertWritableParentInside(resolvedWorkspace, requestedPath, inputPath);
  }

  return requestedPath;
}

async function canonicalWorkspace(workspace) {
  const resolved = path.resolve(workspace);
  try {
    return await fs.realpath(resolved);
  } catch {
    return resolved;
  }
}

export function relativeToWorkspace(workspace, filePath) {
  const relative = path.relative(path.resolve(workspace), path.resolve(filePath));
  return relative || ".";
}

export function safeArtifactName(value) {
  return String(value)
    .replaceAll(path.sep, "__")
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .slice(0, 160) || "artifact";
}

function resolveUnderWorkspace(workspace, value) {
  const resolved = path.resolve(workspace, String(value));
  assertInside(workspace, resolved, value);
  return resolved;
}

async function assertWritableParentInside(workspace, requestedPath, originalPath) {
  let current = path.dirname(requestedPath);

  while (true) {
    try {
      const realParent = await fs.realpath(current);
      assertInside(workspace, realParent, originalPath);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to find an existing parent directory for ${originalPath}`);
    }
    current = parent;
  }
}

function assertInside(workspace, candidate, originalPath) {
  const relative = path.relative(path.resolve(workspace), path.resolve(candidate));

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the ClawGuard Agent workspace: ${originalPath}`);
  }
}
