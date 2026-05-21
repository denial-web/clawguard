import { promises as fs } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config.js";
import { appendAuditEvent } from "./audit.js";
import { resolveAgentPaths } from "./paths.js";
import { inspectProtectedPath, inspectProtectedShellArgv } from "./protected-assets.js";

const schemaVersion = "clawguard.blastRadiusExplain.v1";
const operations = new Set(["read", "write", "execute", "cleanup"]);
const sideEffectTools = new Set([
  "file.write_safe",
  "project.cleanup_safe",
  "shell.execute_approved",
  "skill.install_guarded",
  "memory.propose",
  "github.issue_create_approved",
  "browser.click_proposed",
  "browser.type_proposed",
  "app.open_proposed",
  "app.action_proposed"
]);

const safeShellCommands = new Set([
  "git",
  "ls",
  "pwd",
  "whoami",
  "node",
  "npm"
]);

export async function explainBlastRadiusCommand(options = {}) {
  const workspace = path.resolve(options.workspace ?? ".");
  const loaded = await loadConfig(workspace, options.configPath);
  const context = {
    workspace,
    configPath: loaded.path,
    agent: loaded.config.agent
  };
  const explanation = createBlastRadiusExplanation(options, context);
  const audit = await appendExplainAuditIfInitialized(explanation, context);
  return audit ? { ...explanation, audit } : explanation;
}

export function createBlastRadiusExplanation(input = {}, context = {}) {
  if (input.proposal) {
    return explainProposal(input.proposal, context);
  }

  if (input.argv?.length > 0) {
    return explainShell(input.argv, context);
  }

  if (input.path) {
    return explainPath(input.path, input.operation ?? "read", context);
  }

  throw new Error("explain requires --argv, --path, or --proposal.");
}

export function explainShell(argv = [], context = {}) {
  const normalizedArgv = argv.map((item) => String(item));
  const raw = normalizedArgv.join(" ");
  const protectedShell = inspectProtectedShellArgv(normalizedArgv, context.agent?.protectedAssets);
  const shellRisk = classifyShellBlastRadius(normalizedArgv);
  const decision = strongestDecision([protectedShell.decision, shellRisk.decision]);
  const risk = strongestRisk([protectedShell.risk, shellRisk.risk]);
  const reasons = uniqueStrings([
    protectedShell.reason,
    shellRisk.reason
  ].filter(Boolean));
  const sideEffects = dedupeSideEffects([
    ...sideEffectsForProtectedShell(protectedShell),
    ...shellRisk.sideEffects
  ]);

  return buildExplanation({
    action: {
      type: "shell",
      summary: shellRisk.summary,
      raw
    },
    matchedAssets: protectedShell.protected ? protectedShell.matches.map((match) => matchedAsset(match, protectedShell.risk)) : [],
    sideEffects,
    blastRadius: mergeBlastRadius([
      blastRadiusForProtectedShell(protectedShell),
      shellRisk.blastRadius
    ]),
    policy: {
      decision,
      risk,
      reasons,
      approvalScope: approvalScopeForDecision(decision, "protected-shell-execution")
    },
    alternatives: alternativesForShell(shellRisk, protectedShell),
    auditReady: true
  });
}

export function explainPath(inputPath, operation = "read", context = {}) {
  const normalizedOperation = operations.has(operation) ? operation : "read";
  const workspace = path.resolve(context.workspace ?? process.cwd());
  const target = path.resolve(workspace, String(inputPath));
  const protectedPath = inspectProtectedPath(workspace, target, normalizedOperation, context.agent?.protectedAssets);
  const workspaceEscape = !isInsideWorkspace(workspace, target);
  const decision = strongestDecision([protectedPath.decision, workspaceEscape ? "approval_required" : "allow"]);
  const risk = strongestRisk([protectedPath.risk, workspaceEscape ? "high" : "low"]);
  const sideEffects = sideEffectsForPath(normalizedOperation, protectedPath);
  if (workspaceEscape) {
    sideEffects.push({
      kind: "workspace_escape",
      scope: target,
      estimatedScale: "unknown_medium"
    });
  }
  const reasons = [protectedPath.reason ?? `${normalizedOperation} is not protected by configured asset policy.`];
  if (workspaceEscape) {
    reasons.push("Path resolves outside the selected workspace.");
  }

  return buildExplanation({
    action: {
      type: "file",
      summary: `${normalizedOperation} ${protectedPath.path ?? String(inputPath)}`,
      raw: String(inputPath)
    },
    matchedAssets: protectedPath.protected ? protectedPath.matches.map((match) => matchedAsset(match, protectedPath.risk)) : [],
    sideEffects,
    blastRadius: blastRadiusForPath(normalizedOperation, protectedPath),
    policy: {
      decision,
      risk,
      reasons,
      approvalScope: approvalScopeForDecision(decision, `protected-${normalizedOperation}`)
    },
    alternatives: alternativesForPath(normalizedOperation, protectedPath),
    auditReady: true
  });
}

