import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { checkSopWorkflow } from "../src/sop/checker.js";
import { listSopPacks, loadSopPack, resolveSopPackId } from "../src/sop/loader.js";
import { createSopWorkflowTemplate, defaultSopWorkflowPath } from "../src/sop/template.js";

const execFileAsync = promisify(execFile);

test("lists built-in SOP packs", async () => {
  const packs = await listSopPacks();
  const milkTea = packs.find((pack) => pack.id === "small-business/milk-tea/closing");

  assert.ok(milkTea);
  assert.equal(milkTea.industry, "milk-tea");
  assert.equal(milkTea.role, "shift-manager");
  assert.equal(milkTea.evidenceCount, 8);
});

test("resolves default SOP pack by industry", async () => {
  const packId = await resolveSopPackId({ industry: "milk-tea" });

  assert.equal(packId, "small-business/milk-tea/closing");
});

test("resolves cafe and mart SOP packs by industry", async () => {
  assert.equal(await resolveSopPackId({ industry: "cafe" }), "small-business/cafe/closing");
  assert.equal(await resolveSopPackId({ industry: "mart" }), "small-business/mart/daily-close");
});

test("milk tea closing SOP blocks completion when required evidence and signoff are missing", async () => {
  const { pack } = await loadSopPack("small-business/milk-tea/closing");
  const result = await checkSopWorkflow(pack, "examples/sop-workflows/milk-tea-closing-incomplete.json");

  assert.equal(result.decision, "block");
  assert.equal(result.missingEvidence.some((item) => item.id === "boba-discard-time"), true);
  assert.equal(result.missingEvidence.some((item) => item.id === "fridge-temperature-log"), true);
  assert.equal(result.thresholdFindings.some((item) => item.id === "cash-variance"), true);
  assert.equal(result.approvalFindings.some((item) => item.id === "manager-signoff"), true);
  assert.equal(result.blockedActions.some((item) => item.id === "complete-close-without-manager-signoff"), true);
  assert.equal(result.requiredActions.includes("do-not-complete-sop"), true);
});

test("milk tea closing SOP allows complete evidence and approval", async () => {
  const { pack } = await loadSopPack("small-business/milk-tea/closing");
  const result = await checkSopWorkflow(pack, "examples/sop-workflows/milk-tea-closing-complete.json");

  assert.equal(result.decision, "allow");
  assert.equal(result.missingEvidence.length, 0);
  assert.equal(result.thresholdFindings.length, 0);
  assert.equal(result.approvalFindings.length, 0);
  assert.equal(result.blockedActions.length, 0);
});

test("cafe closing SOP blocks incomplete close and allows complete workflow", async () => {
  const { pack } = await loadSopPack("small-business/cafe/closing");
  const incomplete = await checkSopWorkflow(pack, "examples/sop-workflows/cafe-closing-incomplete.json");
  const complete = await checkSopWorkflow(pack, "examples/sop-workflows/cafe-closing-complete.json");

  assert.equal(incomplete.decision, "block");
  assert.equal(incomplete.missingEvidence.some((item) => item.id === "milk-and-cold-storage-temperature-log"), true);
  assert.equal(incomplete.thresholdFindings.some((item) => item.id === "cash-variance"), true);
  assert.equal(incomplete.thresholdFindings.some((item) => item.id === "cold-storage-temperature"), true);
  assert.equal(incomplete.approvalFindings.some((item) => item.id === "manager-signoff"), true);
  assert.equal(incomplete.blockedActions.some((item) => item.id === "complete-close-without-manager-signoff"), true);

  assert.equal(complete.decision, "allow");
  assert.equal(complete.missingEvidence.length, 0);
  assert.equal(complete.thresholdFindings.length, 0);
  assert.equal(complete.approvalFindings.length, 0);
});

test("mart daily close SOP blocks incomplete close and allows complete workflow", async () => {
  const { pack } = await loadSopPack("small-business/mart/daily-close");
  const incomplete = await checkSopWorkflow(pack, "examples/sop-workflows/mart-daily-close-incomplete.json");
  const complete = await checkSopWorkflow(pack, "examples/sop-workflows/mart-daily-close-complete.json");

  assert.equal(incomplete.decision, "block");
  assert.equal(incomplete.missingEvidence.some((item) => item.id === "cash-safe-deposit-log"), true);
  assert.equal(incomplete.missingEvidence.some((item) => item.id === "security-and-alarm-check"), true);
  assert.equal(incomplete.thresholdFindings.some((item) => item.id === "cash-variance"), true);
  assert.equal(incomplete.thresholdFindings.some((item) => item.id === "cold-case-temperature"), true);
  assert.equal(incomplete.blockedActions.some((item) => item.id === "close-with-unsecured-cash"), true);

  assert.equal(complete.decision, "allow");
  assert.equal(complete.missingEvidence.length, 0);
  assert.equal(complete.thresholdFindings.length, 0);
  assert.equal(complete.approvalFindings.length, 0);
});

