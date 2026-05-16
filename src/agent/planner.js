const riskLevels = new Set(["low", "medium", "high", "critical"]);

export function validateAgentPlan(plan, tools) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("Agent plan must be a JSON object.");
  }

  const task = String(plan.task ?? "").trim();
  if (!task) {
    throw new Error("Agent plan requires a non-empty task.");
  }

  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error("Agent plan requires at least one step.");
  }

  if (plan.steps.length > 20) {
    throw new Error("Agent plan cannot contain more than 20 steps in v0.2.");
  }

  const toolNames = new Set(tools.map((tool) => tool.name));

  return {
    task,
    steps: plan.steps.map((step, index) => validateStep(step, index, toolNames, tools))
  };
}

export function parseAgentPlanJson(text, tools) {
  const cleaned = extractJson(text);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`Planner did not return valid JSON: ${error.message}`);
  }
  return validateAgentPlan(parsed, tools);
}

export function createMockPlan(task) {
  const normalizedTask = String(task ?? "").trim() || "Inspect the current project.";
  const lower = normalizedTask.toLowerCase();

  if (lower.includes("cleanup") || lower.includes("clean up") || lower.includes("clean this project") || lower.includes("remove unnecessary")) {
    return {
      task: normalizedTask,
      steps: [
        {
          id: "inspect-project-files",
          tool: "file.list",
          args: {
            path: ".",
            maxDepth: 2
          },
          reason: "Inspect the visible project structure before proposing cleanup.",
          risk: "low"
        },
        {
          id: "propose-safe-cleanup",
          tool: "project.cleanup_safe",
          args: {
            path: "."
          },
          reason: "Propose generated/cache paths for cleanup while blocking protected source, config, and secret files.",
          risk: "high"
        }
      ]
    };
  }

  if (lower.includes("write") || lower.includes("create file")) {
    return {
      task: normalizedTask,
      steps: [
        {
          id: "write-safe-file",
          tool: "file.write_safe",
          args: {
            path: "clawguard-agent-output.txt",
            content: `ClawGuard Agent draft for task:\n${normalizedTask}\n`
          },
          reason: "Create a local draft only after approval.",
          risk: "medium"
        }
      ]
    };
  }

  if (lower.includes("shell") || lower.includes("command")) {
    return {
      task: normalizedTask,
      steps: [
        {
          id: "dry-run-command",
          tool: "shell.dry_run",
          args: {
            command: "npm test"
          },
          reason: "Classify the command risk without executing it.",
          risk: "low"
        }
      ]
    };
  }

  if (lower.includes("memory") || lower.includes("remember")) {
    return {
      task: normalizedTask,
      steps: [
        {
          id: "search-memory",
          tool: "memory.search",
          args: {
            query: normalizedTask
          },
          reason: "Search existing governed memory before proposing a new durable memory.",
          risk: "low"
        }
      ]
    };
  }

  if (lower.includes("github") || lower.includes("issue") || lower.includes("repo")) {
    return {
      task: normalizedTask,
      steps: [
        {
          id: "draft-github-issue",
          tool: "github.issue_draft",
          args: {
            repo: "denial-web/clawguard",
            title: "ClawGuard Agent draft issue",
            body: `Draft issue for task:\n${normalizedTask}\n`
          },
          reason: "Draft locally first; external GitHub writes require approval.",
          risk: "low"
        }
      ]
    };
  }

  if (lower.includes("web") || lower.includes("search") || lower.includes("latest") || lower.includes("current")) {
    return {
      task: normalizedTask,
      steps: [
        {
          id: "search-web",
          tool: "web.search",
          args: {
            query: normalizedTask,
            limit: 5
          },
          reason: "Use configured read-only web search for current information.",
          risk: "low"
        }
      ]
    };
  }

  return {
    task: normalizedTask,
    steps: [
      {
        id: "list-project-files",
        tool: "file.list",
        args: {
          path: ".",
          maxDepth: 2
        },
        reason: "Inspect the visible project structure before suggesting work.",
        risk: "low"
      },
      {
        id: "read-readme",
        tool: "file.read",
        args: {
          path: "README.md",
          maxBytes: 20000,
          optional: true
        },
        reason: "Use the README when present to summarize the project accurately.",
        risk: "low"
      }
    ]
  };
}

function validateStep(step, index, toolNames, tools) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    throw new Error(`Agent plan step ${index + 1} must be an object.`);
  }

  const tool = String(step.tool ?? "").trim();
  if (!tool || !toolNames.has(tool)) {
    throw new Error(`Agent plan step ${index + 1} references unknown tool: ${tool || "(missing)"}`);
  }

  const toolInfo = tools.find((candidate) => candidate.name === tool);
  const risk = String(step.risk ?? toolInfo?.risk ?? "low").trim().toLowerCase();
  if (!riskLevels.has(risk)) {
    throw new Error(`Agent plan step ${index + 1} has invalid risk: ${risk}`);
  }

  const args = step.args ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error(`Agent plan step ${index + 1} args must be an object.`);
  }

  return {
    id: String(step.id ?? `step-${index + 1}`).trim() || `step-${index + 1}`,
    tool,
    args,
    reason: String(step.reason ?? toolInfo?.description ?? "").trim(),
    risk
  };
}

function extractJson(text) {
  const raw = String(text ?? "").trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(raw);
  if (fence) {
    return fence[1].trim();
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) {
    return raw.slice(first, last + 1);
  }

  return raw;
}