export function explainProposal(proposal, context = {}) {
  const tool = proposal.tool;
  let nested;

  if (tool === "shell.execute_approved") {
    nested = explainShell(proposal.args?.argv ?? [], context);
  } else if (tool === "shell.dry_run") {
    nested = explainShell(proposal.args?.argv ?? splitCommand(proposal.args?.command), context);
    nested = {
      ...nested,
      policy: {
        ...nested.policy,
        decision: nested.policy.decision === "block" ? "block" : "allow",
        reasons: uniqueStrings(["shell.dry_run classifies only; it does not execute the command.", ...nested.policy.reasons])
      }
    };
  } else if (["file.read", "file.diff"].includes(tool)) {
    nested = explainPath(proposal.args?.path ?? ".", "read", context);
  } else if (tool === "file.write_safe") {
    nested = explainPath(proposal.args?.path ?? ".", "write", context);
  } else if (tool === "project.cleanup_safe") {
    nested = explainCleanupProposal(proposal, context);
  } else {
    nested = explainGenericToolProposal(proposal, context);
  }

  return {
    ...nested,
    action: {
      type: "tool",
      summary: `${tool}: ${nested.action.summary}`,
      raw: tool
    },
    proposal: {
      id: proposal.id,
      tool,
      risk: proposal.risk,
      task: proposal.task
    }
  };
}

function explainCleanupProposal(proposal, context) {
  const includes = Array.isArray(proposal.args?.include) && proposal.args.include.length > 0
    ? proposal.args.include
    : ["dist", ".cache", "coverage", "tmp"];
  const pathExplanations = includes.map((item) => explainPath(item, "cleanup", context));
  const decision = strongestDecision(pathExplanations.map((item) => item.policy.decision));
  const risk = strongestRisk(pathExplanations.map((item) => item.policy.risk));

  return buildExplanation({
    action: {
      type: "file",
      summary: `cleanup ${includes.length} path candidate(s)`,
      raw: includes.join(", ")
    },
    matchedAssets: pathExplanations.flatMap((item) => item.matchedAssets),
    sideEffects: dedupeSideEffects(pathExplanations.flatMap((item) => item.sideEffects)),
    blastRadius: mergeBlastRadius(pathExplanations.map((item) => item.blastRadius)),
    policy: {
      decision,
      risk,
      reasons: uniqueStrings(pathExplanations.flatMap((item) => item.policy.reasons)),
      approvalScope: approvalScopeForDecision(decision, "cleanup")
    },
    alternatives: [
      "Move cleanup candidates into a backup folder instead of deleting them.",
      "Review the proposed cleanup list before approving.",
      "Keep protected assets out of cleanup include patterns."
    ],
    auditReady: true
  });
}

function explainGenericToolProposal(proposal, context) {
  const tool = proposal.tool;
  const sideEffect = sideEffectTools.has(tool);
  const webUrl = proposal.args?.url ? safeUrl(proposal.args.url) : null;
  const repo = proposal.args?.repo ? String(proposal.args.repo) : null;
  const decision = sideEffect ? "approval_required" : "allow";
  const risk = sideEffect ? strongestRisk([proposal.risk, "high"]) : proposal.risk ?? "low";
  const sideEffects = [];
  const blastRadius = emptyBlastRadius();

  if (tool.startsWith("web.") || tool.startsWith("browser.")) {
    if (webUrl?.hostname) {
      blastRadius.network.egressHosts.push(webUrl.hostname);
    }
    sideEffects.push({
      kind: tool.includes("click") || tool.includes("type") ? "external_interaction" : "network_request",
      scope: webUrl?.hostname ?? "external",
      estimatedScale: sideEffect ? "unknown_high" : "low"
    });
  }

  if (tool.startsWith("github.")) {
    sideEffects.push({
      kind: tool === "github.issue_create_approved" ? "external_write" : "external_read",
      scope: repo ?? "github",
      estimatedScale: tool === "github.issue_create_approved" ? "unknown_medium" : "low"
    });
  }

  if (tool.startsWith("app.")) {
    sideEffects.push({
      kind: "app_action",
      scope: proposal.args?.app ?? "desktop_app",
      estimatedScale: "unknown_high"
    });
  }

  if (tool === "memory.propose") {
    sideEffects.push({
      kind: "durable_memory_candidate",
      scope: proposal.args?.scope ?? "workspace",
      estimatedScale: "medium"
    });
  }

  return buildExplanation({
    action: {
      type: tool.startsWith("web.") || tool.startsWith("browser.") ? "network" : "tool",
      summary: `${tool} proposal`,
      raw: tool
    },
    matchedAssets: [],
    sideEffects,
    blastRadius,
    policy: {
      decision,
      risk,
      reasons: [sideEffect ? `${tool} is approval-gated by ClawGuard policy.` : `${tool} is read-only or draft-only in this proposal.`],
      approvalScope: approvalScopeForDecision(decision, tool)
    },
    alternatives: alternativesForTool(tool),
    auditReady: true
  });
}

