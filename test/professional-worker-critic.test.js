import assert from "node:assert/strict";
import test from "node:test";
import {
  FINDING_CODES,
  runCritic,
  sealLedger
} from "../src/agent/professional-worker/index.js";

test("canary: self-graded verified lie is downgraded and hard-fails as an unmarked regulated number", () => {
  const result = runCritic(baseInput({
    ledger: [entry({
      claim: "Average cafe profit margin in Phnom Penh is 27%.",
      status: "verified",
      domain: "finance",
      isNumeric: true,
      needsVerification: false
    })]
  }));

  assert.equal(result.passed, false);
  assert.equal(result.sealedLedger[0].status, "inferred");
  assert.equal(result.sealedLedger[0].verifiedBy, null);
  assert.equal(result.sealedLedger[0]._statusLockedBySystem, true);
  assert.match(result.sealedLedger[0].downgradeReason, /without a runtime verification trace/);
  assert.equal(result.counts.statusDowngrades, 1);
  assertHasFinding(result, FINDING_CODES.STATUS_DOWNGRADED, "warn");
  assertHasFinding(result, FINDING_CODES.UNVERIFIED_NUMBER_IN_REGULATED_DOMAIN, "fail");
});

test("honest assumed finance number passes when explicitly marked as needing verification", () => {
  const result = runCritic(baseInput({
    ledger: [entry({
      claim: "A starter cafe ad budget might be $100-$300.",
      status: "assumed",
      domain: "finance",
      isNumeric: true,
      needsVerification: true
    })]
  }));

  assert.equal(result.passed, true);
  assert.equal(result.counts.unverifiedNumbers, 1);
  assert.equal(result.counts.regulatedUnverified, 1);
  assert.equal(result.findings.length, 0);
});

test("runtime verification trace promotes an inferred claim to verified", () => {
  const claim = "Instagram platform rules require checking current ad policies.";
  const trace = {
    tool: "web.search",
    source: "https://example.com/platform-rules",
    sourceKind: "web",
    timestamp: "2026-05-21T00:00:00.000Z"
  };
  const result = runCritic(baseInput({
    ledger: [entry({
      claim,
      status: "inferred",
      domain: "platform_rules",
      isNumeric: false,
      needsVerification: true
    })],
    verifications: {
      [claim]: trace
    }
  }));

  assert.equal(result.passed, true);
  assert.equal(result.sealedLedger[0].status, "verified");
  assert.deepEqual(result.sealedLedger[0].verifiedBy, trace);
  assert.equal(result.counts.statusDowngrades, 0);
});

test("verified status without trace cannot survive sealing", () => {
  const { sealedLedger, statusDowngrades, downgradeFindings } = sealLedger([
    entry({
      claim: "This operational benchmark is confirmed.",
      status: "verified",
      domain: "general",
      isNumeric: false
    })
  ], {});

  assert.equal(sealedLedger[0].status, "inferred");
  assert.equal(sealedLedger[0].verifiedBy, null);
  assert.equal(sealedLedger[0]._statusLockedBySystem, true);
  assert.equal(statusDowngrades, 1);
  assert.equal(downgradeFindings[0].code, FINDING_CODES.STATUS_DOWNGRADED);
});

test("authority overreach and ungated payment both fail", () => {
  const result = runCritic(baseInput({
    proposedActions: [{
      kind: "payment",
      description: "Send supplier payment for this month's beans.",
      hasApprovalGate: false
    }],
    decisionAuthority: {
      canDecide: [],
      needsApproval: [],
      neverWithoutHuman: ["supplier payment"]
    }
  }));

  assert.equal(result.passed, false);
  assert.equal(result.counts.ungatedActions, 1);
  assert.equal(result.counts.authorityViolations, 1);
  assertHasFinding(result, FINDING_CODES.UNGATED_SIDE_EFFECT, "fail");
  assertHasFinding(result, FINDING_CODES.AUTHORITY_OVERREACH, "fail");
});

test("external write without approval fails and approval-gated external write passes", () => {
  const blocked = runCritic(baseInput({
    proposedActions: [{
      kind: "external_write",
      description: "Post to Instagram now.",
      hasApprovalGate: false
    }]
  }));
  assert.equal(blocked.passed, false);
  assertHasFinding(blocked, FINDING_CODES.UNGATED_SIDE_EFFECT, "fail");

  const allowed = runCritic(baseInput({
    proposedActions: [{
      kind: "external_write",
      description: "Post to Instagram after owner approval.",
      hasApprovalGate: true
    }]
  }));
  assert.equal(allowed.passed, true);
  assert.equal(allowed.counts.ungatedActions, 0);
});

