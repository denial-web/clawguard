import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("run-plan combines skill scan, model routing, and budget into one allow decision", async () => {
  const workspace = await writeRunPlanConfig();

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "run-plan",
      "--config",
      path.join(workspace, ".clawguard.json"),
      "--skill",
      "examples/safe-skill",
      "--task",
      "Summarize private notes",
      "--privacy",
      "high",
      "--tool-risk",
      "none",
      "--input-tokens",
      "1000",
      "--output-tokens",
      "500",
      "--json"
    ], { cwd: process.cwd() });
    const plan = JSON.parse(stdout);

    assert.equal(plan.schemaVersion, "clawguard.runPlan.v1");
    assert.equal(plan.decision, "allow");
    assert.equal(plan.skill.decision, "allow");
    assert.equal(plan.modelRecommendation.recommendedProfile, "local");
    assert.equal(plan.modelRecommendation.recommendedModel, "ollama/llama3.3");
    assert.equal(plan.exitCode, 0);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("run-plan writes one approval request with model and budget context", async () => {
  const workspace = await writeRunPlanConfig();
  const approvalPath = path.join(workspace, ".clawguard", "approvals.jsonl");

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "run-plan",
        "--config",
        path.join(workspace, ".clawguard.json"),
        "--skill",
        "examples/risky-skill",
        "--task",
        "Install a third-party OpenClaw skill and connect Telegram",
        "--privacy",
        "medium",
        "--tool-risk",
        "high",
        "--input-tokens",
        "12000",
        "--output-tokens",
        "2000",
        "--approval-out",
        approvalPath,
        "--framework",
        "openclaw",
        "--json"
      ], { cwd: process.cwd() }),
      (error) => {
        const plan = JSON.parse(error.stdout);

        assert.equal(error.code, 1);
        assert.equal(plan.decision, "block");
        assert.equal(plan.exitCode, 1);
        assert.equal(plan.approvalRequest.status, "pending");
        assert.equal(plan.modelRecommendation.recommendedProfile, "strong");
        return true;
      }
    );

    const approval = JSON.parse((await fs.readFile(approvalPath, "utf8")).trim());

    assert.equal(approval.framework, "openclaw");
    assert.equal(approval.decision, "block");
    assert.equal(approval.runPlan.schemaVersion, "clawguard.runPlan.v1");
    assert.equal(approval.modelRecommendation.recommendedProfile, "strong");
    assert.equal(approval.modelRecommendation.budget.decision, "allow");
    assert.match(approval.message, /Model plan:/);
    assert.match(approval.message, /Profile: strong/);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("run-plan blocks when model budget blocks and no approval queue is requested", async () => {
  const workspace = await writeRunPlanConfig({
    budgets: {
      approvalRequestUsd: 0.01,
      maxRequestUsd: 0.05
    }
  });

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "run-plan",
        "--config",
        path.join(workspace, ".clawguard.json"),
        "--skill",
        "examples/safe-skill",
        "--task",
        "Debug a security bug",
        "--tool-risk",
        "high",
        "--input-tokens",
        "1000000",
        "--output-tokens",
        "0",
        "--json"
      ], { cwd: process.cwd() }),
      (error) => {
        const plan = JSON.parse(error.stdout);

        assert.equal(error.code, 2);
        assert.equal(plan.skill.decision, "allow");
        assert.equal(plan.modelRecommendation.budget.decision, "block");
        assert.equal(plan.decision, "block");
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

async function writeRunPlanConfig(overrides = {}) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-run-plan-"));
  const config = {
    budgets: {
      approvalRequestUsd: 0.50,
      maxRequestUsd: 2,
      ...(overrides.budgets ?? {})
    },
    models: [
      {
        provider: "example",
        model: "cheap-model",
        inputUsdPer1M: 0.05,
        outputUsdPer1M: 0.10
      },
      {
        provider: "example",
        model: "strong-model",
        inputUsdPer1M: 1,
        outputUsdPer1M: 2
      }
    ],
    modelRouting: {
      defaultProfile: "cheap",
      approvalProfiles: ["premium"],
      profiles: {
        local: {
          model: "ollama/llama3.3",
          fallbacks: ["example/cheap-model"]
        },
        cheap: {
          model: "example/cheap-model",
          fallbacks: ["example/strong-model"]
        },
        strong: {
          model: "example/strong-model",
          fallbacks: ["example/cheap-model"]
        }
      }
    }
  };

  await fs.writeFile(path.join(workspace, ".clawguard.json"), JSON.stringify(config));
  return workspace;
}
