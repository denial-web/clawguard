import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { appendAgentApprovalRequest, createAgentApprovalRequest, hashAgentAction, readApprovalRequests, readLatestDecision } from "./approvals.js";
import { resolveToolAutonomy } from "./autonomy.js";
import { proposeAgentMemory, searchAgentMemory } from "./memory.js";
import { relativeToWorkspace, resolveWorkspacePath, safeArtifactName } from "./paths.js";
import { inspectProtectedPath, inspectProtectedShellArgv } from "./protected-assets.js";
import { isBlockedHost } from "../install-url/host.js";
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
  },
  {
    name: "git.status",
    risk: "low",
    approvalRequired: false,
    description: "Read git working tree status without shell execution.",
    schema: { path: "string" }
  },
  {
    name: "git.diff",
    risk: "low",
    approvalRequired: false,
    description: "Read git diff output without shell execution.",
    schema: { path: "string", staged: "boolean", maxBytes: "number" }
  },
  {
    name: "git.log",
    risk: "low",
    approvalRequired: false,
    description: "Read recent git commit summaries without shell execution.",
    schema: { limit: "number" }
  },
  {
    name: "memory.search",
    risk: "low",
    approvalRequired: false,
    description: "Search ClawGuard Agent memory without writing new records.",
    schema: { query: "string", limit: "number", scope: "string" }
  },
  {
    name: "memory.propose",
    risk: "medium",
    approvalRequired: true,
    description: "Propose a durable memory record; approval is required before saving.",
    schema: { type: "string", content: "string", scope: "string", sensitive: "boolean" }
  },
  {
    name: "web.search",
    risk: "low",
    approvalRequired: false,
    description: "Run configured read-only web search using an approved provider.",
    schema: { query: "string", limit: "number" }
  },
  {
    name: "web.fetch",
    risk: "low",
    approvalRequired: false,
    description: "Fetch a public HTTP(S) URL after SSRF and credential checks.",
    schema: { url: "string", maxBytes: "number" }
  },
  {
    name: "github.repo_read",
    risk: "low",
    approvalRequired: false,
    description: "Read GitHub repository metadata, issues, and releases for an allowed repository.",
    schema: { repo: "string", includeIssues: "boolean", includeReleases: "boolean" }
  },
  {
    name: "github.issue_draft",
    risk: "low",
    approvalRequired: false,
    description: "Draft a GitHub issue locally without sending it.",
    schema: { repo: "string", title: "string", body: "string" }
  },
  {
    name: "github.issue_create_approved",
    risk: "high",
    approvalRequired: true,
    description: "Create a GitHub issue only after approval and repo allowlist checks.",
    schema: { repo: "string", title: "string", body: "string", labels: "array" }
  },
  {
    name: "browser.open",
    risk: "low",
    approvalRequired: false,
    description: "Dry-run a governed browser navigation proposal for an external bridge.",
    schema: { url: "string", purpose: "string", allowPrivate: "boolean" }
  },
  {
    name: "browser.extract",
    risk: "low",
    approvalRequired: false,
    description: "Dry-run a governed browser extraction proposal for an external bridge.",
    schema: { url: "string", selector: "string", purpose: "string", allowPrivate: "boolean" }
  },
  {
    name: "browser.click_proposed",
    risk: "medium",
    approvalRequired: true,
    description: "Propose a browser click for approval before any external bridge can execute it.",
    schema: { url: "string", selector: "string", label: "string", intent: "string", allowPrivate: "boolean" }
  },
  {
    name: "browser.type_proposed",
    risk: "medium",
    approvalRequired: true,
    description: "Propose browser text entry for approval before any external bridge can execute it.",
    schema: { url: "string", selector: "string", field: "string", text: "string", allowPrivate: "boolean" }
  },
  {
    name: "app.open_proposed",
    risk: "medium",
    approvalRequired: true,
    description: "Propose opening a local app through an external bridge after approval.",
    schema: { app: "string", purpose: "string" }
  },
  {
    name: "app.action_proposed",
    risk: "high",
    approvalRequired: true,
    description: "Propose a local app action through an external bridge after approval.",
    schema: { app: "string", action: "string", target: "string", purpose: "string" }
  },
  {
    name: "subagent.delegate",
    risk: "medium",
    approvalRequired: false,
    description: "Assign a bounded task to a local ClawGuard subagent profile.",
    schema: { profile: "string", task: "string", maxSteps: "number" }
  }
];

