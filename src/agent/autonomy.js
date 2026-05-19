import path from "node:path";
import { inspectProtectedPath, inspectProtectedShellArgv } from "./protected-assets.js";

export const autonomyPresets = ["personal", "developer", "business", "strict"];
export const autonomyModes = ["auto", "approval", "block"];

const lockedApprovalTools = new Set([
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

const safeToolPolicies = {
  "file.list": {
    family: "local-read",
    description: "List workspace files."
  },
  "file.read": {
    family: "local-read",
    description: "Read workspace file content."
  },
  "file.diff": {
    family: "local-read",
    description: "Preview a workspace file diff."
  },
  "git.status": {
    family: "git-read",
    description: "Read git working tree status."
  },
  "git.diff": {
    family: "git-read",
    description: "Read git diff output."
  },
  "git.log": {
    family: "git-read",
    description: "Read recent git commits."
  },
  "memory.search": {
    family: "memory-read",
    description: "Search governed memory without writing."
  },
  "web.search": {
    family: "web-read",
    description: "Search configured public web provider."
  },
  "web.fetch": {
    family: "web-read",
    description: "Fetch a public HTTP(S) URL."
  },
  "github.repo_read": {
    family: "github-read",
    description: "Read allowed GitHub repository data."
  },
  "github.issue_draft": {
    family: "github-draft",
    description: "Draft a local GitHub issue without sending."
  },
  "browser.open": {
    family: "bridge-dry-run",
    description: "Validate a browser navigation proposal without executing it."
  },
  "browser.extract": {
    family: "bridge-dry-run",
    description: "Validate a browser extraction proposal without executing it."
  },
  "shell.dry_run": {
    family: "dry-run",
    description: "Classify a command without executing it."
  },
  "subagent.delegate": {
    family: "delegate",
    description: "Assign a bounded local subagent task."
  }
};

const presetModes = {
  personal: {
    "local-read": "auto",
    "git-read": "auto",
    "memory-read": "auto",
    "web-read": "auto",
    "github-read": "auto",
    "github-draft": "auto",
    "bridge-dry-run": "auto",
    "dry-run": "auto",
    "delegate": "approval"
  },
  developer: {
    "local-read": "auto",
    "git-read": "auto",
    "memory-read": "auto",
    "web-read": "auto",
    "github-read": "auto",
    "github-draft": "auto",
    "bridge-dry-run": "auto",
    "dry-run": "auto",
    "delegate": "auto"
  },
  business: {
    "local-read": "auto",
    "git-read": "auto",
    "memory-read": "auto",
    "web-read": "approval",
    "github-read": "approval",
    "github-draft": "approval",
    "bridge-dry-run": "approval",
    "dry-run": "auto",
    "delegate": "approval"
  },
  strict: {
    "local-read": "approval",
    "git-read": "approval",
    "memory-read": "approval",
    "web-read": "approval",
    "github-read": "approval",
    "github-draft": "approval",
    "bridge-dry-run": "approval",
    "dry-run": "approval",
    "delegate": "approval"
  }
};

export function normalizeToolAutonomyConfig(value = {}) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const preset = normalizeAutonomyPreset(raw.preset ?? "developer");
  const overrides = {};

  if (raw.overrides !== undefined) {
    if (!raw.overrides || typeof raw.overrides !== "object" || Array.isArray(raw.overrides)) {
      throw new Error("Invalid agent.toolAutonomy.overrides: expected an object.");
    }

    for (const [tool, mode] of Object.entries(raw.overrides)) {
      const toolName = String(tool).trim();
      if (!toolName) {
        continue;
      }
      overrides[toolName] = normalizeAutonomyMode(mode, `agent.toolAutonomy.overrides.${toolName}`);
    }
  }

  return { preset, overrides };
}

export function normalizeAutonomyPreset(value) {
  const preset = String(value ?? "developer").trim().toLowerCase();
  if (!autonomyPresets.includes(preset)) {
    throw new Error(`Invalid autonomy preset: ${preset}. Use one of: ${autonomyPresets.join(", ")}`);
  }
  return preset;
}

export function normalizeAutonomyMode(value, label = "autonomy mode") {
  const mode = String(value ?? "").trim().toLowerCase();
  if (!autonomyModes.includes(mode)) {
    throw new Error(`Invalid ${label}: ${mode || "(empty)"}. Use one of: ${autonomyModes.join(", ")}`);
  }
  return mode;
}

export function listAutonomyToolPolicies(agentConfig = {}) {
  const autonomy = normalizeToolAutonomyConfig(agentConfig.toolAutonomy);
  return Object.entries({
    ...safeToolPolicies,
    ...Object.fromEntries([...lockedApprovalTools].map((tool) => [tool, { family: "locked", description: "High-risk tool with locked approval." }]))
  }).map(([tool, policy]) => {
    const decision = resolveToolAutonomy({ tool, args: {}, risk: "low" }, {
      agent: { ...agentConfig, toolAutonomy: autonomy },
      paths: { workspace: process.cwd() }
    });
    return {
      tool,
      family: policy.family,
      description: policy.description,
      eligible: Boolean(safeToolPolicies[tool]),
      locked: lockedApprovalTools.has(tool),
      mode: decision.effectiveMode,
      approvalRequired: decision.approvalRequired,
      reason: decision.reason
    };
  }).sort((left, right) => left.tool.localeCompare(right.tool));
}

export function canOverrideToolAutonomy(tool) {
  return Boolean(safeToolPolicies[tool]) && !lockedApprovalTools.has(tool);
}

export function isLockedApprovalTool(tool) {
  return lockedApprovalTools.has(tool);
}

export function resolveToolAutonomy(step, context = {}) {
  const tool = String(step?.tool ?? "");
  const autonomy = normalizeToolAutonomyConfig(context.agent?.toolAutonomy);
  const preset = autonomy.preset;
  const base = baseDecision(tool, step, context, preset);
  const requestedMode = autonomy.overrides?.[tool] ?? base.effectiveMode;

  let decision = {
    schemaVersion: "clawguard.toolAutonomyDecision.v1",
    tool,
    preset,
    requestedMode,
    effectiveMode: requestedMode,
    approvalRequired: requestedMode === "approval",
    internalApproval: false,
    eligible: Boolean(safeToolPolicies[tool]),
    locked: false,
    reason: `${tool} uses ${requestedMode} from the ${preset} preset.`
  };

  if (base.force) {
    decision = {
      ...decision,
      ...base,
      requestedMode,
      reason: base.reason
    };
  } else if (!canOverrideToolAutonomy(tool)) {
    decision = {
      ...decision,
      ...base,
      requestedMode,
      reason: base.reason
    };
  }

  if (!autonomyModes.includes(decision.effectiveMode)) {
    decision.effectiveMode = "approval";
    decision.approvalRequired = true;
    decision.reason = "Unknown autonomy mode resolved to approval.";
  }

  const protectedDecision = resolveProtectedAutonomy(step, context);
  if (protectedDecision) {
    return {
      ...decision,
      ...protectedDecision,
      requestedMode,
      preset,
      tool,
      schemaVersion: "clawguard.toolAutonomyDecision.v1"
    };
  }

  return decision;
}

function baseDecision(tool, step, context, preset) {
  if (lockedApprovalTools.has(tool)) {
    return {
      effectiveMode: "approval",
      approvalRequired: true,
      internalApproval: true,
      eligible: false,
      locked: true,
      force: true,
      reason: `${tool} is locked behind its built-in approval flow.`
    };
  }

  const policy = safeToolPolicies[tool];
  if (!policy) {
    return {
      effectiveMode: "block",
      approvalRequired: false,
      internalApproval: false,
      eligible: false,
      locked: true,
      force: true,
      reason: `${tool || "Unknown tool"} is not eligible for autonomy.`
    };
  }

  if (context.subagent && !context.subagent.allowedTools?.has?.(tool)) {
    return {
      effectiveMode: "block",
      approvalRequired: false,
      internalApproval: false,
      eligible: true,
      locked: true,
      force: true,
      reason: `Subagent profile ${context.subagent.profile} is not allowed to use ${tool}.`
    };
  }

  if (context.subagent && tool === "subagent.delegate") {
    return {
      effectiveMode: "block",
      approvalRequired: false,
      internalApproval: false,
      eligible: true,
      locked: true,
      force: true,
      reason: "Nested subagents are disabled in beta."
    };
  }

  const mode = presetModes[preset]?.[policy.family] ?? "approval";
  return {
    effectiveMode: mode,
    approvalRequired: mode === "approval",
    internalApproval: false,
    eligible: true,
    locked: false,
    reason: `${policy.description} ${mode === "auto" ? "Allowed automatically" : mode === "block" ? "Blocked" : "Requires approval"} by ${preset} preset.`
  };
}

function resolveProtectedAutonomy(step, context) {
  const tool = String(step?.tool ?? "");
  const workspace = context.paths?.workspace;
  if (!workspace) {
    return null;
  }

  if (["file.read", "file.diff", "file.write_safe"].includes(tool) && step.args?.path) {
    const operation = tool === "file.write_safe" ? "write" : "read";
    const target = path.resolve(workspace, String(step.args.path));
    const asset = inspectProtectedPath(workspace, target, operation, context.agent?.protectedAssets);
    if (!asset.protected) {
      return null;
    }
    if (asset.decision === "block") {
      return {
        effectiveMode: "block",
        approvalRequired: false,
        internalApproval: false,
        eligible: false,
        locked: true,
        protectedAsset: asset,
        reason: asset.reason
      };
    }
    return {
      effectiveMode: "approval",
      approvalRequired: true,
      internalApproval: true,
      eligible: false,
      locked: true,
      protectedAsset: asset,
      reason: asset.reason
    };
  }

  if (tool === "project.cleanup_safe") {
    return {
      effectiveMode: "approval",
      approvalRequired: true,
      internalApproval: true,
      eligible: false,
      locked: true,
      reason: "Project cleanup stays approval-gated and blocks protected paths."
    };
  }

  if (tool === "shell.execute_approved" || tool === "shell.dry_run") {
    const argv = Array.isArray(step.args?.argv)
      ? step.args.argv
      : typeof step.args?.command === "string"
        ? step.args.command.split(/\s+/).filter(Boolean)
        : [];
    const asset = inspectProtectedShellArgv(argv, context.agent?.protectedAssets);
    if (!asset.protected) {
      return null;
    }
    if (asset.decision === "block") {
      return {
        effectiveMode: tool === "shell.execute_approved" ? "block" : "auto",
        approvalRequired: false,
        internalApproval: false,
        eligible: tool === "shell.dry_run",
        locked: true,
        protectedAsset: asset,
        reason: tool === "shell.execute_approved" ? asset.reason : `Dry-run only: ${asset.reason}`
      };
    }
    return {
      effectiveMode: tool === "shell.execute_approved" ? "approval" : "auto",
      approvalRequired: tool === "shell.execute_approved",
      internalApproval: tool === "shell.execute_approved",
      eligible: tool === "shell.dry_run",
      locked: true,
      protectedAsset: asset,
      reason: tool === "shell.execute_approved" ? asset.reason : `Dry-run only: ${asset.reason}`
    };
  }

  return null;
}
