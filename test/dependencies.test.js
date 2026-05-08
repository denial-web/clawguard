import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDependencyManifests, isDependencyFile, isDependencyLockfile } from "../src/dependencies.js";
import { scanTarget } from "../src/scanner.js";

test("recognizes dependency manifests and lockfiles", () => {
  assert.equal(isDependencyFile("/repo/package.json"), true);
  assert.equal(isDependencyFile("/repo/package-lock.json"), true);
  assert.equal(isDependencyFile("/repo/pnpm-lock.yaml"), true);
  assert.equal(isDependencyFile("/repo/yarn.lock"), true);
  assert.equal(isDependencyFile("/repo/requirements.txt"), true);
  assert.equal(isDependencyFile("/repo/pyproject.toml"), true);
  assert.equal(isDependencyFile("/repo/SKILL.md"), false);
  assert.equal(isDependencyLockfile("/repo/package-lock.json"), true);
  assert.equal(isDependencyLockfile("/repo/package.json"), false);
});

test("dependency summary reports manifests and lockfiles", async () => {
  const result = await scanTarget("examples/dependency-safe-skill");

  assert.equal(result.dependencies.manifests.length, 1);
  assert.equal(result.dependencies.lockfiles.length, 1);
  assert.equal(result.dependencies.manifests[0].dependencyCount, 1);
});

test("safe pinned dependency fixture does not report dependency findings", async () => {
  const result = await scanTarget("examples/dependency-safe-skill");
  const dependencyFindings = result.findings.filter((finding) => finding.ruleId.startsWith("dependency-"));

  assert.deepEqual(dependencyFindings, []);
});

test("risky npm dependency fixture reports install script, missing lockfile, unpinned, direct source, and suspicious name", async () => {
  const result = await scanTarget("examples/dependency-risky-skill");
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(ruleIds.has("dependency-install-script"), true);
  assert.equal(ruleIds.has("dependency-lockfile-missing"), true);
  assert.equal(ruleIds.has("dependency-unpinned-spec"), true);
  assert.equal(ruleIds.has("dependency-direct-source"), true);
  assert.equal(ruleIds.has("dependency-suspicious-name"), true);
});

test("python dependency fixture reports range and direct source dependencies", async () => {
  const result = await scanTarget("examples/dependency-python-skill");
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));
  const directFinding = result.findings.find((finding) => finding.ruleId === "dependency-direct-source");

  assert.equal(result.dependencies.manifests.length, 2);
  assert.equal(ruleIds.has("dependency-unpinned-spec"), true);
  assert.equal(ruleIds.has("dependency-direct-source"), true);
  assert.equal(directFinding.evidence, "remote-python@git+https://github.com/example/remote-python.git");
});

test("dependency manifest URLs do not count as generic network behavior", async () => {
  const result = await scanTarget("examples/dependency-python-skill");
  const genericNetworkFindings = result.findings.filter((finding) => finding.ruleId === "network-access");

  assert.deepEqual(genericNetworkFindings, []);
});

test("invalid package manifest is reported", () => {
  const analysis = analyzeDependencyManifests([
    {
      file: "/repo/package.json",
      text: "{ invalid json"
    }
  ], "/repo");

  assert.equal(analysis.findings.length, 1);
  assert.equal(analysis.findings[0].ruleId, "invalid-dependency-manifest");
});
