export const subagentProfiles = [
  {
    name: "researcher",
    description: "Read-only research helper for web, memory, and project context.",
    allowedTools: ["memory.search", "web.search", "web.fetch", "file.list", "file.read"],
    maxSteps: 4,
    maxOutputBytes: 24000
  },
  {
    name: "project-inspector",
    description: "Inspects local project state using file and git read tools.",
    allowedTools: ["file.list", "file.read", "git.status", "git.diff", "git.log", "memory.search"],
    maxSteps: 5,
    maxOutputBytes: 24000
  },
  {
    name: "release-manager",
    description: "Prepares release readiness summaries and local issue drafts.",
    allowedTools: ["git.status", "git.diff", "git.log", "file.read", "file.diff", "shell.dry_run", "github.issue_draft", "memory.search"],
    maxSteps: 6,
    maxOutputBytes: 28000
  },
  {
    name: "business-operator",
    description: "Uses role intelligence, memory, and local docs to prepare business operating work.",
    allowedTools: ["memory.search", "memory.propose", "file.list", "file.read", "file.diff"],
    maxSteps: 5,
    maxOutputBytes: 24000
  },
  {
    name: "security-reviewer",
    description: "Reviews protected assets, proposals, audit trail, and local project risk signals.",
    allowedTools: ["file.list", "file.read", "git.status", "git.diff", "memory.search", "shell.dry_run"],
    maxSteps: 5,
    maxOutputBytes: 24000
  }
];

const profilesByName = new Map(subagentProfiles.map((profile) => [profile.name, profile]));

export function listSubagentProfiles() {
  return subagentProfiles.map(copyProfile);
}

export function getSubagentProfile(name) {
  const profileName = String(name ?? "").trim();
  const profile = profilesByName.get(profileName);
  if (!profile) {
    throw new Error(`Unknown subagent profile: ${profileName || "(empty)"}`);
  }
  return copyProfile(profile);
}

export function createSubagentPlan(profileName, task, options = {}) {
  const profile = getSubagentProfile(profileName);
  const maxSteps = Math.max(1, Math.min(Number(options.maxSteps ?? profile.maxSteps) || profile.maxSteps, profile.maxSteps));
  const query = String(task ?? "").trim() || "Inspect current task context.";
  const steps = plannedStepsFor(profile.name, query).slice(0, maxSteps);

  return {
    task: query,
    steps: steps.filter((step) => profile.allowedTools.includes(step.tool))
  };
}

export function createTeamAssignments(task, options = {}) {
  const requested = Array.isArray(options.profiles) && options.profiles.length > 0
    ? options.profiles
    : ["project-inspector", "researcher", "security-reviewer"];
  const maxSubagents = Math.max(1, Math.min(Number(options.maxSubagents ?? 3) || 3, 3));
  return requested.slice(0, maxSubagents).map((profile) => ({
    profile,
    task: teamTaskFor(profile, task)
  }));
}

export function summarizeSubagentRun(run) {
  const completed = run.steps.filter((item) => item.result.ok).length;
  const blocked = run.steps.length - completed;
  return {
    profile: run.profile,
    status: run.status,
    task: run.task,
    completedSteps: completed,
    blockedSteps: blocked,
    highlights: run.steps.map((item) => ({
      tool: item.step.tool,
      status: item.result.status ?? (item.result.ok ? "completed" : "blocked"),
      error: item.result.error ?? null,
      approvalRequired: Boolean(item.result.approvalRequest)
    }))
  };
}

function plannedStepsFor(profile, query) {
  if (profile === "researcher") {
    return [
      step("research-memory", "memory.search", { query, limit: 5 }, "Recall relevant governed memory."),
      step("research-files", "file.list", { path: ".", maxDepth: 2, maxEntries: 80 }, "Inspect local workspace context."),
      step("research-readme", "file.read", { path: "README.md", optional: true, maxBytes: 24000 }, "Read project/business overview if available."),
      step("research-web", "web.search", { query, limit: 5 }, "Search configured public web provider.")
    ];
  }

  if (profile === "project-inspector") {
    return [
      step("project-files", "file.list", { path: ".", maxDepth: 2, maxEntries: 120 }, "Map visible project files."),
      step("project-git-status", "git.status", {}, "Inspect git working tree state."),
      step("project-git-log", "git.log", { limit: 5 }, "Read recent project history."),
      step("project-readme", "file.read", { path: "README.md", optional: true, maxBytes: 24000 }, "Read project overview."),
      step("project-memory", "memory.search", { query, limit: 5 }, "Recall relevant project memory.")
    ];
  }

  if (profile === "release-manager") {
    return [
      step("release-git-status", "git.status", {}, "Inspect release cleanliness."),
      step("release-diff", "git.diff", { maxBytes: 24000 }, "Inspect pending changes."),
      step("release-log", "git.log", { limit: 10 }, "Read recent commits."),
      step("release-package", "file.read", { path: "package.json", optional: true, maxBytes: 16000 }, "Read package metadata."),
      step("release-test-dry-run", "shell.dry_run", { argv: ["npm", "test"] }, "Classify test command without executing.")
    ];
  }

  if (profile === "business-operator") {
    return [
      step("business-memory", "memory.search", { query, limit: 8 }, "Recall business rules and preferences."),
      step("business-files", "file.list", { path: ".", maxDepth: 2, maxEntries: 80 }, "Inspect local business/project docs."),
      step("business-readme", "file.read", { path: "README.md", optional: true, maxBytes: 24000 }, "Read available business overview."),
      step("business-memory-proposal", "memory.propose", {
        type: "UNVERIFIED",
        content: `Potential business context to validate: ${query}`,
        scope: "workspace",
        sensitive: false
      }, "Propose useful business context for approval.")
    ];
  }

  return [
    step("security-files", "file.list", { path: ".", maxDepth: 2, maxEntries: 120 }, "Inspect visible project files."),
    step("security-git-status", "git.status", {}, "Inspect working tree risk."),
    step("security-diff", "git.diff", { maxBytes: 24000 }, "Inspect local changes for risky edits."),
    step("security-memory", "memory.search", { query, limit: 5 }, "Recall relevant safety and protected asset rules."),
    step("security-shell-preview", "shell.dry_run", { argv: ["psql", "-c", "DROP DATABASE prod"] }, "Verify destructive database command stays high risk.")
  ];
}

function step(id, tool, args, reason) {
  return {
    id,
    tool,
    args,
    reason,
    risk: tool === "memory.propose" ? "medium" : "low"
  };
}

function teamTaskFor(profile, task) {
  const text = String(task ?? "").trim();
  if (profile === "project-inspector") {
    return `Inspect local project state for: ${text}`;
  }
  if (profile === "researcher") {
    return `Research available context for: ${text}`;
  }
  if (profile === "security-reviewer") {
    return `Review safety and protected-asset concerns for: ${text}`;
  }
  return text;
}

function copyProfile(profile) {
  return {
    ...profile,
    allowedTools: [...profile.allowedTools]
  };
}
