import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeMcpConfigs, isMcpConfigFile } from "../src/mcp-config.js";
import { scanTarget } from "../src/scanner.js";

test("recognizes common MCP and OpenClaw plugin config paths", () => {
  assert.equal(isMcpConfigFile("/repo/.cursor/mcp.json", "/repo"), true);
  assert.equal(isMcpConfigFile("/repo/.openclaw/mcp.json", "/repo"), true);
  assert.equal(isMcpConfigFile("/repo/.openclaw/plugins.json", "/repo"), true);
  assert.equal(isMcpConfigFile("/repo/mcp.json", "/repo"), true);
  assert.equal(isMcpConfigFile("/repo/plugins/demo/openclaw.plugin.json", "/repo"), true);
  assert.equal(isMcpConfigFile("/repo/package.json", "/repo"), false);
});

test("safe MCP config does not trigger MCP-specific findings", async () => {
  const result = await scanTarget("examples/safe-mcp-config");
  const mcpFindings = result.findings.filter((finding) => finding.ruleId.startsWith("mcp-"));

  assert.deepEqual(mcpFindings, []);
});

test("risky MCP config reports package, secret, broad filesystem, shell, URL, and write risks", async () => {
  const result = await scanTarget("examples/risky-mcp-config");
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(ruleIds.has("mcp-runtime-package-command"), true);
  assert.equal(ruleIds.has("mcp-unpinned-package"), true);
  assert.equal(ruleIds.has("mcp-secret-env"), true);
  assert.equal(ruleIds.has("mcp-broad-filesystem-access"), true);
  assert.equal(ruleIds.has("mcp-shell-execution"), true);
  assert.equal(ruleIds.has("mcp-remote-url"), true);
  assert.equal(ruleIds.has("mcp-write-capability"), true);
});

test("OpenClaw plugin config reports plugin runtime and capability risks", async () => {
  const result = await scanTarget("examples/openclaw-plugin-config");
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(ruleIds.has("mcp-runtime-package-command"), true);
  assert.equal(ruleIds.has("mcp-secret-env"), true);
  assert.equal(ruleIds.has("mcp-remote-url"), true);
  assert.equal(ruleIds.has("mcp-write-capability"), true);
});

test("safe OpenClaw plugin package reports only code execution risk", async () => {
  const result = await scanTarget("examples/safe-openclaw-plugin");
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(ruleIds.has("openclaw-plugin-code-execution"), true);
  assert.equal(ruleIds.has("openclaw-plugin-missing-compat-metadata"), false);
  assert.equal(ruleIds.has("openclaw-plugin-missing-runtime-output"), false);
  assert.equal(ruleIds.has("openclaw-plugin-sensitive-capability"), false);
});

test("risky OpenClaw plugin package reports compatibility, runtime, and sensitive capability risks", async () => {
  const result = await scanTarget("examples/risky-openclaw-plugin");
  const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

  assert.equal(ruleIds.has("openclaw-plugin-missing-compat-metadata"), true);
  assert.equal(ruleIds.has("openclaw-plugin-code-execution"), true);
  assert.equal(ruleIds.has("openclaw-plugin-missing-runtime-output"), true);
  assert.equal(ruleIds.has("openclaw-plugin-sensitive-capability"), true);
  assert.equal(ruleIds.has("mcp-write-capability"), true);
});

test("invalid MCP config is reported as a finding", () => {
  const findings = analyzeMcpConfigs([
    {
      file: "/tmp/mcp.json",
      text: "{ invalid json"
    }
  ], "/tmp");

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, "invalid-mcp-config");
});

test("generic mcp.json risky config is detected", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawshield-mcp-"));

  try {
    await fs.writeFile(path.join(dir, "mcp.json"), JSON.stringify({
      mcpServers: {
        remote: {
          command: "uvx",
          args: ["mcp-server-fetch"],
          env: {
            API_TOKEN: "${API_TOKEN}"
          }
        }
      }
    }));

    const result = await scanTarget(dir);
    const ruleIds = new Set(result.findings.map((finding) => finding.ruleId));

    assert.equal(ruleIds.has("mcp-runtime-package-command"), true);
    assert.equal(ruleIds.has("mcp-unpinned-package"), true);
    assert.equal(ruleIds.has("mcp-secret-env"), true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
