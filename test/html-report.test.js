import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createHtmlReport } from "../src/reporters/html.js";
import { scanTarget } from "../src/scanner.js";

const execFileAsync = promisify(execFile);

test("creates a self-contained HTML report with key scan details", async () => {
  const result = await scanTarget("examples/metadata-mismatch-skill", { policy: "governed" });
  const html = createHtmlReport(result);

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /ClawShield Report/);
  assert.match(html, /Policy Decision/);
  assert.match(html, /not declared/);
  assert.match(html, /Required actions/);
  assert.equal(html.includes("<script"), false);
});

test("HTML report escapes finding content", () => {
  const html = createHtmlReport({
    schemaVersion: "1.0.0",
    target: "/tmp/<target>",
    score: 10,
    level: "low",
    filesScanned: 1,
    filesSkipped: 0,
    skippedFiles: [],
    findings: [
      {
        ruleId: "network-access",
        title: "<img src=x onerror=alert(1)>",
        severity: "low",
        recommendation: "Use <safe> output",
        file: "SKILL.md",
        line: 1,
        evidence: "<script>alert(1)</script>"
      }
    ],
    suppressedFindings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 1 },
    policy: {
      preset: "personal",
      decision: "warn",
      reason: "Contains <markup>",
      requiredActions: []
    },
    options: {
      maxFileSizeBytes: 1024,
      maxFindingsPerRulePerFile: 5
    },
    configPath: null
  });

  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.equal(html.includes("<img src=x"), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;target&gt;/);
});

test("CLI writes HTML report before exiting on risk threshold", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawshield-html-"));
  const htmlPath = path.join(dir, "clawshield.html");

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        "src/cli.js",
        "scan",
        "examples/metadata-mismatch-skill",
        "--html",
        htmlPath
      ], { cwd: process.cwd() }),
      (error) => error.code === 2
    );

    const html = await fs.readFile(htmlPath, "utf8");
    assert.match(html, /ClawShield Report/);
    assert.match(html, /Policy Decision/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("HTML report includes workspace skill summary when present", async () => {
  const result = await scanTarget("examples/openclaw-workspace");
  const html = createHtmlReport(result);

  assert.match(html, /Workspace Skills/);
  assert.match(html, /research-helper/);
  assert.match(html, /skills\/research-helper\/SKILL.md/);
});

test("HTML report includes ClawHub metadata summary when present", async () => {
  const result = await scanTarget("examples/clawhub-workspace");
  const html = createHtmlReport(result);

  assert.match(html, /ClawHub Metadata/);
  assert.match(html, /\.clawhub\/lock\.json/);
  assert.match(html, /weather-helper/);
  assert.match(html, /Origin Records/);
});

test("HTML report includes dependency summary when present", async () => {
  const result = await scanTarget("examples/dependency-risky-skill");
  const html = createHtmlReport(result);

  assert.match(html, /Dependencies/);
  assert.match(html, /package\.json/);
  assert.match(html, /dependency-risky-skill/);
});
