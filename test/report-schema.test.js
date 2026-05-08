import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import test from "node:test";
import { ruleCatalog, ruleCatalogById } from "../src/rule-catalog.js";
import { rules } from "../src/rules.js";
import { reportSchemaVersion, scanTarget } from "../src/scanner.js";

test("scan result includes stable report schema version", async () => {
  const result = await scanTarget("examples/safe-skill");

  assert.equal(reportSchemaVersion, "1.0.0");
  assert.equal(result.schemaVersion, "1.0.0");
});

test("JSON report schema file is valid JSON and matches current version", async () => {
  const schema = JSON.parse(await fs.readFile("schemas/clawshield-report.schema.json", "utf8"));

  assert.equal(schema.properties.schemaVersion.const, "1.0.0");
  assert.equal(schema.required.includes("schemaVersion"), true);
  assert.equal(schema.required.includes("findings"), true);
  assert.equal(schema.required.includes("policy"), true);
  assert.equal(Boolean(schema.properties.clawhub), true);
  assert.equal(Boolean(schema.$defs.clawhub), true);
  assert.equal(Boolean(schema.properties.dependencies), true);
  assert.equal(Boolean(schema.$defs.dependencies), true);
});

test("static rules are represented in rule catalog", () => {
  for (const rule of rules) {
    assert.ok(ruleCatalogById.has(rule.id), `${rule.id} missing from catalog`);
  }
});

test("observed finding rule IDs are represented in rule catalog", async () => {
  const results = await Promise.all([
    scanTarget("examples/risky-skill"),
    scanTarget("examples/metadata-mismatch-skill"),
    scanTarget("examples/risky-mcp-config"),
    scanTarget("examples/openclaw-plugin-config"),
    scanTarget("examples/clawhub-workspace"),
    scanTarget("examples/dependency-risky-skill")
  ]);
  const observedRuleIds = new Set(results.flatMap((result) => result.findings.map((finding) => finding.ruleId)));

  for (const ruleId of observedRuleIds) {
    assert.ok(ruleCatalogById.has(ruleId), `${ruleId} missing from catalog`);
  }
});

test("rule catalog IDs are unique and metadata is complete", () => {
  const seen = new Set();

  for (const rule of ruleCatalog) {
    assert.equal(seen.has(rule.id), false, `${rule.id} is duplicated`);
    assert.ok(rule.title);
    assert.ok(rule.defaultSeverity);
    assert.ok(rule.category);
    assert.ok(rule.source);
    assert.ok(rule.description);
    assert.equal(Array.isArray(rule.tags), true);
    seen.add(rule.id);
  }
});