export function listAgentTools() {
  return defaultAgentTools.map((tool) => ({ ...tool }));
}

export async function executeAgentTool(step, context) {
  const autonomy = resolveToolAutonomy(step, context);

  if (autonomy.effectiveMode === "block") {
    return withAutonomy({
      ok: false,
      status: "blocked",
      output: {
        autonomy
      },
      error: autonomy.reason,
      artifacts: []
    }, autonomy);
  }

  if (autonomy.approvalRequired && !autonomy.internalApproval) {
    const approval = await requireApproval(step, context, {
      target: context.paths.workspace,
      destination: context.paths.workspace,
      risk: step.risk ?? "medium",
      reason: autonomy.reason,
      requiredActions: ["review-autonomy-policy", "approve-tool-execution"],
      artifacts: [{
        type: "tool-autonomy",
        autonomy
      }]
    });

    if (!approval.approved) {
      return withAutonomy(approval.result, autonomy);
    }
  }

  return withAutonomy(await executeAgentToolUnchecked(step, context), autonomy);
}

async function executeAgentToolUnchecked(step, context) {
  if (step.tool === "file.list") {
    return listFiles(step.args, context);
  }

  if (step.tool === "file.read") {
    return readFile(step, context);
  }

  if (step.tool === "file.diff") {
    return diffFile(step, context);
  }

  if (step.tool === "file.write_safe") {
    return writeFileSafe(step, context);
  }

  if (step.tool === "project.cleanup_safe") {
    return cleanupProjectSafe(step, context);
  }

  if (step.tool === "shell.dry_run") {
    return dryRunShell(step.args, context);
  }

  if (step.tool === "shell.execute_approved") {
    return executeApprovedShell(step, context);
  }

  if (step.tool === "skill.install_guarded") {
    return installGuardedSkill(step, context);
  }

  if (step.tool === "git.status") {
    return gitStatus(step.args, context);
  }

  if (step.tool === "git.diff") {
    return gitDiff(step.args, context);
  }

  if (step.tool === "git.log") {
    return gitLog(step.args, context);
  }

  if (step.tool === "memory.search") {
    return memorySearch(step.args, context);
  }

  if (step.tool === "memory.propose") {
    return proposeAgentMemory(step.args, context);
  }

  if (step.tool === "web.search") {
    return webSearch(step.args, context);
  }

  if (step.tool === "web.fetch") {
    return webFetch(step.args, context);
  }

  if (step.tool === "github.repo_read") {
    return githubRepoRead(step.args, context);
  }

  if (step.tool === "github.issue_draft") {
    return githubIssueDraft(step.args, context);
  }

  if (step.tool === "github.issue_create_approved") {
    return githubIssueCreateApproved(step, context);
  }

  if (["browser.open", "browser.extract"].includes(step.tool)) {
    return browserBridgeDryRun(step, context);
  }

  if (["browser.click_proposed", "browser.type_proposed", "app.open_proposed", "app.action_proposed"].includes(step.tool)) {
    return browserAppBridgeApprovedDryRun(step, context);
  }

  if (step.tool === "subagent.delegate") {
    return {
      ok: false,
      status: "blocked",
      output: null,
      error: "subagent.delegate is available through `clawguard agent delegate` and parent runtime orchestration.",
      artifacts: []
    };
  }

  return {
    ok: false,
    output: "",
    error: `Unknown tool: ${step.tool}`,
    artifacts: []
  };
}

