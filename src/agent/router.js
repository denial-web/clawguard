export const agentRuntimePaths = ["fast", "tool", "cleanup", "search", "thinking"];

export function routeAgentTask(task, context = {}) {
  const text = String(task ?? "");
  const skills = new Set((context.skills ?? []).map((skill) => {
    if (typeof skill === "string") return skill;
    return String(skill.name ?? skill.metadata?.name ?? "");
  }).filter(Boolean));
  const likelyTool = detectLikelyTool(text);
  const needsCleanup = shouldCleanup(text);
  const needsSearch = shouldSearch(text) && (skills.has("web_search") || skills.has("web-search") || Boolean(context.agent?.allowWebSearch));
  const needsThinking = shouldThink(text);
  let path = "fast";
  let reason = "Simple local agent task; plan directly with read-only inspection first.";

  if (needsCleanup) {
    path = "cleanup";
    reason = "Task asks for project cleanup, so route to approval-gated safe cleanup.";
  } else if (likelyTool) {
    path = "tool";
    reason = `Task likely needs capability: ${likelyTool}.`;
  }

  if (needsSearch) {
    path = "search";
    reason = "Task appears time-sensitive and a search skill is available.";
  }

  if (needsThinking && !needsCleanup && !likelyTool) {
    path = "thinking";
    reason = "Task appears complex and benefits from an explicit plan.";
  }

  if (needsThinking && needsSearch) {
    path = "thinking";
    reason = "Task is complex and current-information sensitive; plan, search when available, then answer.";
  }

  return {
    path,
    needsSearch,
    needsThinking,
    likelyTool,
    reason,
    directive: buildDirective({ path, reason, likelyTool, needsSearch, needsThinking })
  };
}

export function detectLikelyTool(text) {
  const value = String(text ?? "");
  if (/\b(cleanup|clean up|remove unnecessary|delete generated|clear cache)\b/i.test(value)) return "project.cleanup_safe";
  if (/\b(write|edit|create file|modify file|patch)\b/i.test(value)) return "file.write_safe";
  if (/\b(shell|command|terminal|run tests?|npm test|execute)\b/i.test(value)) return "shell.dry_run";
  if (/\b(skill|SKILL\.md|install skill|import skill)\b/i.test(value)) return "skill.install_guarded";
  if (/\b(memory|remember|save this rule|business rule)\b/i.test(value)) return "memory";
  return undefined;
}

export function shouldCleanup(text) {
  return /\b(cleanup|clean up|clean this project|remove unnecessary|delete generated|clear cache|remove temp)\b/i.test(String(text ?? ""));
}

export function shouldSearch(text) {
  return /\b(today|latest|current|recent|now|news|price|law|policy|compare|best|review|202[6-9])\b/i.test(String(text ?? ""));
}

export function shouldThink(text) {
  const value = String(text ?? "");
  return /\b(plan|strategy|analyze|analyse|compare|review|roadmap|debug|investigate|architecture|refactor)\b/i.test(value) ||
    value.length > 700;
}

function buildDirective(route) {
  const lines = [
    "## CLAWGUARD AGENT ROUTE",
    `Selected path: ${route.path}`,
    `Reason: ${route.reason}`
  ];

  if (route.path === "cleanup") {
    lines.push("Instruction: Use project.cleanup_safe for generated/cache cleanup. Never delete source, config, secrets, package manifests, or repository control files.");
  } else if (route.path === "tool") {
    lines.push(`Instruction: Prefer the relevant governed tool${route.likelyTool ? ` (${route.likelyTool})` : ""}. Risky actions must request approval before execution.`);
  } else if (route.path === "search") {
    lines.push("Instruction: Use search only when an approved search skill/tool is available; otherwise explain that live search is not enabled.");
  } else if (route.path === "thinking") {
    lines.push("Instruction: Break the task into explicit steps, inspect before changing anything, and keep risky actions approval-gated.");
  } else {
    lines.push("Instruction: Keep the plan small and prefer read-only tools unless the user clearly asked for a change.");
  }

  return lines.join("\n");
}
