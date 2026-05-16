export const agentRecipes = [
  {
    name: "project.inspect",
    description: "Inspect project files, README, and git state with read-only tools."
  },
  {
    name: "release.prepare",
    description: "Inspect package/release context, git changes, and test command risk before release."
  },
  {
    name: "npm.package_check",
    description: "Inspect npm package metadata, lockfile, and test command risk."
  },
  {
    name: "web.research",
    description: "Run read-only web research and propose browser review without clicking or typing."
  }
];

export function listAgentRecipes() {
  return agentRecipes.map((recipe) => ({ ...recipe }));
}

export function createRecipePlan(name, task) {
  const recipe = String(name ?? "").trim();
  const requestedTask = String(task ?? "").trim();

  if (recipe === "project.inspect") {
    return {
      task: requestedTask || "Inspect this project safely.",
      steps: [
        {
          id: "list-project-files",
          tool: "file.list",
          args: { path: ".", maxDepth: 2, maxEntries: 300 },
          reason: "Inspect visible project structure.",
          risk: "low"
        },
        {
          id: "read-readme",
          tool: "file.read",
          args: { path: "README.md", maxBytes: 20000, optional: true },
          reason: "Use README context when present.",
          risk: "low"
        },
        {
          id: "git-status",
          tool: "git.status",
          args: {},
          reason: "Inspect repository state without shell execution.",
          risk: "low"
        }
      ]
    };
  }

  if (recipe === "release.prepare") {
    return {
      task: requestedTask || "Prepare a safe release review.",
      steps: [
        {
          id: "read-package",
          tool: "file.read",
          args: { path: "package.json", maxBytes: 30000, optional: true },
          reason: "Inspect package metadata.",
          risk: "low"
        },
        {
          id: "git-status",
          tool: "git.status",
          args: {},
          reason: "Check repository cleanliness.",
          risk: "low"
        },
        {
          id: "git-diff",
          tool: "git.diff",
          args: { maxBytes: 40000 },
          reason: "Review pending source changes.",
          risk: "low"
        },
        {
          id: "recent-commits",
          tool: "git.log",
          args: { limit: 8 },
          reason: "Summarize recent release context.",
          risk: "low"
        },
        {
          id: "test-dry-run",
          tool: "shell.dry_run",
          args: { command: "npm test" },
          reason: "Classify the test command without executing it.",
          risk: "low"
        }
      ]
    };
  }

  if (recipe === "npm.package_check") {
    return {
      task: requestedTask || "Check this npm package safely.",
      steps: [
        {
          id: "read-package",
          tool: "file.read",
          args: { path: "package.json", maxBytes: 30000 },
          reason: "Inspect npm metadata and scripts.",
          risk: "low"
        },
        {
          id: "read-lockfile",
          tool: "file.read",
          args: { path: "package-lock.json", maxBytes: 30000, optional: true },
          reason: "Check lockfile presence and package version consistency.",
          risk: "low"
        },
        {
          id: "npm-pack-dry-run",
          tool: "shell.dry_run",
          args: { command: "npm pack --dry-run" },
          reason: "Classify package dry-run command before any execution.",
          risk: "low"
        }
      ]
    };
  }

  if (recipe === "web.research") {
    return {
      task: requestedTask || "Research a topic safely with read-only web tools.",
      steps: [
        {
          id: "search-web",
          tool: "web.search",
          args: {
            query: requestedTask || "ClawGuard Agent governed browser proposal safety",
            limit: 5
          },
          reason: "Use configured read-only search before any browser bridge proposal.",
          risk: "low"
        },
        {
          id: "propose-manual-review",
          tool: "browser.open",
          args: {
            url: "https://example.com/",
            purpose: "Dry-run a browser-open proposal for manual review only; ClawGuard core does not open or click browsers."
          },
          reason: "Demonstrate governed browser handoff without browser control.",
          risk: "low"
        }
      ]
    };
  }

  throw new Error(`Unknown ClawGuard Agent recipe: ${recipe}`);
}
