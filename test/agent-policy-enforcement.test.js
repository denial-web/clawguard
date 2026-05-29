import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS } from "../bench/agent-policy/scenarios.js";
import {
  scoreClawGuardScenario,
  parseModelDecision,
  classifyScenarioWithModel,
  computeSystemMetrics
} from "../src/agent/policy-enforcement-eval.js";

describe("policy-enforcement parseModelDecision", () => {
  it("prioritizes block, then approval, then auto", () => {
    assert.equal(parseModelDecision("block"), "block");
    assert.equal(parseModelDecision("This should be blocked."), "block");
    assert.equal(parseModelDecision("requires approval"), "approval");
    assert.equal(parseModelDecision("Not auto — needs approval first"), "approval");
    assert.equal(parseModelDecision("auto"), "auto");
    assert.equal(parseModelDecision("allow it"), "auto");
    assert.equal(parseModelDecision("???"), "unknown");
  });
});

describe("policy-enforcement ClawGuard deterministic gate", () => {
  it("never auto-executes any dangerous scenario", () => {
    for (const s of SCENARIOS.filter((x) => x.tier === "dangerous")) {
      const { decision } = scoreClawGuardScenario(s, { preset: "developer", workspace: process.cwd() });
      assert.notEqual(decision, "auto", `${s.id} should not be auto, got ${decision}`);
    }
  });

  it("auto-allows safe read-only scenarios under developer preset", () => {
    for (const s of SCENARIOS.filter((x) => x.tier === "safe")) {
      const { decision } = scoreClawGuardScenario(s, { preset: "developer", workspace: process.cwd() });
      assert.equal(decision, "auto", `${s.id} should be auto, got ${decision}`);
    }
  });

  it("blocks unrecognized capabilities (fail-safe)", () => {
    const unknown = SCENARIOS.find((x) => x.id === "wire_transfer_unknown_tool");
    const { decision } = scoreClawGuardScenario(unknown, { preset: "developer", workspace: process.cwd() });
    assert.equal(decision, "block");
  });

  it("is invariant to preset for forced (dangerous) decisions", () => {
    for (const preset of ["personal", "developer", "business", "strict"]) {
      for (const s of SCENARIOS.filter((x) => x.tier === "dangerous")) {
        const { decision } = scoreClawGuardScenario(s, { preset, workspace: process.cwd() });
        assert.notEqual(decision, "auto", `${s.id} auto under ${preset}`);
      }
    }
  });
});

describe("policy-enforcement classifyScenarioWithModel (injected)", () => {
  it("uses the injected callModel and parses its output", async () => {
    const scenario = SCENARIOS[0];
    const { decision, raw } = await classifyScenarioWithModel(scenario, {
      callModel: async () => "approval"
    });
    assert.equal(decision, "approval");
    assert.equal(raw, "approval");
  });
});

describe("policy-enforcement computeSystemMetrics", () => {
  it("computes unsafe-auto, over-block, and adversarial flip rates", () => {
    const scenarios = [
      { id: "d1", tier: "dangerous", label: "block" },
      { id: "d2", tier: "dangerous", label: "approval" },
      { id: "s1", tier: "safe", label: "auto" },
      { id: "e1", tier: "side_effect", label: "approval" }
    ];
    const normal = { d1: "block", d2: "auto", s1: "block", e1: "approval" };
    const adversarial = { d1: "auto", d2: "auto", s1: "block", e1: "approval" };
    const m = computeSystemMetrics(scenarios, normal, adversarial);

    assert.equal(m.dangerous_total, 2);
    assert.equal(m.dangerous_auto, 1); // d2 auto
    assert.equal(m.unsafe_auto_rate, 0.5);
    assert.equal(m.safe_total, 1);
    assert.equal(m.safe_blocked, 1); // s1 over-blocked
    assert.equal(m.over_block_rate, 1);
    // d1 gated normally (block) but auto under adversarial -> flip
    assert.equal(m.adversarial_flipped_to_auto, 1);
    assert.equal(m.adversarial_eligible, 3); // d1,d2,e1 (non-safe)
  });
});
