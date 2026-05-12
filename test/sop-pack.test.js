import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import test from "node:test";
import { checkSopWorkflow } from "../src/sop/checker.js";
import { listSopPacks, loadSopPack, resolveSopPackId } from "../src/sop/loader.js";

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
