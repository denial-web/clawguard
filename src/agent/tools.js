import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { appendAgentApprovalRequest, createAgentApprovalRequest, readLatestDecision } from "./approvals.js";
import { relativeToWorkspace, resolveWorkspacePath, safeArtifactName } from "./paths.js";
import { scanTarget } from "../scanner.js";

const execFileAsync = promisify(execFile);

export const defaultAgentTools = [
  {
    name: "file.list",
    risk: "low",
    approvalRequired: false,
    description: "List files inside the current workspace.",
    schema: { path: "string", maxDepth: "number", maxEntries: "number" }
  },
  {
    name: "file.read",
    risk: "low",
    approvalRequired: false,
    description: "Read a UTF-8 file inside the current workspace.",
    schema: { path: "string", maxBytes: "number", optional: "boolean" }
  },
  {
    name: "file.diff",
    risk: "low",
    approvalRequired: false,
    description: "Preview a line diff for a workspace file and proposed content.",
    schema: { path: "string", content: "string" }
  },
  {
    name: "file.write_safe",
    risk: "medium",
    approvalRequired: true,
    description: "Write a workspace file only after approval, with a proposed copy, diff, and backup.",
    schema: { path: "string", content: "string" }
  },
  {
    name: "project.cleanup_safe",
    risk: "high",
    approvalRequired: true,
    description: "Propose cleanup of generated/cache folders, block protected project files, and move approved items into backup.",
    schema: { path: "string", include: "array" }
  },
  {
    name: "shell.dry_run",
    risk: "low",
    approvalRequired: false,
    description: "Classify a command without executing it.",
    schema: { command: "string", argv: "array" }
  },
  {
    name: "shell.execute_approved",
    risk: "high",
    approvalRequired: true,
    description: "Execute an argv-only command after approval, without shell parsing.",
    schema: { argv: "array", cwd: "string", timeoutMs: "number" }
  },
  {
    name: "skill.install_guarded",
    risk: "high",
    approvalRequired: true,
    description: "Scan and install a SKILL.md folder into the trusted ClawGuard Agent skill directory after approval.",
    schema: { source: "string", name: "string" }
  }
];

export function listAgentTools() {
  return defaultAgentTools.map((tool) => ({ ...tool }));
}

export async function executeAgentTool(step, context) {
  if (step.tool === "file.list") {
    return listFiles(step.args, context);
  }

  if (step.tool === "file.read") {
    return readFile(step.args, context);
  }

  if (step.tool === "file.diff") {
    return diffFile(step.args, context);
  }

  if (step.tool === "file.write_safe") {
    return writeFileSafe(step, context);
  }

  if (step.tool === "project.cleanup_safe") {
    return cleanupProjectSafe(step, context);
  }

  if (step.tool === "shell.dry_run") {
    return dryRunShell(step.args);
  }

  if (step.tool === "shell.execute_approved") {
    return executeApprovedShell(step, context);
  }

  if (step.tool === "skill.install_guarded") {
    return installGuardedSkill(step, context);
  }

  return {
    ok: false,
    output: "",
    error: `Unknown tool: ${step.tool}`,
    artifacts: []
  };
}

async function listFiles(args, context) {
  const root = await resolveWorkspacePath(context.paths.workspace, args.path ?? ".", { optional: true });
  const maxDepth = clampInteger(args.maxDepth, 2, 0, 6);
  const maxEntries = clampInteger(args.maxEntries, 200, 1, 1000);
  const entries = [];
  await walkFiles(root, context.paths.workspace, entries, {
    depth: 0,
    maxDepth,
    maxEntries
  });

  return {
    ok: true,
    output: entries,
    error: null,
    artifacts: []
  };
}

async function readFile(args, context) {
  const maxBytes = clampInteger(args.maxBytes, 65536, 1, 512 * 1024);
  let target;

  try {
    target = await resolveWorkspacePath(context.paths.workspace, requireString(args.path, "file.read requires args.path"), {
      optional: Boolean(args.optional)
    });
  } catch (error) {
    if (args.optional && error.code === "ENOENT") {
      return {
        ok: true,
        output: null,
        error: null,
        artifacts: []
      };
    }
    throw error;
  }

  let handle;
  try {
    handle = await fs.open(target, "r");
    const buffer = Buffer.alloc(maxBytes);
    const read = await handle.read(buffer, 0, maxBytes, 0);
    const text = buffer.subarray(0, read.bytesRead).toString("utf8");
    const stats = await handle.stat();
    return {
      ok: true,
      output: {
        path: relativeToWorkspace(context.paths.workspace, target),
        bytesRead: read.bytesRead,
        truncated: stats.size > read.bytesRead,
        content: text
      },
      error: null,
      artifacts: []
    };
  } finally {
    await handle?.close();
  }
}