function classifyShellBlastRadius(argv) {
  const commandName = path.basename(argv[0] ?? "").toLowerCase();
  const normalized = argv.join(" ").toLowerCase();

  if (!argv[0]) {
    return shellClassification({
      decision: "block",
      risk: "high",
      summary: "empty shell command",
      reason: "Command is empty.",
      sideEffects: [{ kind: "unknown_side_effect", scope: "shell", estimatedScale: "unknown_high" }]
    });
  }

  if (["sh", "bash", "zsh", "fish", "cmd", "cmd.exe", "powershell", "pwsh"].includes(commandName)) {
    return shellClassification({
      decision: "block",
      risk: "critical",
      summary: `runs shell interpreter ${commandName}`,
      reason: "Shell interpreter execution is blocked because it can hide compound side effects.",
      sideEffects: [{ kind: "unknown_side_effect", scope: "shell", estimatedScale: "unknown_high" }]
    });
  }

  if (argv.some((part) => /[;&|`<>]/.test(part)) || argv.some((part) => /\$\(|\$\{/.test(part))) {
    return shellClassification({
      decision: "block",
      risk: "critical",
      summary: "uses shell metacharacters or substitutions",
      reason: "Shell metacharacters or substitutions make blast radius ambiguous.",
      sideEffects: [{ kind: "unknown_side_effect", scope: "shell", estimatedScale: "unknown_high" }]
    });
  }

  if (/\b(base64|openssl\s+enc|xxd|eval)\b/.test(normalized)) {
    return shellClassification({
      decision: "approval_required",
      risk: "critical",
      summary: "uses encoded or dynamic command behavior",
      reason: "Encoded or dynamic command behavior makes blast radius unknown.",
      sideEffects: [{ kind: "unknown_side_effect", scope: "shell", estimatedScale: "unknown_high" }]
    });
  }

  if (commandName === "rm" || /\b(rm\s+-|unlink|rmdir)\b/.test(normalized)) {
    const recursiveDelete = hasRecursiveDeleteFlag(argv);
    return shellClassification({
      decision: "block",
      risk: "critical",
      summary: "deletes local files",
      reason: "Destructive file deletion is blocked by ClawGuard policy.",
      sideEffects: [{ kind: "file_deletion", scope: "filesystem", estimatedScale: recursiveDelete ? "unknown_high" : "unknown_medium" }],
      blastRadius: {
        files: { touched: null, deleted: recursiveDelete ? "unknown_high" : "unknown_medium" }
      }
    });
  }

  if (commandName === "sudo") {
    return shellClassification({
      decision: "block",
      risk: "critical",
      summary: "requests privilege escalation",
      reason: "Privilege-changing commands are blocked by ClawGuard policy.",
      sideEffects: [{ kind: "privilege_escalation", scope: "system", estimatedScale: "unknown_high" }]
    });
  }

  if (safeShellCommands.has(commandName) && isSafeReadOnlyShell(argv)) {
    return shellClassification({
      decision: "allow",
      risk: "low",
      summary: `runs read-only ${commandName}`,
      reason: "Command matches a deterministic read-only shell pattern.",
      sideEffects: []
    });
  }

  return shellClassification({
    decision: "approval_required",
    risk: "high",
    summary: `runs ${commandName}`,
    reason: "Unknown shell command may have side effects and should be reviewed before execution.",
    sideEffects: [{ kind: "unknown_side_effect", scope: "shell", estimatedScale: "unknown_medium" }]
  });
}

function shellClassification(value) {
  return {
    blastRadius: emptyBlastRadius(),
    ...value
  };
}

function isSafeReadOnlyShell(argv) {
  const commandName = path.basename(argv[0] ?? "").toLowerCase();
  const normalized = argv.map((item) => String(item).toLowerCase());
  if (["ls", "pwd", "whoami"].includes(commandName)) return true;
  if (commandName === "git") return ["status", "log", "diff", "show"].includes(normalized[1]);
  if (commandName === "npm") return ["--version", "-v", "view"].includes(normalized[1]);
  if (commandName === "node") return ["--version", "-v"].includes(normalized[1]);
  return false;
}

function hasRecursiveDeleteFlag(argv) {
  return argv.some((part) => {
    const value = String(part);
    if (["--recursive", "-R"].includes(value)) {
      return true;
    }
    if (/^-[A-Za-z]+$/.test(value)) {
      const flags = value.slice(1).toLowerCase();
      return flags.includes("r");
    }
    return false;
  });
}

function sideEffectsForProtectedShell(protectedShell) {
  if (!protectedShell.protected) return [];
  return protectedShell.matches.map((match) => {
    if (match.id === "command:database-destructive") {
      return { kind: "irreversible_data_loss", scope: "database", estimatedScale: "unknown_high" };
    }
    if (match.id === "command:system-destructive") {
      return { kind: "remote_or_system_deletion", scope: "system", estimatedScale: "unknown_high" };
    }
    return { kind: "unknown_side_effect", scope: match.type ?? "system", estimatedScale: "unknown_high" };
  });
}

function blastRadiusForProtectedShell(protectedShell) {
  const radius = emptyBlastRadius();
  if (!protectedShell.protected) return radius;
  if (protectedShell.matches.some((match) => match.id === "command:database-destructive")) {
    radius.rows.estimate = "unknown_high";
  }
  if (protectedShell.matches.some((match) => ["command:system-destructive", "command:inline-delete"].includes(match.id))) {
    radius.files.deleted = "unknown_high";
  }
  return radius;
}

function sideEffectsForPath(operation, protectedPath) {
  if (operation === "read") {
    return protectedPath.protected
      ? [{ kind: "sensitive_data_exposure", scope: protectedPath.path, estimatedScale: protectedPath.risk === "critical" ? "unknown_high" : "unknown_medium" }]
      : [];
  }
  if (operation === "write") {
    return [{ kind: "file_modification", scope: protectedPath.path, estimatedScale: protectedPath.protected ? "unknown_high" : "low" }];
  }
  if (operation === "cleanup") {
    return [{ kind: "file_deletion_or_move", scope: protectedPath.path, estimatedScale: protectedPath.protected ? "unknown_high" : "unknown_medium" }];
  }
  if (operation === "execute") {
    return [{ kind: "code_execution", scope: protectedPath.path, estimatedScale: protectedPath.protected ? "unknown_high" : "unknown_medium" }];
  }
  return [];
}

function blastRadiusForPath(operation, protectedPath) {
  const radius = emptyBlastRadius();
  if (operation === "read") {
    radius.files.touched = 1;
  } else if (operation === "write" || operation === "execute") {
    radius.files.touched = 1;
  } else if (operation === "cleanup") {
    radius.files.deleted = protectedPath.protected ? "unknown_high" : 1;
  }
  return radius;
}

function matchedAsset(match, risk) {
  return {
    id: match.id,
    type: match.type,
    sensitivity: sensitivityFor(match.type, risk),
    decision: match.decision,
    reason: match.reason
  };
}

function sensitivityFor(type, risk) {
  if (["database", "system", "customer_data", "secret"].includes(type)) return "critical";
  return risk === "critical" ? "critical" : risk === "high" ? "high" : "medium";
}

function buildExplanation(value) {
  return {
    schemaVersion,
    action: value.action,
    matchedAssets: value.matchedAssets ?? [],
    sideEffects: value.sideEffects ?? [],
    blastRadius: normalizeBlastRadius(value.blastRadius),
    policy: {
      decision: value.policy.decision,
      risk: value.policy.risk,
      reasons: uniqueStrings(value.policy.reasons ?? []),
      approvalScope: value.policy.approvalScope ?? null
    },
    alternatives: uniqueStrings(value.alternatives ?? []),
    auditReady: value.auditReady === true
  };
}

function emptyBlastRadius() {
  return {
    files: { touched: null, deleted: null },
    rows: { estimate: null },
    network: { egressHosts: [] },
    monetary: { estimate: null }
  };
}

function normalizeBlastRadius(value) {
  return {
    ...emptyBlastRadius(),
    ...value,
    files: {
      ...emptyBlastRadius().files,
      ...(value?.files ?? {})
    },
    rows: {
      ...emptyBlastRadius().rows,
      ...(value?.rows ?? {})
    },
    network: {
      ...emptyBlastRadius().network,
      ...(value?.network ?? {})
    },
    monetary: {
      ...emptyBlastRadius().monetary,
      ...(value?.monetary ?? {})
    }
  };
}

function mergeBlastRadius(items) {
  const merged = emptyBlastRadius();
  for (const item of items.map(normalizeBlastRadius)) {
    merged.files.touched = strongestEstimate([merged.files.touched, item.files.touched]);
    merged.files.deleted = strongestEstimate([merged.files.deleted, item.files.deleted]);
    merged.rows.estimate = strongestEstimate([merged.rows.estimate, item.rows.estimate]);
    merged.network.egressHosts = uniqueStrings([...merged.network.egressHosts, ...item.network.egressHosts]);
    merged.monetary.estimate = strongestEstimate([merged.monetary.estimate, item.monetary.estimate]);
  }
  return merged;
}

function strongestEstimate(values) {
  if (values.includes("unknown_high")) return "unknown_high";
  if (values.includes("unknown_medium")) return "unknown_medium";
  const numbers = values.filter((value) => typeof value === "number");
  if (numbers.length > 0) return Math.max(...numbers);
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function strongestDecision(decisions) {
  const order = ["allow", "approval_required", "block"];
  return decisions.reduce((strongest, item) => order.indexOf(item) > order.indexOf(strongest) ? item : strongest, "allow");
}

function strongestRisk(risks) {
  const order = ["low", "medium", "high", "critical"];
  return risks.reduce((strongest, item) => order.indexOf(item) > order.indexOf(strongest) ? item : strongest, "low");
}

function approvalScopeForDecision(decision, scope) {
  return decision === "approval_required" ? scope : null;
}

function alternativesForShell(shellRisk, protectedShell) {
  if (protectedShell.matches?.some((match) => match.id === "command:database-destructive")) {
    return [
      "Run a read-only inspection first.",
      "Create a backup before destructive database changes.",
      "Use a staging database for destructive testing."
    ];
  }
  if (shellRisk.sideEffects.some((effect) => effect.kind === "file_deletion")) {
    return [
      "Move files into a reviewable backup folder instead of deleting them.",
      "List matching files first.",
      "Require explicit approval for each protected path."
    ];
  }
  if (shellRisk.decision !== "allow") {
    return [
      "Use a read-only dry run first.",
      "Break compound commands into explicit argv-only steps.",
      "Route risky actions through ClawGuard approval."
    ];
  }
  return ["No safer alternative needed for this read-only action."];
}

function alternativesForPath(operation, protectedPath) {
  if (protectedPath.protected) {
    if (operation === "read") {
      return [
        "Request approval before revealing protected content.",
        "Use a redacted summary instead of raw content."
      ];
    }
    if (operation === "write") {
      return [
        "Show a diff and create a backup before writing.",
        "Apply changes to a non-production copy first."
      ];
    }
    if (operation === "cleanup") {
      return [
        "Exclude protected assets from cleanup.",
        "Move generated files only after reviewing the proposed cleanup list."
      ];
    }
  }
  return [`Proceed only if ${operation} is intended and scoped to the workspace.`];
}

function alternativesForTool(tool) {
  if (tool === "github.issue_create_approved") {
    return ["Create a local issue draft first.", "Require repo allowlist and approval before external writes."];
  }
  if (tool.startsWith("browser.") || tool.startsWith("app.")) {
    return ["Use proposal-only mode first.", "Require approval before click, type, submit, payment, or delete actions."];
  }
  if (tool === "memory.propose") {
    return ["Queue memory for review instead of writing durable memory automatically."];
  }
  return ["Review the proposal and require approval for side effects."];
}

function splitCommand(command) {
  return String(command ?? "").trim().split(/\s+/).filter(Boolean);
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isInsideWorkspace(workspace, target) {
  const relative = path.relative(path.resolve(workspace), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function dedupeSideEffects(sideEffects) {
  const seen = new Set();
  const output = [];
  for (const effect of sideEffects) {
    const key = `${effect.kind}:${effect.scope}:${effect.estimatedScale}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(effect);
  }
  return output;
}

async function appendExplainAuditIfInitialized(explanation, context) {
  if (!context.configPath) return null;
  const paths = resolveAgentPaths(context.workspace, context.agent);
  try {
    const stats = await fs.stat(paths.stateDir);
    if (!stats.isDirectory()) return null;
  } catch {
    return null;
  }

  const entry = await appendAuditEvent(paths.auditPath, "explain.created", {
    action: explanation.action,
    policy: explanation.policy,
    matchedAssets: explanation.matchedAssets,
    sideEffects: explanation.sideEffects
  });
  return {
    id: entry.id,
    path: paths.auditPath
  };
}