test("creates a workflow template from a SOP pack", async () => {
  const { pack } = await loadSopPack("small-business/milk-tea/closing");
  const template = createSopWorkflowTemplate(pack);

  assert.equal(defaultSopWorkflowPath(pack), "small-business-milk-tea-closing.workflow.json");
  assert.equal(template.schemaVersion, "clawguard.sopWorkflow.v1");
  assert.equal(template.pack, "small-business/milk-tea/closing");
  assert.deepEqual(template.actions, ["complete_close"]);
  assert.equal(template.evidence["boba-discard-time"], null);
  assert.equal(template.approvals["manager-signoff"], null);
  assert.equal(template.metrics.cashVarianceUsd, null);
});

test("SOP pack schema is valid JSON and matches current version", async () => {
  const schema = JSON.parse(await fs.readFile("schemas/sop-pack.schema.json", "utf8"));

  assert.equal(schema.properties.schemaVersion.const, "clawguard.sopPack.v1");
});

test("CLI lists SOP packs", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "sop",
    "list",
    "--json"
  ], { cwd: process.cwd() });
  const list = JSON.parse(result.stdout);

  assert.equal(list.schemaVersion, "clawguard.sopList.v1");
  assert.equal(list.packs.some((pack) => pack.id === "small-business/milk-tea/closing"), true);
  assert.equal(list.packs.some((pack) => pack.id === "small-business/cafe/closing"), true);
  assert.equal(list.packs.some((pack) => pack.id === "small-business/mart/daily-close"), true);
});

test("CLI initializes SOP workflow templates", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-sop-init-"));
  const outputPath = path.join(workspace, "close.json");

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "sop",
    "init",
    "--pack",
    "small-business/milk-tea/closing",
    "--out",
    outputPath,
    "--json"
  ], { cwd: process.cwd() });
  const init = JSON.parse(result.stdout);
  const workflow = JSON.parse(await fs.readFile(outputPath, "utf8"));

  assert.equal(init.schemaVersion, "clawguard.sopInit.v1");
  assert.equal(init.pack.id, "small-business/milk-tea/closing");
  assert.equal(workflow.pack, "small-business/milk-tea/closing");
  assert.equal(workflow.evidence["fridge-temperature-log"], null);
});

test("CLI SOP init refuses to overwrite without force", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-sop-init-"));
  const outputPath = path.join(workspace, "close.json");

  await fs.writeFile(outputPath, "{\"existing\":true}\n");

  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "sop",
    "init",
    "--industry",
    "milk-tea",
    "--out",
    outputPath,
    "--json"
  ], { cwd: process.cwd() });
  const init = JSON.parse(result.stdout);
  const workflow = JSON.parse(await fs.readFile(outputPath, "utf8"));

  assert.equal(init.written.length, 0);
  assert.equal(init.skipped.includes(outputPath), true);
  assert.equal(workflow.existing, true);
});

test("CLI checks SOP workflow and exits with block code", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "sop",
      "check",
      "--pack",
      "small-business/milk-tea/closing",
      "examples/sop-workflows/milk-tea-closing-incomplete.json",
      "--json"
    ], { cwd: process.cwd() }),
    (error) => {
      const result = JSON.parse(error.stdout);

      assert.equal(error.code, 2);
      assert.equal(result.schemaVersion, "clawguard.sopCheck.v1");
      assert.equal(result.decision, "block");
      assert.equal(result.blockedActions.length > 0, true);
      return true;
    }
  );
});

test("CLI can check SOP workflow by industry", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "sop",
    "check",
    "--industry",
    "milk-tea",
    "examples/sop-workflows/milk-tea-closing-complete.json",
    "--json"
  ], { cwd: process.cwd() });
  const check = JSON.parse(result.stdout);

  assert.equal(check.pack.id, "small-business/milk-tea/closing");
  assert.equal(check.decision, "allow");
});