function withAutonomy(result, autonomy) {
  return {
    ...result,
    autonomy,
    artifacts: [
      ...(Array.isArray(result.artifacts) ? result.artifacts : []),
      {
        type: "tool-autonomy",
        autonomy
      }
    ]
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

async function readFile(step, context) {
  const args = step.args;
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

  if (args.optional) {
    try {
      await fs.lstat(target);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {
          ok: true,
          output: null,
          error: null,
          artifacts: []
        };
      }
      throw error;
    }
  }

  const protectedAsset = inspectProtectedPath(context.paths.workspace, target, "read", context.agent.protectedAssets);
  const protectedDecision = await resolveProtectedAssetDecision(step, context, protectedAsset, {
    target,
    destination: target,
    reason: "Read protected asset content.",
    requiredActions: ["review-protected-asset", "approve-protected-read"]
  });

  if (!protectedDecision.approved) {
    return protectedDecision.result;
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
  } finally {
    await handle?.close();
  }
}

async function diffFile(step, context) {
  const args = step.args;
  const target = await resolveWorkspacePath(context.paths.workspace, requireString(args.path, "file.diff requires args.path"), {
    optional: true
  });
  const proposed = requireString(args.content, "file.diff requires args.content");
  const protectedAsset = inspectProtectedPath(context.paths.workspace, target, "read", context.agent.protectedAssets);
  const protectedDecision = await resolveProtectedAssetDecision(step, context, protectedAsset, {
    target,
    destination: target,
    reason: "Preview diff for protected asset content.",
    requiredActions: ["review-protected-asset", "approve-protected-diff"]
  });

  if (!protectedDecision.approved) {
    return protectedDecision.result;
  }

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
  if (attemptsAutoWriteMemoryEnable(target, context.paths.workspace, content)) {
    return {
      ok: false,
      output: null,
      error: "file.write_safe cannot enable agent.autoWriteMemory. Edit .clawguard.json manually if you intentionally want this local workspace setting.",
      artifacts: []
    };
  }
  if (attemptsToolAutonomyChange(target, context.paths.workspace, content)) {
    return {
      ok: false,
      output: null,
      error: "file.write_safe cannot change agent.toolAutonomy. Use `clawguard agent autonomy` or setup-ui so safety-floor validation is applied.",
      artifacts: []
    };
  }
  const protectedAsset = inspectProtectedPath(context.paths.workspace, target, "write", context.agent.protectedAssets);
  const protectedDecision = await resolveProtectedAssetDecision(step, context, protectedAsset, {
    target,
    destination: target,
    reason: protectedAsset.protected ? protectedAsset.reason : "Write protected asset content.",
    requiredActions: ["review-protected-asset", "approve-protected-write"]
  });

  if (!protectedDecision.approved) {
    return protectedDecision.result;
  }

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
    risk: protectedAsset.protected ? protectedAsset.risk : "medium",
    reason: protectedAsset.protected ? protectedAsset.reason : step.reason,
    requiredActions: protectedAsset.protected
      ? ["review-protected-asset", "review-diff", "approve-protected-write"]
      : ["review-diff", "approve-write"],
    artifacts: [
      {
        type: "proposed-file",
        path: proposedPath
      },
      {
        type: "diff",
        path: relativeToWorkspace(context.paths.workspace, target),
        diff
      },
      protectedAssetArtifact(protectedAsset)
    ].filter(Boolean)
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

function dryRunShell(args, context) {
  const argv = normalizeShellArgs(args, { allowCommandString: true });
  const classification = classifyShellArgv(argv);
  const protectedShell = inspectProtectedShellArgv(argv, context.agent.protectedAssets);

  return {
    ok: true,
    output: {
      argv,
      risk: protectedShell.protected ? protectedShell.risk : classification.risk,
      allowedForExecution: classification.allowed && protectedShell.decision !== "block",
      reason: protectedShell.protected ? protectedShell.reason : classification.reason,
      protectedAsset: protectedShell.protected ? protectedShell : undefined,
      executed: false
    },
    error: null,
    artifacts: []
  };
}

async function executeApprovedShell(step, context) {
  const argv = normalizeShellArgs(step.args, { allowCommandString: false });
  const classification = classifyShellArgv(argv);
  const protectedShell = inspectProtectedShellArgv(argv, context.agent.protectedAssets);

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

  if (protectedShell.protected && protectedShell.decision === "block") {
    return {
      ok: false,
      output: {
        argv,
        risk: protectedShell.risk,
        protectedAsset: protectedShell
      },
      error: protectedShell.reason,
      artifacts: []
    };
  }

  const cwd = await resolveWorkspacePath(context.paths.workspace, step.args.cwd ?? ".", { optional: true });
  const approval = await requireApproval(step, context, {
    target: cwd,
    destination: cwd,
    risk: protectedShell.protected ? protectedShell.risk : "high",
    reason: protectedShell.protected ? protectedShell.reason : `Execute command: ${argv.join(" ")}`,
    requiredActions: protectedShell.protected
      ? ["review-protected-asset", "dry-run-first", "approve-protected-shell-execution"]
      : ["dry-run-first", "approve-shell-execution"],
    artifacts: [
      { type: "argv", argv },
      protectedShell.protected ? { type: "protected-shell-command", ...protectedShell } : null
    ].filter(Boolean)
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

async function gitStatus(args, context) {
  const cwd = await resolveWorkspacePath(context.paths.workspace, args.path ?? ".", { optional: true });
  const output = await runGit(["status", "--short", "--branch"], cwd, context);

  return {
    ok: true,
    output: {
      cwd: relativeToWorkspace(context.paths.workspace, cwd),
      stdout: output.stdout
    },
    error: null,
    artifacts: []
  };
}

async function gitDiff(args, context) {
  const cwd = await resolveWorkspacePath(context.paths.workspace, ".", { optional: true });
  const argv = ["diff"];
  if (args.staged) {
    argv.push("--staged");
  }
  if (args.path) {
    const target = await resolveWorkspacePath(context.paths.workspace, args.path, { optional: true });
    argv.push("--", relativeToWorkspace(context.paths.workspace, target));
  }
  const output = await runGit(argv, cwd, context, {
    maxBufferBytes: clampInteger(args.maxBytes, context.agent.shellMaxBufferBytes, 4096, 1024 * 1024)
  });

  return {
    ok: true,
    output: {
      staged: Boolean(args.staged),
      path: args.path ? String(args.path) : null,
      stdout: output.stdout
    },
    error: null,
    artifacts: []
  };
}

async function gitLog(args, context) {
  const limit = clampInteger(args.limit, 10, 1, 50);
  const output = await runGit(["log", "--oneline", `-${limit}`], context.paths.workspace, context);

  return {
    ok: true,
    output: {
      limit,
      stdout: output.stdout
    },
    error: null,
    artifacts: []
  };
}

async function memorySearch(args, context) {
  const records = await searchAgentMemory(
    context.paths.memoryPath,
    requireString(args.query, "memory.search requires args.query"),
    {
      limit: clampInteger(args.limit, 10, 1, 50),
      scope: args.scope
    }
  );

  return {
    ok: true,
    output: {
      query: args.query,
      records
    },
    error: null,
    artifacts: []
  };
}

async function webSearch(args, context) {
  const query = requireString(args.query, "web.search requires args.query");
  const limit = clampInteger(args.limit, 5, 1, 10);
  const config = context.agent.integrations?.webSearch ?? {};
  const provider = String(config.provider ?? "").toLowerCase();

  if (!provider) {
    throw new Error("web.search is disabled. Configure agent.integrations.webSearch.provider.");
  }

  if (provider === "mock") {
    return {
      ok: true,
      output: {
        provider,
        query,
        results: [{
          title: `Mock search result for ${query}`,
          url: "https://example.com/mock-result",
          snippet: "Deterministic mock result for ClawGuard Agent tests."
        }].slice(0, limit)
      },
      error: null,
      artifacts: []
    };
  }

  const apiKey = apiKeyFromEnv(config.apiKeyEnv);
  if (!apiKey) {
    throw new Error(`web.search provider ${provider} requires ${config.apiKeyEnv || "an apiKeyEnv"} to be set.`);
  }

  const results = await callSearchProvider(provider, query, limit, config, apiKey);
  return {
    ok: true,
    output: {
      provider,
      query,
      results
    },
    error: null,
    artifacts: []
  };
}

async function webFetch(args, context) {
  const config = context.agent.integrations?.webFetch ?? {};
  const provider = context.agent.integrations?.webSearch?.provider;
  if (!config.enabled && provider !== "mock") {
    throw new Error("web.fetch is disabled. Set agent.integrations.webFetch.enabled to true.");
  }

  const target = validatePublicHttpUrl(requireString(args.url, "web.fetch requires args.url"));
  const maxBytes = clampInteger(args.maxBytes, config.maxBytes ?? 65536, 1, Math.min(config.maxBytes ?? 65536, 512 * 1024));

  if (provider === "mock") {
    return {
      ok: true,
      output: {
        url: target.href,
        status: 200,
        contentType: "text/plain",
        bytesRead: 34,
        truncated: false,
        content: "Mock ClawGuard Agent fetch content."
      },
      error: null,
      artifacts: []
    };
  }

  const { response, finalUrl } = await fetchPublicHttpUrl(target);
  const contentType = response.headers.get("content-type") ?? "";
  const text = await readLimitedResponseText(response, maxBytes);

  return {
    ok: response.ok,
    output: {
      url: finalUrl,
      status: response.status,
      contentType,
      bytesRead: Buffer.byteLength(text.content),
      truncated: text.truncated,
      content: text.content
    },
    error: response.ok ? null : `HTTP ${response.status}`,
    artifacts: []
  };
}

async function fetchPublicHttpUrl(initialUrl, options = {}) {
  let current = validatePublicHttpUrl(initialUrl.href ?? initialUrl);
  const maxRedirects = Math.min(Math.max(Number(options.maxRedirects ?? 5), 0), 10);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetch(current, { redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current.href };
    }

    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: current.href };
    }

    current = validatePublicHttpUrl(new URL(location, current).href);
  }

  throw new Error("web.fetch blocked a redirect loop.");
}

async function githubRepoRead(args, context) {
  const repo = normalizeRepo(requireString(args.repo, "github.repo_read requires args.repo"));
  assertAllowedRepo(repo, context);
  const config = context.agent.integrations?.github ?? {};

  if (config.mock) {
    return {
      ok: true,
      output: {
        repo,
        metadata: { full_name: repo, private: false, mock: true },
        issues: args.includeIssues === false ? [] : [{ number: 1, title: "Mock issue", state: "open" }],
        releases: args.includeReleases === false ? [] : [{ tag_name: "v0.0.0", name: "Mock release" }]
      },
      error: null,
      artifacts: []
    };
  }

  const token = githubToken(config);
  const metadata = await githubJson(`/repos/${repo}`, config, token);
  const issues = args.includeIssues === false ? [] : await githubJson(`/repos/${repo}/issues?state=open&per_page=10`, config, token);
  const releases = args.includeReleases === false ? [] : await githubJson(`/repos/${repo}/releases?per_page=10`, config, token);

  return {
    ok: true,
    output: { repo, metadata, issues, releases },
    error: null,
    artifacts: []
  };
}

async function githubIssueDraft(args, context) {
  const repo = normalizeRepo(requireString(args.repo, "github.issue_draft requires args.repo"));
  const title = requireString(args.title, "github.issue_draft requires args.title");
  const body = requireString(args.body, "github.issue_draft requires args.body");
  const draftPath = path.join(context.paths.proposedDir, `${context.sessionId}-github-issue-${safeArtifactName(repo)}.md`);
  const content = [
    `# ${title}`,
    "",
    `Repository: ${repo}`,
    "",
    body,
    ""
  ].join("\n");

  await fs.mkdir(path.dirname(draftPath), { recursive: true });
  await fs.writeFile(draftPath, content);

  return {
    ok: true,
    output: {
      repo,
      title,
      draftPath
    },
    error: null,
    artifacts: [draftPath]
  };
}

async function githubIssueCreateApproved(step, context) {
  const repo = normalizeRepo(requireString(step.args.repo, "github.issue_create_approved requires args.repo"));
  assertAllowedRepo(repo, context);
  const title = requireString(step.args.title, "github.issue_create_approved requires args.title");
  const body = requireString(step.args.body, "github.issue_create_approved requires args.body");
  const labels = Array.isArray(step.args.labels) ? step.args.labels.map((label) => String(label)) : [];
  const approval = await requireApproval(step, context, {
    target: context.paths.workspace,
    destination: context.paths.workspace,
    risk: "high",
    reason: `Create GitHub issue in ${repo}: ${title}`,
    requiredActions: ["review-issue-draft", "approve-external-write"],
    artifacts: [{ type: "github-issue", repo, title, body, labels }]
  });

  if (!approval.approved) {
    return approval.result;
  }

  const config = context.agent.integrations?.github ?? {};
  if (config.mock) {
    return {
      ok: true,
      output: {
        repo,
        issue: {
          number: 1,
          html_url: `https://github.com/${repo}/issues/1`,
          title,
          labels,
          mock: true
        }
      },
      error: null,
      artifacts: []
    };
  }

  const token = githubToken(config);
  const issue = await githubJson(`/repos/${repo}/issues`, config, token, {
    method: "POST",
    body: JSON.stringify({ title, body, labels })
  });

  return {
    ok: true,
    output: { repo, issue },
    error: null,
    artifacts: []
  };
}

async function browserBridgeDryRun(step) {
  return {
    ok: true,
    output: {
      mode: "dry_run",
      bridgeRequired: true,
      actionId: step.id,
      tool: step.tool,
      args: redactBridgeArgs(step.args),
      message: "ClawGuard validated this browser proposal. No browser action was executed by ClawGuard core."
    },
    error: null,
    artifacts: []
  };
}

async function browserAppBridgeApprovedDryRun(step, context) {
  const approval = await requireApproval(step, context, {
    target: step.args.url ?? step.args.app ?? context.paths.workspace,
    destination: "external-bridge",
    risk: step.risk,
    reason: step.reason,
    requiredActions: requiredBridgeActions(step),
    artifacts: [{
      type: "bridge-action-proposal",
      actionId: step.id,
      tool: step.tool,
      args: redactBridgeArgs(step.args)
    }]
  });

  if (!approval.approved) {
    return approval.result;
  }

  return {
    ok: true,
    output: {
      mode: "approved_dry_run",
      bridgeRequired: true,
      actionId: step.id,
      tool: step.tool,
      args: redactBridgeArgs(step.args),
      approvalDecision: approval.decision,
      message: "Approval was recorded. ClawGuard core still did not execute browser or app control; an external bridge must execute only this approved action id."
    },
    error: null,
    artifacts: []
  };
}

function requiredBridgeActions(step) {
  if (step.tool === "browser.click_proposed") {
    return ["review-selector", "confirm-click-intent", "approve-browser-bridge-action"];
  }
  if (step.tool === "browser.type_proposed") {
    return ["review-field", "confirm-text-is-non-sensitive", "approve-browser-bridge-action"];
  }
  if (step.tool === "app.open_proposed") {
    return ["review-app", "approve-app-bridge-action"];
  }
  return ["review-app-action", "approve-app-bridge-action"];
}

function redactBridgeArgs(args = {}) {
  const redacted = {};
  for (const [key, value] of Object.entries(args)) {
    if (/password|token|secret|seed|privateKey|apiKey|credential/i.test(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
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

    const protectedAsset = inspectProtectedPath(context.paths.workspace, target, "cleanup", context.agent.protectedAssets);
    if (protectedAsset.protected) {
      blocked.push({
        path: relativePath,
        reason: protectedAsset.reason,
        protectedAsset
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

async function resolveProtectedAssetDecision(step, context, protectedAsset, details) {
  const blocked = protectedAssetBlockResult(protectedAsset);
  if (blocked) {
    return {
      approved: false,
      result: blocked
    };
  }

  if (!protectedAsset.protected) {
    return {
      approved: true
    };
  }

  return await requireApproval(step, context, {
    ...details,
    risk: protectedAsset.risk,
    reason: protectedAsset.reason,
    artifacts: [
      protectedAssetArtifact(protectedAsset)
    ].filter(Boolean)
  });
}

function protectedAssetBlockResult(protectedAsset) {
  if (!protectedAsset.protected || protectedAsset.decision !== "block") {
    return null;
  }

  return {
    ok: false,
    status: "blocked",
    output: {
      protectedAsset
    },
    error: protectedAsset.reason,
    artifacts: [protectedAssetArtifact(protectedAsset)].filter(Boolean)
  };
}

function protectedAssetArtifact(protectedAsset) {
  if (!protectedAsset.protected) {
    return null;
  }

  return {
    type: "protected-asset",
    operation: protectedAsset.operation,
    path: protectedAsset.path,
    decision: protectedAsset.decision,
    risk: protectedAsset.risk,
    matches: protectedAsset.matches
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

    const approval = await findApprovalRequest(context.paths.approvalPath, context.approvalId);
    const mismatch = validateApprovalScope(approval, context.approvalId, step, details);
    if (mismatch) {
      return {
        approved: false,
        result: {
          ok: false,
          status: "blocked",
          output: null,
          error: mismatch,
          approvalDecision: decision,
          artifacts: []
        }
      };
    }

    return {
      approved: true,
      decision,
      approval
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

async function findApprovalRequest(approvalPath, approvalId) {
  const approvals = await readApprovalRequests(approvalPath);
  return approvals.find((approval) => approval.id === approvalId) ?? null;
}

function validateApprovalScope(approval, approvalId, step, details) {
  if (!approval) {
    return `No approval request found for approval ${approvalId}.`;
  }

  const approvedTool = approval.agentAction?.tool;
  if (approvedTool && approvedTool !== step.tool) {
    return `Approval ${approval.id} is for ${approvedTool}, not ${step.tool}.`;
  }

  if (approval.target && details.target && path.resolve(approval.target) !== path.resolve(details.target)) {
    return `Approval ${approval.id} target does not match this action.`;
  }

  if (approval.destination && details.destination && path.resolve(approval.destination) !== path.resolve(details.destination)) {
    return `Approval ${approval.id} destination does not match this action.`;
  }

  const approvedActionHash = approval.actionHash ?? approval.agentAction?.actionHash;
  if (approvedActionHash) {
    const currentActionHash = hashAgentAction({
      tool: step.tool,
      args: step.args,
      target: details.target,
      destination: details.destination
    });
    if (approvedActionHash !== currentActionHash) {
      return `Approval ${approval.id} action hash does not match this action.`;
    }
  }

  return null;
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
    throw new Error("shell.execute_approved requires args.argv. Command strings are not executed in v0.3.");
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
      reason: "Shell interpreters are blocked by shell.execute_approved in v0.3."
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
      reason: "Destructive or privilege-changing commands are blocked in v0.3."
    };
  }

  return {
    risk: commandName === "npm" || commandName === "node" ? "medium" : "high",
    allowed: true,
    reason: "Command is argv-only and has no blocked shell metacharacters."
  };
}

async function runGit(args, cwd, context, options = {}) {
  const maxBuffer = options.maxBufferBytes ?? context.agent.shellMaxBufferBytes;
  try {
    const output = await execFileAsync("git", args, {
      cwd,
      timeout: 10000,
      maxBuffer
    });
    return {
      exitCode: 0,
      stdout: limitText(output.stdout, context.agent.outputLimitBytes),
      stderr: limitText(output.stderr, context.agent.outputLimitBytes)
    };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      stdout: limitText(error.stdout, context.agent.outputLimitBytes),
      stderr: limitText(error.stderr || error.message, context.agent.outputLimitBytes)
    };
  }
}

async function callSearchProvider(provider, query, limit, config, apiKey) {
  if (provider === "brave") {
    const baseUrl = config.baseUrl ?? "https://api.search.brave.com/res/v1/web/search";
    const url = new URL(baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(limit));
    const data = await fetchJson(url, { "x-subscription-token": apiKey });
    return (data.web?.results ?? []).slice(0, limit).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.description ?? ""
    }));
  }

  if (provider === "tavily") {
    const response = await fetch(config.baseUrl ?? "https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: limit })
    });
    const data = await readToolJson(response);
    return (data.results ?? []).slice(0, limit).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content ?? ""
    }));
  }

  if (provider === "serper") {
    const response = await fetch(config.baseUrl ?? "https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({ q: query, num: limit })
    });
    const data = await readToolJson(response);
    return (data.organic ?? []).slice(0, limit).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet ?? ""
    }));
  }

  throw new Error(`Unsupported web.search provider: ${provider}. Use brave, tavily, serper, or mock.`);
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  return readToolJson(response);
}

