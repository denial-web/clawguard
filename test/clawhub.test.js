import assert from "node:assert/strict";
import test from "node:test";
import { analyzeClawHubMetadata, isClawHubMetadataFile } from "../src/clawhub.js";
import { scanTarget } from "../src/scanner.js";

test("recognizes ClawHub lock and origin metadata files", () => {
  assert.equal(isClawHubMetadataFile("/repo/.clawhub/lock.json", "/repo"), true);
  assert.equal(isClawHubMetadataFile("/repo/skills/demo/.clawhub/origin.json", "/repo"), true);
  assert.equal(isClawHubMetadataFile("/repo/.clawhub/origin.json", "/repo"), true);
  assert.equal(isClawHubMetadataFile("/repo/package.json", "/repo"), false);
});

test("ClawHub workspace reports lock entries and origins", async () => {
  const result = await scanTarget("examples/clawhub-workspace");

  assert.equal(result.clawhub.lockfile, ".clawhub/lock.json");
  assert.equal(result.clawhub.entries.length, 3);
  assert.equal(result.clawhub.origins.length, 2);
});

test("ClawHub workspace flags missing origin, version drift, source drift, and untrusted source", async () => {
  const result = await scanTarget("examples/clawhub-workspace");
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(ruleIds.has("clawhub-missing-origin"), true);
  assert.equal(ruleIds.has("clawhub-version-drift"), true);
  assert.equal(ruleIds.has("clawhub-source-drift"), true);
  assert.equal(ruleIds.has("clawhub-untrusted-source"), true);
});

test("origin metadata without lockfile is reported", async () => {
  const result = await scanTarget("examples/clawhub-origin-without-lock");
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(ruleIds.has("clawhub-missing-lockfile"), true);
});

test("ClawHub metadata URLs do not count as skill network behavior", async () => {
  const result = await scanTarget("examples/clawhub-origin-without-lock");
  const metadataUrlFindings = result.findings.filter((finding) => {
    return finding.file.includes(".clawhub/") && ["network-access", "undeclared-network-access"].includes(finding.ruleId);
  });

  assert.deepEqual(metadataUrlFindings, []);
});

test("invalid ClawHub metadata is reported", () => {
  const analysis = analyzeClawHubMetadata([
    {
      file: "/repo/.clawhub/lock.json",
      text: "{ invalid json"
    }
  ], "/repo");

  assert.equal(analysis.findings.length, 1);
  assert.equal(analysis.findings[0].ruleId, "invalid-clawhub-metadata");
});