async function diffFile(args, context) {
  const target = await resolveWorkspacePath(context.paths.workspace, requireString(args.path, "file.diff requires args.path"), {
    optional: true
  });
  const proposed = requireString(args.content, "file.diff requires args.content");
  const existing = await readFileIfPresent(target);

  return {
    ok: true,
    output: {
      path: relativeToWorkspace(context.paths.workspace, target),
      diff: createLineDiff(existing, proposed)
    },
    error: null,
    artifacts: []
  };
}

async function writeFileSafe(step, context) {
  const target = await resolveWorkspacePath(context.paths.workspace, requireString(step.args.path, "file.write_safe requires args.path"), {
    forWrite: true,
    optional: true
  });
  const content = requireString(step.args.content, "file.write_safe requires args.content");
  const current = await readFileIfPresent(target);
  const diff = createLineDiff(current, content);
  const proposedPath = path.join(
    context.paths.proposedDir,
    `${context.sessionId}-${safeArtifactName(relativeToWorkspace(context.paths.workspace, target))}`
  );

  await fs.mkdir(path.dirname(proposedPath), { recursive: true });
  await fs.writeFile(proposedPath, content);

  const approval = await requireApproval(step, context, {
    target,
    destination: target,
    risk: "medium",
    requiredActions: ["review-diff", "approve-write"],
    artifacts: [
      {
        type: "proposed-file",
        path: proposedPath
      },
      {
        type: "diff",
        path: relativeToWorkspace(context.paths.workspace, target),
        diff
      }
    ]
  });

  if (!approval.approved) {
    return approval.result;
  }

  let backupPath = null;
  try {
    await fs.lstat(target);
    backupPath = path.join(
      context.paths.backupsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeArtifactName(relativeToWorkspace(context.paths.workspace, target))}`
    );
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(target, backupPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);

  return {
    ok: true,
    output: {
      path: relativeToWorkspace(context.paths.workspace, target),
      backupPath,
      proposedPath,
      diff
    },
    error: null,
    artifacts: [
      proposedPath,
      backupPath
    ].filter(Boolean)
  };
}

async function cleanupProjectSafe(step, context) {
  const root = await resolveWorkspacePath(context.paths.workspace, step.args.path ?? ".", { optional: true });
  const cleanupPlan = await createCleanupPlan(root, context, step.args);

  if (cleanupPlan.proposed.length === 0) {
    return {
      ok: true,
      output: {
        summary: cleanupPlan.summary,
        proposed: cleanupPlan.proposed,
        blocked: cleanupPlan.blocked,
        skipped: cleanupPlan.skipped,
        moved: []
      },
      error: null,
      artifacts: []
    };
  }

  const approval = await requireApproval(step, context, {
    target: root,
    destination: context.paths.backupsDir,
    risk: "high",
    reason: "Move only approved generated/cache paths into a timestamped ClawGuard backup.",
    requiredActions: ["review-cleanup-plan", "approve-cleanup"],
    artifacts: [{
      type: "cleanup-plan",
      proposed: cleanupPlan.proposed,
      blocked: cleanupPlan.blocked,
      skipped: cleanupPlan.skipped
    }]
  });

  if (!approval.approved) {
    return {
      ...approval.result,
      output: {
        ...approval.result.output,
        plan: cleanupPlan
      }
    };
  }

  const backupRoot = path.join(
    context.paths.backupsDir,
    `cleanup-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
  const moved = [];

  for (const item of cleanupPlan.proposed) {
    const source = path.resolve(context.paths.workspace, item.path);
    const destination = path.join(backupRoot, item.path);

    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(source, destination);
    moved.push({
      path: item.path,
      backupPath: destination,
      reason: item.reason
    });
  }

  return {
    ok: true,
    output: {
      summary: createCleanupSummary(cleanupPlan, moved),
      proposed: cleanupPlan.proposed,
      blocked: cleanupPlan.blocked,
      skipped: cleanupPlan.skipped,
      moved,
      backupRoot
    },
    error: null,
    artifacts: [backupRoot]
  };
}

function dryRunShell(args) {
  const argv = normalizeShellArgs(args, { allowCommandString: true });
  const classification = classifyShellArgv(argv);

  return {
    ok: true,
    output: {
      argv,
      risk: classification.risk,
      allowedForExecution: classification.allowed,
      reason: classification.reason,
      executed: false
    },
    error: null,
    artifacts: []
  };
}

async function executeApprovedShell(step, context) {
  const argv = normalizeShellArgs(step.args, { allowCommandString: false });
  const classification = classifyShellArgv(argv);

  if (!classification.allowed) {
    return {
      ok: false,
      output: {
        argv,
        risk: classification.risk
      },
      error: classification.reason,
      artifacts: []
    };
  }

  const cwd = await resolveWorkspacePath(context.paths.workspace, step.args.cwd ?? ".", { optional: true });
  const approval = await requireApproval(step, context, {
    target: cwd,
    destination: cwd,
    risk: "high",
    reason: `Execute command: ${argv.join(" ")}`,
    requiredActions: ["dry-run-first", "approve-shell-execution"],
    artifacts: [{ type: "argv", argv }]
  });

  if (!approval.approved) {
    return approval.result;
  }

  const timeout = clampInteger(step.args.timeoutMs, context.agent.shellTimeoutMs, 1000, 30000);
  const maxBuffer = clampInteger(step.args.maxBufferBytes, context.agent.shellMaxBufferBytes, 4096, 1024 * 1024);
  const output = await execFileAsync(argv[0], argv.slice(1), {
    cwd,
    timeout,
    maxBuffer
  });

  return {
    ok: true,
    output: {
      argv,
      cwd: relativeToWorkspace(context.paths.workspace, cwd),
      stdout: limitText(output.stdout, context.agent.outputLimitBytes),
      stderr: limitText(output.stderr, context.agent.outputLimitBytes)
    },
    error: null,
    artifacts: []
  };
}

async function installGuardedSkill(step, context) {
  const source = await resolveWorkspacePath(context.paths.workspace, requireString(step.args.source, "skill.install_guarded requires args.source"), {
    optional: true
  });
  await assertDirectoryHasSkill(source);
  await assertDirectoryHasNoSymlinks(source);

  const scan = await scanTarget(source, {
    policy: context.policy,
    suppressions: context.config.suppressions,
    maxFileSizeBytes: context.config.maxFileSizeBytes,
    maxFindingsPerRulePerFile: context.config.maxFindingsPerRulePerFile
  });
  const name = safeArtifactName(step.args.name ?? path.basename(source));
  const destination = path.join(context.paths.trustedSkillsDir, name);
  const approval = await requireApproval(step, context, {
    target: source,
    destination,
    risk: scan.policy.decision === "allow" ? "medium" : "high",
    reason: `Install guarded skill after scan decision ${scan.policy.decision}.`,
    requiredActions: ["review-scan", "approve-skill-install"],
    artifacts: [{
      type: "scan-summary",
      decision: scan.policy.decision,
      level: scan.level,
      score: scan.score,
      findings: scan.findings.slice(0, 5)
    }]
  });

  if (!approval.approved) {
    return approval.result;
  }

  try {
    await fs.lstat(destination);
    return {
      ok: false,
      output: {
        source,
        destination
      },
      error: `Trusted skill destination already exists: ${destination}`,
      artifacts: []
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.cp(source, destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: false
  });

  return {
    ok: true,
    output: {
      source: relativeToWorkspace(context.paths.workspace, source),
      destination: relativeToWorkspace(context.paths.workspace, destination),
      scan: {
        decision: scan.policy.decision,
        level: scan.level,
        score: scan.score
      }
    },
    error: null,
    artifacts: [destination]
  };
}

async function createCleanupPlan(root, context, args = {}) {
  const include = Array.isArray(args.include) && args.include.length > 0
    ? args.include.map((value) => String(value))
    : defaultCleanupNames();
  const proposed = [];
  const blocked = [];
  const skipped = [];

  for (const candidate of include) {
    const cleanName = candidate.replace(/^\.\/+/, "");
    const target = path.resolve(root, cleanName);
    const relativePath = relativeToWorkspace(context.paths.workspace, target);

    if (cleanName.includes("..") || path.isAbsolute(cleanName)) {
      blocked.push({
        path: candidate,
        reason: "Cleanup candidates must stay inside the selected workspace path."
      });
      continue;
    }

    if (isProtectedCleanupPath(relativePath)) {
      blocked.push({
        path: relativePath,
        reason: "Protected source, config, secret, package, or repository control path."
      });
      continue;
    }

    if (!isAllowedCleanupPath(relativePath)) {
      blocked.push({
        path: relativePath,
        reason: "Not in ClawGuard Agent's generated/cache cleanup allowlist."
      });
      continue;
    }

    let stats;
    try {
      stats = await fs.lstat(target);
    } catch (error) {
      if (error.code === "ENOENT") {
        skipped.push({
          path: relativePath,
          reason: "Path does not exist."
        });
        continue;
      }
      throw error;
    }

    if (stats.isSymbolicLink()) {
      blocked.push({
        path: relativePath,
        reason: "Symbolic links are not moved by cleanup."
      });
      continue;
    }

    proposed.push({
      path: relativePath,
      type: stats.isDirectory() ? "dir" : "file",
      size: stats.isFile() ? stats.size : undefined,
      reason: cleanupReason(relativePath)
    });
  }

  const plan = {
    root: relativeToWorkspace(context.paths.workspace, root),
    proposed,
    blocked: [
      ...blocked,
      ...protectedCleanupExamples(context.paths.workspace)
    ],
    skipped,
    requiresApproval: proposed.length > 0,
    summary: createCleanupSummary({ proposed, blocked, skipped }, [])
  };

  return plan;
}

function createCleanupSummary(plan, moved) {
  return {
    proposedCount: plan.proposed.length,
    blockedCount: plan.blocked.length,
    skippedCount: plan.skipped.length,
    movedCount: moved.length,
    message: moved.length > 0
      ? `Moved ${moved.length} approved cleanup item(s) into backup.`
      : `Proposed ${plan.proposed.length} cleanup item(s); protected ${plan.blocked.length} path(s).`
  };
}

async function requireApproval(step, context, details) {
  if (context.approvalId) {
    const decision = await readLatestDecision(context.paths.decisionsPath, context.approvalId);

    if (!decision) {
      return {
        approved: false,
        result: {
          ok: false,
          status: "pending_approval",
          output: null,
          error: `No decision recorded for approval ${context.approvalId}.`,
          approvalRequest: {
            id: context.approvalId,
            path: context.paths.approvalPath,
            status: "pending"
          },
          artifacts: []
        }
      };
    }

    if (decision.decision !== "approve") {
      return {
        approved: false,
        result: {
          ok: false,
          status: "blocked",
          output: null,
          error: decision.reason ?? `Approval ${context.approvalId} was denied.`,
          approvalDecision: decision,
          artifacts: []
        }
      };
    }

    return {
      approved: true,
      decision
    };
  }

  const request = createAgentApprovalRequest({
    tool: step.tool,
    args: step.args,
    target: details.target,
    destination: details.destination,
    risk: details.risk ?? step.risk,
    reason: details.reason ?? step.reason,
    requiredActions: details.requiredActions,
    artifacts: details.artifacts
  });
  const approvalRequest = await appendAgentApprovalRequest(context.paths.approvalPath, request);

  return {
    approved: false,
    result: {
      ok: false,
      status: "pending_approval",
      output: {
        message: "Approval required before this action can execute."
      },
      error: null,
      approvalRequest,
      artifacts: details.artifacts ?? []
    }
  };
}

function defaultCleanupNames() {
  return [
    "dist",
    "build",
    "coverage",
    ".cache",
    ".turbo",
    ".next",
    "tmp",
    "temp",
    "logs",
    "npm-debug.log",
    "yarn-error.log"
  ];
}

function isAllowedCleanupPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const baseName = normalized.split("/").at(-1);
  const allowedNames = new Set(defaultCleanupNames());

  return allowedNames.has(normalized) || allowedNames.has(baseName);
}

function isProtectedCleanupPath(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const baseName = normalized.split("/").at(-1);

  if (normalized === "." || normalized.startsWith(".git") || normalized.startsWith(".clawguard")) {
    return true;
  }

  if (["src", "lib", "app", "pages", "public", "docs", "test", "tests", "examples", "skills"].includes(normalized)) {
    return true;
  }

  return [
    "package.json",
    "package-lock.json",
    "README.md",
    "LICENSE",
    ".env",
    ".env.local",
    ".clawguard.json",
    "SKILL.md"
  ].includes(baseName);
}

function protectedCleanupExamples(workspace) {
  const examples = [
    ".env",
    "src",
    "package.json"
  ];

  return examples.map((candidate) => ({
    path: candidate,
    present: false,
    reason: "Protected by default; cleanup will not propose this path."
  })).filter((item) => {
    const relative = path.relative(workspace, path.resolve(workspace, item.path));
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

function cleanupReason(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  if (["dist", "build", ".next"].some((name) => normalized.endsWith(name))) {
    return "Generated build output.";
  }
  if (["coverage", ".cache", ".turbo", "tmp", "temp"].some((name) => normalized.endsWith(name))) {
    return "Generated cache, test, or temporary output.";
  }
  if (normalized.endsWith(".log")) {
    return "Debug log output.";
  }
  return "Generated or temporary project output.";
}

async function walkFiles(root, workspace, entries, options) {
  if (entries.length >= options.maxEntries) {
    return;
  }

  let stats;
  try {
    stats = await fs.lstat(root);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  entries.push({
    path: relativeToWorkspace(workspace, root),
    type: stats.isDirectory() ? "dir" : "file",
    size: stats.isFile() ? stats.size : undefined
  });

  if (!stats.isDirectory() || options.depth >= options.maxDepth || entries.length >= options.maxEntries) {
    return;
  }

  const children = await fs.readdir(root, { withFileTypes: true });
  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    if ([".git", "node_modules", ".clawguard", "dist", "build", "coverage"].includes(child.name)) {
      continue;
    }
    await walkFiles(path.join(root, child.name), workspace, entries, {
      ...options,
      depth: options.depth + 1
    });
    if (entries.length >= options.maxEntries) {
      return;
    }
  }
}

async function readFileIfPresent(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function createLineDiff(beforeText, afterText) {
  if (beforeText === afterText) {
    return "";
  }

  const before = beforeText.split(/\r?\n/);
  const after = afterText.split(/\r?\n/);
  const lines = ["--- before", "+++ after"];
  const max = Math.max(before.length, after.length);

  for (let index = 0; index < max; index += 1) {
    if (before[index] === after[index]) {
      if (before[index] !== undefined) {
        lines.push(` ${before[index]}`);
      }
      continue;
    }

    if (before[index] !== undefined) {
      lines.push(`-${before[index]}`);
    }
    if (after[index] !== undefined) {
      lines.push(`+${after[index]}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function normalizeShellArgs(args, { allowCommandString }) {
  if (Array.isArray(args.argv)) {
    if (args.argv.length === 0) {
      throw new Error("Shell argv cannot be empty.");
    }
    return args.argv.map((part) => requireString(part, "Shell argv entries must be strings."));
  }

  if (allowCommandString && typeof args.command === "string") {
    return splitCommandForDryRun(args.command);
  }

  if (typeof args.command === "string") {
    throw new Error("shell.execute_approved requires args.argv. Command strings are not executed in v0.2.");
  }

  throw new Error("Shell tool requires args.argv.");
}

function splitCommandForDryRun(command) {
  return command.trim().split(/\s+/).filter(Boolean);
}

function classifyShellArgv(argv) {
  const shellNames = new Set(["sh", "bash", "zsh", "fish", "cmd", "cmd.exe", "powershell", "pwsh"]);
  const commandName = path.basename(argv[0] ?? "");

  if (!argv[0]) {
    return {
      risk: "high",
      allowed: false,
      reason: "Command is empty."
    };
  }

  if (shellNames.has(commandName)) {
    return {
      risk: "critical",
      allowed: false,
      reason: "Shell interpreters are blocked by shell.execute_approved in v0.2."
    };
  }

  if (argv.some((part) => /[;&|`$<>]/.test(part))) {
    return {
      risk: "critical",
      allowed: false,
      reason: "Shell metacharacters are blocked by shell.execute_approved."
    };
  }

  if (argv.some((part) => /^(-rf|-fr|--no-preserve-root)$/.test(part)) || ["rm", "sudo"].includes(commandName)) {
    return {
      risk: "critical",
      allowed: false,
      reason: "Destructive or privilege-changing commands are blocked in v0.2."
    };
  }

  return {
    risk: commandName === "npm" || commandName === "node" ? "medium" : "high",
    allowed: true,
    reason: "Command is argv-only and has no blocked shell metacharacters."
  };
}

async function assertDirectoryHasSkill(source) {
  const stats = await fs.lstat(source);
  if (!stats.isDirectory()) {
    throw new Error("skill.install_guarded source must be a directory.");
  }

  await fs.lstat(path.join(source, "SKILL.md"));
}

async function assertDirectoryHasNoSymlinks(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Skill source contains a symlink: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      await assertDirectoryHasNoSymlinks(entryPath);
    }
  }
}

function requireString(value, message) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(message);
  }
  return value;
}

function clampInteger(value, fallback, min, max) {
  const number = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isSafeInteger(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function limitText(value, maxBytes = 65536) {
  const text = String(value ?? "");
  const buffer = Buffer.from(text);
  if (buffer.length <= maxBytes) {
    return text;
  }
  return `${buffer.subarray(0, maxBytes).toString("utf8")}\n[truncated]`;
}
