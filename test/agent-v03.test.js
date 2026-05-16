import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliPath = path.join(repoRoot, "src", "cli.js");

test("agent recipes execute read-only project, release, and npm checks", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-recipes-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n");
    await fs.writeFile(path.join(workspace, "package.json"), "{\"name\":\"demo\",\"version\":\"1.0.0\"}\n");
    await execFileAsync("git", ["init"], { cwd: workspace });
    await runCliJson(["agent", "init"], workspace);

    const inspect = await runCliJson(["agent", "run", "--recipe", "project.inspect"], workspace);
    const release = await runCliJson(["agent", "run", "--recipe", "release.prepare"], workspace);
    const npmCheck = await runCliJson(["agent", "run", "--recipe", "npm.package_check"], workspace);

    assert.equal(inspect.plan.steps.some((step) => step.tool === "git.status"), true);
    assert.equal(release.plan.steps.some((step) => step.tool === "git.diff"), true);
    assert.equal(npmCheck.plan.steps.some((step) => step.tool === "shell.dry_run"), true);
    assert.equal(inspect.status, "completed");
    assert.equal(release.status, "completed");
    assert.equal(npmCheck.status, "completed");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("git tools are read-only and cannot escape workspace", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-git-"));

  try {
    await execFileAsync("git", ["init"], { cwd: workspace });
    await runCliJson(["agent", "init"], workspace);
    const planPath = await writeJson(workspace, "plan", {
      task: "bad git diff",
      steps: [{
        id: "bad-diff",
        tool: "git.diff",
        args: { path: "../secret.txt" },
        reason: "This should be blocked.",
        risk: "low"
      }]
    });

    await assert.rejects(
      runCli(["agent", "run", "--plan", planPath, "--json"], workspace),
      (error) => {
        const result = JSON.parse(error.stdout);
        assert.equal(error.code, 2);
        assert.match(result.steps[0].result.error, /escapes/);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("web tools use mock provider and block private fetch proposals", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-web-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await patchConfig(workspace, (config) => {
      config.agent.integrations.webSearch.provider = "mock";
      config.agent.integrations.webFetch.enabled = true;
      return config;
    });
    const planPath = await writeJson(workspace, "plan", {
      task: "search web",
      steps: [
        {
          id: "search",
          tool: "web.search",
          args: { query: "clawguard", limit: 3 },
          reason: "Use configured mock search.",
          risk: "low"
        },
        {
          id: "fetch",
          tool: "web.fetch",
          args: { url: "https://example.com/docs" },
          reason: "Fetch public docs through mock mode.",
          risk: "low"
        }
      ]
    });
    const result = await runCliJson(["agent", "run", "--plan", planPath], workspace);
    const proposalPath = await writeJson(workspace, "proposal", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "web.fetch",
      args: { url: "http://127.0.0.1:3000/admin" },
      risk: "low"
    });

    assert.equal(result.status, "completed");
    assert.equal(result.steps[0].result.output.provider, "mock");
    assert.equal(result.steps[1].result.output.content.includes("Mock ClawGuard"), true);
    await assert.rejects(
      runCli(["agent", "proposal", "validate", proposalPath, "--json"], workspace),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /private URLs|localhost/);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("GitHub issue creation requires approval and repo allowlist", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-github-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    await patchConfig(workspace, (config) => {
      config.agent.integrations.github.allowedRepos = ["denial-web/clawguard"];
      config.agent.integrations.github.mock = true;
      return config;
    });
    const planPath = await writeJson(workspace, "plan", {
      task: "create github issue",
      steps: [{
        id: "issue",
        tool: "github.issue_create_approved",
        args: {
          repo: "denial-web/clawguard",
          title: "Test issue",
          body: "Created by test."
        },
        reason: "External GitHub write requires approval.",
        risk: "high"
      }]
    });
    const pending = await runPending(["agent", "run", "--plan", planPath, "--json"], workspace);
    const approvalId = pending.steps[0].result.approvalRequest.id;

    assert.equal(pending.status, "pending_approval");

    await runCliJson([
      "approvals",
      "decide",
      path.join(workspace, ".clawguard", "approvals.jsonl"),
      "--id",
      approvalId,
      "--decision",
      "approve",
      "--out",
      path.join(workspace, ".clawguard", "decisions.jsonl")
    ], workspace);

    const approved = await runCliJson(["agent", "run", "--plan", planPath, "--approval-id", approvalId], workspace);
    assert.equal(approved.status, "completed");
    assert.equal(approved.steps[0].result.output.issue.mock, true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("agent run can dry-run Telegram summary notification", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-notify-"));

  try {
    await fs.writeFile(path.join(workspace, "README.md"), "# Demo\n");
    await execFileAsync("git", ["init"], { cwd: workspace });
    await runCliJson(["agent", "init"], workspace);

    const result = await runCliJson([
      "agent",
      "run",
      "--recipe",
      "project.inspect",
      "--notify",
      "telegram",
      "--chat-id",
      "123",
      "--bot-token",
      "TEST_TOKEN",
      "--dry-run"
    ], workspace);

    assert.equal(result.status, "completed");
    assert.equal(result.notifications.some((item) => item.type === "summary" && item.dryRun), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("memory search is read-only and memory propose does not write durable memory", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-memory-v03-"));
  const memoryPath = path.join(workspace, ".clawguard", "agent", "memory.jsonl");

  try {
    await runCliJson(["agent", "init"], workspace);
    await fs.writeFile(memoryPath, `${JSON.stringify({
      type: "BUSINESS_RULE",
      content: "Always run npm test before release.",
      source: "test",
      confidence: 1,
      scope: "workspace",
      sensitive: false,
      createdAt: "2026-01-01T00:00:00.000Z"
    })}\n`);

    const before = await fs.readFile(memoryPath, "utf8");
    const search = await runCliJson(["agent", "memory", "search", "npm release"], workspace);
    const planPath = await writeJson(workspace, "plan", {
      task: "propose memory",
      steps: [{
        id: "propose",
        tool: "memory.propose",
        args: {
          type: "INFERRED_PREFERENCE",
          content: "User likes safety-first releases."
        },
        reason: "Suggest useful memory.",
        risk: "medium"
      }]
    });
    const pending = await runPending(["agent", "run", "--plan", planPath, "--json"], workspace);
    const after = await fs.readFile(memoryPath, "utf8");

    assert.equal(search.records.length, 1);
    assert.equal(before, after);
    assert.equal(pending.status, "pending_approval");
    assert.equal(pending.steps[0].result.approvalRequest.status, "pending");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("bundled skills load after workspace skills and skills show exposes metadata", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-skills-v03-"));
  const workspaceSkill = path.join(workspace, "skills", "project-cleanup");

  try {
    await runCliJson(["agent", "init"], workspace);
    const bundled = await runCliJson(["agent", "skills", "list"], workspace);
    assert.equal(bundled.skills.find((skill) => skill.name === "project-cleanup").source, "bundled");

    await fs.mkdir(workspaceSkill, { recursive: true });
    await fs.writeFile(path.join(workspaceSkill, "SKILL.md"), [
      "---",
      "name: project-cleanup",
      "description: Workspace override.",
      "risk: low",
      "---",
      "",
      "# Project Cleanup",
      "Workspace version.",
      ""
    ].join("\n"));

    const listed = await runCliJson(["agent", "skills", "list"], workspace);
    const projectCleanup = listed.skills.filter((skill) => skill.name === "project-cleanup");
    const shown = await runCliJson(["agent", "skills", "show", "project-cleanup"], workspace);

    assert.equal(projectCleanup.length, 1);
    assert.equal(projectCleanup[0].source, "workspace");
    assert.equal(shown.skill.description, "Workspace override.");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("proposal schema rejects low-risk external GitHub writes", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-agent-proposal-v03-"));

  try {
    await runCliJson(["agent", "init"], workspace);
    const proposalPath = await writeJson(workspace, "proposal", {
      schemaVersion: "clawguard.agentActionProposal.v1",
      tool: "github.issue_create_approved",
      args: {
        repo: "denial-web/clawguard",
        title: "Unsafe low risk",
        body: "This should require high risk."
      },
      risk: "low"
    });

    await assert.rejects(
      runCli(["agent", "proposal", "validate", proposalPath, "--json"], workspace),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /risk must be high or critical/);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

async function runCli(args, cwd) {
  return execFileAsync(process.execPath, [cliPath, ...args], { cwd });
}

async function runCliJson(args, cwd) {
  const result = await runCli([...args, "--json"], cwd);
  return JSON.parse(result.stdout);
}

async function runPending(args, cwd) {
  try {
    await runCli(args, cwd);
    assert.fail("Expected command to pause for approval.");
  } catch (error) {
    assert.equal(error.code, 1);
    return JSON.parse(error.stdout);
  }
}

async function writeJson(workspace, prefix, value) {
  const filePath = path.join(workspace, `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

async function patchConfig(workspace, update) {
  const configPath = path.join(workspace, ".clawguard.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  await fs.writeFile(configPath, `${JSON.stringify(update(config), null, 2)}\n`);
}
