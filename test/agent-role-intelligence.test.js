import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import test from "node:test";
import { evaluateAsflcDecision, scoreAsflcChain } from "../src/agent/asflc.js";
import {
  buildRoleArtifacts,
  evaluateRoleAction,
  listRolePacks,
  loadRolePack,
  runRoleCadenceCommand,
  showRolePackCommand,
  validateRolePack
} from "../src/agent/role-intelligence.js";

const execFileAsync = promisify(execFile);

test("A-S-FLC buffers estimated negatives by uncertainty", () => {
  const scored = scoreAsflcChain({
    id: "uncertain-path",
    events: [
      {
        positives: [{ score: 5 }],
        negatives: [{ score: 1 }, { score: 4 }]
      }
    ]
  });

  assert.equal(scored.breakdown.positiveExact, 5);
  assert.equal(scored.breakdown.negativeEstimated, 5);
  assert.ok(scored.breakdown.uncertaintyFactor > 1);
  assert.ok(scored.breakdown.negativeBuffered > scored.breakdown.negativeEstimated);
  assert.ok(scored.breakdown.net < 0);
});

test("A-S-FLC blocks critical asymmetric downside even with short-term upside", () => {
  const decision = evaluateAsflcDecision({
    task: "create fake reviews",
    chains: [
      {
        id: "fake-review",
        risk: "critical",
        blocked: true,
        riskFlags: ["fake-review", "deceptive"],
        events: [
          {
            positives: [{ score: 2 }],
            negatives: [{ score: 8 }],
            blocked: true
          }
        ]
      }
    ]
  });

  assert.equal(decision.route, "BLOCK");
  assert.equal(decision.approvalRequired, false);
  assert.equal(decision.riskFlags.includes("fake-review"), true);
});

test("lists cafe marketing manager role pack", async () => {
  const packs = await listRolePacks();
  const cafeMarketing = packs.find((pack) => pack.id === "small-business/cafe/marketing-manager");

  assert.ok(cafeMarketing);
  assert.equal(cafeMarketing.industry, "cafe");
  assert.equal(cafeMarketing.role, "marketing-manager");
  assert.equal(cafeMarketing.artifactCount, 7);
});

test("role pack exposes seven role-intelligence artifacts", async () => {
  const { pack } = await loadRolePack("small-business/cafe/marketing-manager");
  const artifacts = buildRoleArtifacts(pack);

  assert.equal(artifacts.length, 7);
  assert.equal(artifacts.some((artifact) => artifact.id === "decision_authority"), true);
  assert.equal(artifacts.every((artifact) => artifact.content), true);
});

test("role actions route local, approval-required, and blocked actions", async () => {
  const { pack } = await loadRolePack("small-business/cafe/marketing-manager");

  assert.equal(evaluateRoleAction(pack, "draft-social-post").route, "LOCAL");
  assert.equal(evaluateRoleAction(pack, "publish-social-post").route, "APPROVAL_REQUIRED");
  assert.equal(evaluateRoleAction(pack, "launch-paid-ad").route, "APPROVAL_REQUIRED");
  assert.equal(evaluateRoleAction(pack, "send-promo-customer-list").route, "APPROVAL_REQUIRED");
  assert.equal(evaluateRoleAction(pack, "change-menu-price").route, "APPROVAL_REQUIRED");
  assert.equal(evaluateRoleAction(pack, "create-fake-reviews").route, "BLOCK");
  assert.equal(evaluateRoleAction(pack, "claim-drink-cures-illness").route, "BLOCK");
});

test("role cadence run keeps task routes governed", async () => {
  const result = await runRoleCadenceCommand({
    roleId: "small-business/cafe/marketing-manager",
    cadence: "weekly"
  });

  assert.equal(result.schemaVersion, "clawguard.roleRun.v1");
  assert.equal(result.artifactsReady, true);
  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks.some((task) => task.route === "APPROVAL_REQUIRED"), true);
  assert.equal(result.approvalRequiredActions.some((action) => action.id === "launch-paid-ad"), true);
  assert.equal(result.validationQuestions.length > 0, true);
});

test("role show command includes evaluated governed actions", async () => {
  const result = await showRolePackCommand({
    roleId: "small-business/cafe/marketing-manager"
  });

  assert.equal(result.schemaVersion, "clawguard.roleShow.v1");
  assert.equal(result.actions.some((action) => action.id === "create-fake-reviews" && action.route === "BLOCK"), true);
  assert.equal(result.validationQuestions.some((question) => question.includes("owner-approved")), true);
});

test("role pack validation rejects unknown cadence action references", async () => {
  const { pack } = await loadRolePack("small-business/cafe/marketing-manager");
  const invalid = structuredClone(pack);
  invalid.cadence.daily[0].actionIds.push("missing-action");

  assert.throws(
    () => validateRolePack(invalid, "invalid-role.json"),
    /references unknown action: missing-action/
  );
});

test("role pack validation rejects duplicate action ids", async () => {
  const { pack } = await loadRolePack("small-business/cafe/marketing-manager");
  const invalid = structuredClone(pack);
  invalid.actions.push(structuredClone(invalid.actions[0]));

  assert.throws(
    () => validateRolePack(invalid, "duplicate-role.json"),
    /duplicate action id/
  );
});

test("role pack schema is valid JSON and matches current version", async () => {
  const schema = JSON.parse(await fs.readFile("schemas/role-pack.schema.json", "utf8"));

  assert.equal(schema.properties.schemaVersion.const, "clawguard.rolePack.v1");
});

test("CLI lists role packs", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "agent",
    "role",
    "list",
    "--json"
  ], { cwd: process.cwd() });
  const list = JSON.parse(result.stdout);

  assert.equal(list.schemaVersion, "clawguard.roleList.v1");
  assert.equal(list.packs.some((pack) => pack.id === "small-business/cafe/marketing-manager"), true);
});

test("CLI runs a role cadence", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "agent",
    "role",
    "run",
    "small-business/cafe/marketing-manager",
    "--cadence",
    "event",
    "--json"
  ], { cwd: process.cwd() });
  const output = JSON.parse(result.stdout);

  assert.equal(output.schemaVersion, "clawguard.roleRun.v1");
  assert.equal(output.cadence, "eventDriven");
  assert.equal(output.blockedActions.some((action) => action.id === "create-fake-reviews"), true);
  assert.equal(output.blockedActions.some((action) => action.id === "claim-drink-cures-illness"), true);
});
