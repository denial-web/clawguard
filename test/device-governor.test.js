import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import test from "node:test";
import { createDevicePlan } from "../src/device-governor.js";

test("device plan blocks drone takeoff in MVP", () => {
  const plan = createDevicePlan({
    deviceClass: "drone",
    action: "drone-takeoff",
    dataClass: "location",
    task: "Take off for outdoor inspection"
  });

  assert.equal(plan.schemaVersion, "clawguard.devicePlan.v1");
  assert.equal(plan.decision, "block");
  assert.equal(plan.requiredActions.includes("do-not-execute"), true);
  assert.equal(plan.requiredActions.includes("verify-aviation-compliance"), true);
  assert.equal(plan.missingEvidence.some((item) => item.id === "simulation-evidence"), true);
  assert.equal(plan.missingEvidence.some((item) => item.id === "geofence"), true);
});

test("device plan blocks disabling safety controls", () => {
  const plan = createDevicePlan({
    deviceClass: "embedded-iot",
    action: "disable-safety",
    dataClass: "safety-critical",
    task: "Disable watchdog before firmware test"
  });

  assert.equal(plan.decision, "block");
  assert.match(plan.reason, /Disabling/);
});

test("device plan requires dual approval for firmware update", () => {
  const plan = createDevicePlan({
    deviceClass: "embedded-iot",
    action: "firmware-update",
    dataClass: "firmware",
    task: "Flash new firmware to an ESP32 relay controller"
  });

  assert.equal(plan.decision, "dual_approval");
  assert.equal(plan.requiredActions.includes("maker-checker-approval"), true);
  assert.equal(plan.requiredActions.includes("prepare-firmware-rollback"), true);
  assert.equal(plan.missingEvidence.some((item) => item.id === "rollback-plan"), true);
});

test("device plan allows local camera analysis while requiring privacy evidence", () => {
  const plan = createDevicePlan({
    deviceClass: "security-camera",
    action: "analyze-media-local",
    dataClass: "video-audio",
    task: "Detect packages locally from an RTSP camera feed"
  });

  assert.equal(plan.decision, "allow");
  assert.equal(plan.requiredActions.includes("privacy-review"), true);
  assert.equal(plan.missingEvidence.some((item) => item.id === "privacy-review"), true);
});

test("device skill manifest schema is valid JSON and matches current version", async () => {
  const schema = JSON.parse(await fs.readFile("schemas/clawguard-device-skill.schema.json", "utf8"));

  assert.equal(schema.properties.schemaVersion.const, "clawguard.deviceSkill.v1");
  assert.equal(schema.properties.deviceClass.enum.includes("drone"), true);
  assert.equal(schema.properties.actionClasses.items.enum.includes("drone-takeoff"), true);
});
