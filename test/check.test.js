import assert from "node:assert/strict";
import test from "node:test";
import { checkExitCode, createCheckResult, mapCheckDecision, mapRecommendedAction } from "../src/check.js";

function syntheticScan(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    target: "/tmp/example",
    score: 0,
    level: "info",
    filesScanned: 1,
    filesSkipped: 0,
    skippedFiles: [],
    findings: [],
    suppressedFindings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0 },
    options: { policy: "personal", maxFileSizeBytes: 1024, maxFindingsPerRulePerFile: 5, suppressions: [] },
    policy: {
      preset: "personal",
      decision: "allow",
      rank: 0,
      reason: "no findings",
      requiredActions: []
    },
    configPath: null,
    ...overrides
  };
}

test("createCheckResult projects allow with no findings", () => {
  const scan = syntheticScan();
  const result = createCheckResult(scan, { generatedAt: "2026-05-25T00:00:00.000Z" });

  assert.equal(result.schemaVersion, "clawguard.check.v1");
  assert.equal(result.target, "/tmp/example");
  assert.equal(result.decision, "allow");
  assert.equal(result.risk, "info");
  assert.equal(result.recommendedAction, "auto_install");
  assert.equal(result.policyPreset, "personal");
  assert.equal(result.summary, "No risky patterns detected.");
  assert.deepEqual(result.findingSummary, { critical: 0, high: 0, medium: 0, low: 0 });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.requiredActions, []);
  assert.equal(result.scanReportPath, null);
  assert.equal(result.configPath, null);
  assert.equal(result.generatedAt, "2026-05-25T00:00:00.000Z");
});

test("createCheckResult emits exactly the documented top-level fields", () => {
  const scan = syntheticScan();
  const result = createCheckResult(scan, { generatedAt: "2026-05-25T00:00:00.000Z" });
  const expectedKeys = new Set([
    "schemaVersion",
    "target",
    "decision",
    "risk",
    "summary",
    "recommendedAction",
    "policyPreset",
    "findingSummary",
    "findings",
    "requiredActions",
    "scanReportPath",
    "configPath",
    "generatedAt"
  ]);
  const actualKeys = new Set(Object.keys(result));

  assert.deepEqual(actualKeys, expectedKeys);
});

test("createCheckResult collapses warn into manual_review", () => {
  const scan = syntheticScan({
    level: "medium",
    summary: { critical: 0, high: 0, medium: 1, low: 0 },
    findings: [
      { ruleId: "broad-permissions", title: "Requests broad permissions", severity: "medium", file: "SKILL.md", line: 5, evidence: "shell" }
    ],
    policy: { preset: "governed", decision: "warn", rank: 1, reason: "medium severity", requiredActions: [] }
  });
  const result = createCheckResult(scan);

  assert.equal(result.decision, "manual_review");
  assert.equal(result.recommendedAction, "require_user_approval");
  assert.equal(result.risk, "medium");
  assert.match(result.summary, /Manual review: Requests broad permissions\./);
});

test("createCheckResult collapses sandbox_required and dual_approval into manual_review", () => {
  for (const scanDecision of ["sandbox_required", "dual_approval", "manual_review"]) {
    const scan = syntheticScan({
      level: "high",
      policy: { preset: "enterprise", decision: scanDecision, rank: 3, reason: "high", requiredActions: ["sandbox before trust"] }
    });
    const result = createCheckResult(scan);

    assert.equal(result.decision, "manual_review", `expected manual_review for ${scanDecision}`);
    assert.equal(result.recommendedAction, "require_user_approval");
    assert.deepEqual(result.requiredActions, ["sandbox before trust"]);
  }
});

test("createCheckResult projects block with top finding in summary", () => {
  const scan = syntheticScan({
    level: "critical",
    summary: { critical: 1, high: 0, medium: 0, low: 0 },
    findings: [
      { ruleId: "remote-code-execution", title: "Downloads or executes remote code", severity: "critical", file: "SKILL.md", line: 10, evidence: "curl ..." }
    ],
    policy: { preset: "personal", decision: "block", rank: 5, reason: "critical", requiredActions: ["do-not-install"] }
  });
  const result = createCheckResult(scan);

  assert.equal(result.decision, "block");
  assert.equal(result.recommendedAction, "reject");
  assert.equal(result.risk, "critical");
  assert.equal(result.summary, "Blocked: Downloads or executes remote code.");
});