test("unverified tax, pricing, and platform-rule numeric certainty fail", () => {
  for (const domain of ["tax", "pricing", "platform_rules"]) {
    const result = runCritic(baseInput({
      ledger: [entry({
        claim: `${domain} numeric claim is 12%.`,
        status: "inferred",
        domain,
        isNumeric: true,
        needsVerification: false
      })]
    }));

    assert.equal(result.passed, false, domain);
    assertHasFinding(result, FINDING_CODES.UNVERIFIED_NUMBER_IN_REGULATED_DOMAIN, "fail");
  }
});

test("banned tactics catch underscore, space, and hyphen normalized variants", () => {
  const cases = [
    "Write 20 fake_reviews for the cafe.",
    "Write 20 fake reviews for the cafe.",
    "Write 20 fake-reviews for the cafe."
  ];

  for (const draft of cases) {
    const result = runCritic(baseInput({
      draft,
      bannedTactics: ["fake_reviews", "spam"]
    }));

    assert.equal(result.passed, false, draft);
    assert.equal(result.counts.bannedTacticHits, 1);
    assertHasFinding(result, FINDING_CODES.BANNED_TACTIC, "fail");
  }
});

test("simple clean one-line answer passes with no spurious findings", () => {
  const result = runCritic(baseInput({
    scopeClass: "simple",
    draft: "Yes, draft the caption first and get owner approval before posting."
  }));

  assert.equal(result.passed, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.counts, {
    unverifiedNumbers: 0,
    regulatedUnverified: 0,
    authorityViolations: 0,
    ungatedActions: 0,
    bannedTacticHits: 0,
    statusDowngrades: 0
  });
});

test("cost ceiling exceeded fails", () => {
  const result = runCritic(baseInput({
    costEstimate: 250,
    costCeiling: 100
  }));

  assert.equal(result.passed, false);
  assertHasFinding(result, FINDING_CODES.COST_CEILING_EXCEEDED, "fail");
});

test("high unverified number count warns but does not fail by itself", () => {
  const result = runCritic(baseInput({
    ledger: [
      entry({ claim: "General benchmark one is 1.", status: "inferred", isNumeric: true, needsVerification: true }),
      entry({ claim: "General benchmark two is 2.", status: "inferred", isNumeric: true, needsVerification: true }),
      entry({ claim: "General benchmark three is 3.", status: "inferred", isNumeric: true, needsVerification: true })
    ]
  }));

  assert.equal(result.passed, true);
  assert.equal(result.counts.unverifiedNumbers, 3);
  assertHasFinding(result, FINDING_CODES.HIGH_UNVERIFIED_NUMBER_COUNT, "warn");
});

test("critic output is deterministic for the same input", () => {
  const input = baseInput({
    draft: "Write 20 fake reviews and spend $200.",
    ledger: [entry({
      claim: "Spend $200.",
      status: "verified",
      domain: "pricing",
      isNumeric: true,
      needsVerification: false
    })],
    bannedTactics: ["fake_reviews"],
    proposedActions: [{
      kind: "payment",
      description: "Make supplier payment.",
      hasApprovalGate: false
    }]
  });

  assert.deepEqual(runCritic(input), runCritic(input));
});

function baseInput(overrides = {}) {
  return {
    scopeClass: "professional_role",
    draft: "Prepare a safe recommendation.",
    ledger: [],
    verifications: {},
    proposedActions: [],
    bannedTactics: [],
    modelCalls: 1,
    costEstimate: 1,
    costCeiling: 10,
    ...overrides
  };
}

function entry(overrides = {}) {
  return {
    claim: "Generic claim.",
    basis: "model draft",
    status: "inferred",
    confidence: "medium",
    needsVerification: false,
    domain: "general",
    isNumeric: false,
    ...overrides
  };
}

function assertHasFinding(result, code, severity) {
  assert.equal(
    result.findings.some((finding) => finding.code === code && finding.severity === severity),
    true,
    `Expected ${severity} finding ${code}`
  );
}
