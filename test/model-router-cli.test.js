import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("model recommend routes tool-heavy skill installs to a strong model", async () => {
  const workspace = await writeRoutingConfig();

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "model",
      "recommend",
      "--config",
      path.join(workspace, ".clawguard.json"),
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
      "--json"
    ], { cwd: process.cwd() });
    const result = JSON.parse(stdout);

    assert.equal(result.schemaVersion, "clawguard.modelRecommendation.v1");
    assert.equal(result.recommendedProfile, "strong");
    assert.equal(result.recommendedModel, "example/strong-model");
    assert.equal(result.decision, "allow");
    assert.equal(result.signals.some((signal) => signal.id === "high-tool-risk"), true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("model recommend prefers local models for high privacy simple tasks", async () => {
  const workspace = await writeRoutingConfig();

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "src/cli.js",
      "model",
      "recommend",
      "--config",
      path.join(workspace, ".clawguard.json"),
      "--task",
      "Summarize private notes",
      "--privacy",
      "high",
      "--tool-risk",
      "none",
      "--json"
    ], { cwd: process.cwd() });
    const result = JSON.parse(stdout);

    assert.equal(result.recommendedProfile, "local");
    assert.equal(result.recommendedModel, "ollama/llama3.3");
    assert.equal(result.decision, "allow");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("model recommend requires approval for premium profile", async () => {
  const workspace = await writeRoutingConfig();

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "model",
        "recommend",
        "--config",
        path.join(workspace, ".clawguard.json"),
        "--task",
        "Deep enterprise migration strategy for a large codebase",
        "--privacy",
        "low",
        "--tool-risk",
        "low",
        "--input-tokens",
        "200000",
        "--output-tokens",
        "20000",
        "--json"
      ], { cwd: process.cwd() }),
      (error) => {
        const result = JSON.parse(error.stdout);

        assert.equal(error.code, 1);
        assert.equal(result.recommendedProfile, "premium");
        assert.equal(result.recommendedModel, "example/premium-model");
        assert.equal(result.decision, "manual_review");
        assert.equal(result.requiredActions.includes("owner-model-approval"), true);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("model recommend applies budget decisions when pricing is configured", async () => {
  const workspace = await writeRoutingConfig({
    budgets: {
      approvalRequestUsd: 0.01,
      maxRequestUsd: 0.05
    }
  });

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "model",
        "recommend",
        "--config",
        path.join(workspace, ".clawguard.json"),
        "--task",
        "Debug a security bug",
        "--privacy",
        "low",
        "--tool-risk",
        "high",
        "--input-tokens",
        "1000000",
        "--output-tokens",
        "0",
        "--json"
      ], { cwd: process.cwd() }),
      (error) => {
        const result = JSON.parse(error.stdout);

        assert.equal(error.code, 2);
        assert.equal(result.recommendedProfile, "strong");
        assert.equal(result.budget.decision, "block");
        assert.equal(result.decision, "block");
        assert.equal(result.requiredActions.includes("reduce-token-usage"), true);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("model recommend asks for configuration when the selected profile has no model", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-router-empty-"));

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        path.resolve("src/cli.js"),
        "model",
        "recommend",
        "--task",
        "Install a risky skill",
        "--tool-risk",
        "high",
        "--json"
      ], { cwd: workspace }),
      (error) => {
        const result = JSON.parse(error.stdout);

        assert.equal(error.code, 1);
        assert.equal(result.recommendedProfile, "strong");
        assert.equal(result.recommendedModel, null);
        assert.equal(result.requiredActions.includes("configure-model-routing-profile"), true);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

async function writeRoutingConfig(overrides = {}) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-router-"));
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
      },
      {
        provider: "example",
        model: "premium-model",
        inputUsdPer1M: 3,
        outputUsdPer1M: 8
      }
    ],
    modelRouting: {
      defaultProfile: "cheap",
      approvalProfiles: ["premium"],
      longContextTokens: 64000,
      premiumContextTokens: 180000,
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
          fallbacks: ["example/premium-model", "example/cheap-model"]
        },
        premium: {
          model: "example/premium-model",
          approvalRequired: true,
          fallbacks: ["example/strong-model"]
        }
      }
    }
  };

  await fs.writeFile(path.join(workspace, ".clawguard.json"), JSON.stringify(config));
  return workspace;
}