test("createCheckResult sorts findings by severity then file and caps at 10", () => {
  const findings = [
    { ruleId: "low-a", title: "low a", severity: "low", file: "b.md", line: 1, evidence: "x" },
    { ruleId: "crit", title: "crit", severity: "critical", file: "z.md", line: 1, evidence: "x" },
    { ruleId: "high-a", title: "high a", severity: "high", file: "b.md", line: 1, evidence: "x" },
    { ruleId: "high-b", title: "high b", severity: "high", file: "a.md", line: 1, evidence: "x" },
    ...Array.from({ length: 10 }).map((_, i) => ({
      ruleId: `low-${i}`,
      title: `low ${i}`,
      severity: "low",
      file: `padding-${i}.md`,
      line: 1,
      evidence: "x"
    }))
  ];
  const scan = syntheticScan({
    level: "critical",
    summary: { critical: 1, high: 2, medium: 0, low: 11 },
    findings,
    policy: { preset: "personal", decision: "block", rank: 5, reason: "critical", requiredActions: [] }
  });
  const result = createCheckResult(scan);

  assert.equal(result.findings.length, 10);
  assert.equal(result.findings[0].severity, "critical");
  assert.equal(result.findings[1].severity, "high");
  assert.equal(result.findings[1].file, "a.md");
  assert.equal(result.findings[2].severity, "high");
  assert.equal(result.findings[2].file, "b.md");
});

test("createCheckResult emits only documented finding fields", () => {
  const scan = syntheticScan({
    findings: [
      { ruleId: "x", title: "X", severity: "high", file: "f.md", line: 2, evidence: "e", recommendation: "do thing", extra: "leak" }
    ],
    summary: { critical: 0, high: 1, medium: 0, low: 0 },
    policy: { preset: "personal", decision: "block", rank: 5, reason: "high", requiredActions: [] }
  });
  const result = createCheckResult(scan);
  const finding = result.findings[0];

  assert.deepEqual(new Set(Object.keys(finding)), new Set(["ruleId", "title", "severity", "file", "line", "evidence"]));
  assert.equal(finding.evidence, "e");
});

test("createCheckResult clamps summary at 280 characters", () => {
  const longTitle = "X".repeat(400);
  const scan = syntheticScan({
    findings: [{ ruleId: "x", title: longTitle, severity: "critical", file: "f.md", line: 1, evidence: "e" }],
    summary: { critical: 1, high: 0, medium: 0, low: 0 },
    policy: { preset: "personal", decision: "block", rank: 5, reason: "x", requiredActions: [] }
  });
  const result = createCheckResult(scan);

  assert.ok(result.summary.length <= 280, `summary too long: ${result.summary.length}`);
  assert.ok(result.summary.endsWith("..."));
});

test("createCheckResult records scanReportPath when supplied", () => {
  const scan = syntheticScan();
  const result = createCheckResult(scan, { scanReportPath: "/tmp/scan.json" });

  assert.equal(result.scanReportPath, "/tmp/scan.json");
});

test("checkExitCode maps decisions to 0/1/2", () => {
  assert.equal(checkExitCode("allow"), 0);
  assert.equal(checkExitCode("manual_review"), 1);
  assert.equal(checkExitCode("block"), 2);
});

test("mapCheckDecision covers the full scan decision enum", () => {
  assert.equal(mapCheckDecision("allow"), "allow");
  assert.equal(mapCheckDecision("warn"), "manual_review");
  assert.equal(mapCheckDecision("manual_review"), "manual_review");
  assert.equal(mapCheckDecision("sandbox_required"), "manual_review");
  assert.equal(mapCheckDecision("dual_approval"), "manual_review");
  assert.equal(mapCheckDecision("block"), "block");
});

test("mapRecommendedAction follows the spec table", () => {
  assert.equal(mapRecommendedAction("allow"), "auto_install");
  assert.equal(mapRecommendedAction("manual_review"), "require_user_approval");
  assert.equal(mapRecommendedAction("block"), "reject");
});