async function readToolJson(response) {
  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

function apiKeyFromEnv(name) {
  if (!name) {
    return null;
  }
  return process.env[String(name)] ?? null;
}

function validatePublicHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("web.fetch requires a valid URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("web.fetch only allows http and https URLs.");
  }

  if (url.username || url.password) {
    throw new Error("web.fetch blocks URLs containing credentials.");
  }

  if (isBlockedHost(url.hostname)) {
    throw new Error("web.fetch blocks localhost, private, and link-local addresses.");
  }

  return url;
}

async function readLimitedResponseText(response, maxBytes) {
  const text = await response.text();
  const buffer = Buffer.from(text);
  if (buffer.length <= maxBytes) {
    return {
      content: text,
      truncated: false
    };
  }
  return {
    content: buffer.subarray(0, maxBytes).toString("utf8"),
    truncated: true
  };
}

function normalizeRepo(value) {
  const repo = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repo)) {
    throw new Error("GitHub repo must use owner/name format.");
  }
  return repo;
}

function assertAllowedRepo(repo, context) {
  const allowed = context.agent.integrations?.github?.allowedRepos ?? [];
  if (!allowed.includes(repo)) {
    throw new Error(`GitHub repo is not in agent.integrations.github.allowedRepos: ${repo}`);
  }
}

