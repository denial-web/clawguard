import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig, mergeConfig } from "../src/config.js";
import { evaluatePolicy, policyShouldFail } from "../src/policy.js";
import { scanTarget } from "../src/scanner.js";

test("evaluates governed policy decisions from scan results", async () => {
  const result = await scanTarget("examples/metadata-mismatch-skill", { policy: "governed" });

  assert.equal(result.policy.preset, "governed");
  assert.equal(result.policy.decision, "block");
  assert.equal(result.policy.requiredActions.includes("do-not-install"), true);
});

test("enterprise policy blocks undeclared secret access", () => {
  const policy = evaluatePolicy({
    level: "high",
    findings: [
      {
        ruleId: "undeclared-env-access",
        severity: "high"
      }
    ]
  }, "enterprise");

  assert.equal(policy.decision, "block");
});

test("policyShouldFail respects configured decision threshold", () => {
  assert.equal(policyShouldFail({ decision: "warn" }, "manual_review"), false);
  assert.equal(policyShouldFail({ decision: "sandbox_required" }, "manual_review"), true);
});

test("loads .clawguard.json from target ancestors", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-config-"));

  try {
    const nested = path.join(dir, "skills", "demo");
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, "SKILL.md"), "# Demo\n");
    await fs.writeFile(path.join(dir, ".clawguard.json"), JSON.stringify({
      policy: "governed",
      failOnPolicy: true,
      maxFileSizeBytes: "512kb"
    }));

    const loaded = await loadConfig(nested);

    assert.equal(loaded.path, path.join(dir, ".clawguard.json"));
    assert.equal(loaded.config.policy, "governed");
    assert.equal(loaded.config.failOnPolicy, true);
    assert.equal(loaded.config.maxFileSizeBytes, 512 * 1024);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("CLI-style options override config values", () => {
  const merged = mergeConfig({
    policy: "personal",
    failOn: "critical",
    maxFileSizeBytes: 1024
  }, {
    policy: "enterprise",
    failOn: "medium",
    target: "examples"
  });

  assert.equal(merged.policy, "enterprise");
  assert.equal(merged.failOn, "medium");
  assert.equal(merged.target, "examples");
});

test("normalizes budget and model config", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-config-"));
  const configPath = path.join(dir, ".clawguard.json");

  try {
    await fs.writeFile(configPath, JSON.stringify({
      budgets: {
        approvalRequestUsd: "0.05",
        maxRequestUsd: 0.25,
        maxTotalTokens: "100000"
      },
      models: [
        {
          provider: "example",
          model: "example-model",
          inputUsdPer1M: "0.25",
          outputUsdPer1M: 1.25
        }
      ]
    }));

    const loaded = await loadConfig(dir);

    assert.equal(loaded.config.budgets.approvalRequestUsd, 0.05);
    assert.equal(loaded.config.budgets.maxRequestUsd, 0.25);
    assert.equal(loaded.config.budgets.maxTotalTokens, 100000);
    assert.deepEqual(loaded.config.models[0], {
      provider: "example",
      model: "example-model",
      inputUsdPer1M: 0.25,
      outputUsdPer1M: 1.25
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("normalizes model routing config", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-config-"));
  const configPath = path.join(dir, ".clawguard.json");

  try {
    await fs.writeFile(configPath, JSON.stringify({
      modelRouting: {
        defaultProfile: "cheap",
        approvalProfiles: ["premium"],
        longContextTokens: "64000",
        premiumContextTokens: 180000,
        profiles: {
          cheap: {
            model: "example/cheap-model",
            fallbacks: ["example/strong-model"]
          },
          premium: {
            model: "example/premium-model",
            approvalRequired: true
          }
        }
      }
    }));

    const loaded = await loadConfig(dir);

    assert.equal(loaded.config.modelRouting.defaultProfile, "cheap");
    assert.equal(loaded.config.modelRouting.longContextTokens, 64000);
    assert.equal(loaded.config.modelRouting.profiles.cheap.model, "example/cheap-model");
    assert.deepEqual(loaded.config.modelRouting.profiles.cheap.fallbacks, ["example/strong-model"]);
    assert.equal(loaded.config.modelRouting.profiles.premium.approvalRequired, true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("suppresses matching non-critical findings with a reason", async () => {
  const result = await scanTarget("examples/declared-api-skill", {
    suppressions: [
      {
        ruleId: "network-access",
        path: "SKILL.md",
        reason: "Expected public API call"
      }
    ]
  });

  assert.equal(result.score, 0);
  assert.equal(result.findings.length, 0);
  assert.equal(result.suppressedFindings.length, 1);
  assert.equal(result.suppressedFindings[0].suppressionReason, "Expected public API call");
});

test("does not suppress critical findings unless explicitly allowed", async () => {
  const result = await scanTarget("examples/risky-skill", {
    suppressions: [
      {
        ruleId: "remote-code-execution",
        reason: "This should not hide critical risk by default"
      }
    ]
  });

  assert.equal(result.findings.some((finding) => finding.ruleId === "remote-code-execution"), true);
  assert.equal(result.suppressedFindings.length, 0);
});