function githubToken(config) {
  const token = process.env[config.tokenEnv ?? "GITHUB_TOKEN"];
  if (!token) {
    throw new Error(`GitHub integration requires ${config.tokenEnv ?? "GITHUB_TOKEN"}.`);
  }
  return token;
}

async function githubJson(pathname, config, token, init = {}) {
  const base = String(config.apiBase ?? "https://api.github.com").replace(/\/$/, "");
  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  return readToolJson(response);
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

function attemptsAutoWriteMemoryEnable(target, workspace, content) {
  if (relativeToWorkspace(workspace, target) !== ".clawguard.json") {
    return false;
  }

  try {
    const parsed = JSON.parse(String(content ?? ""));
    return parsed?.agent?.autoWriteMemory === true || parsed?.autoWriteMemory === true;
  } catch {
    return /"autoWriteMemory"\s*:\s*true/.test(String(content ?? ""));
  }
}

function attemptsToolAutonomyChange(target, workspace, content) {
  if (relativeToWorkspace(workspace, target) !== ".clawguard.json") {
    return false;
  }

  try {
    const parsed = JSON.parse(String(content ?? ""));
    return parsed?.agent?.toolAutonomy !== undefined || parsed?.toolAutonomy !== undefined;
  } catch {
    return /"toolAutonomy"\s*:/.test(String(content ?? ""));
  }
}
