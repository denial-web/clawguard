import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("CLI device plan blocks drone takeoff", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "device",
      "plan",
      "--device-class",
      "drone",
      "--action",
      "drone-takeoff",
      "--task",
      "Take off for outdoor inspection",
      "--json"
    ], { cwd: process.cwd() }),
    (error) => {
      const result = JSON.parse(error.stdout);
      assert.equal(error.code, 2);
      assert.equal(result.schemaVersion, "clawguard.devicePlan.v1");
      assert.equal(result.decision, "block");
      assert.equal(result.device.class, "drone");
      assert.equal(result.device.action, "drone-takeoff");
      return true;
    }
  );
});

test("CLI device plan allows local observation", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "device",
    "plan",
    "--device-class",
    "security-camera",
    "--action",
    "observe-device",
    "--data-class",
    "internal",
    "--task",
    "List local camera status",
    "--json"
  ], { cwd: process.cwd() });
  const result = JSON.parse(stdout);

  assert.equal(result.decision, "allow");
  assert.equal(result.device.action, "observe-device");
  assert.equal(result.policy.mode, "dry-run");
});

test("CLI device plan requires review for camera recording", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "device",
      "plan",
      "--device-class",
      "security-camera",
      "--action",
      "record-media",
      "--data-class",
      "video-audio",
      "--task",
      "Enable recording on the storefront camera",
      "--json"
    ], { cwd: process.cwd() }),
    (error) => {
      const result = JSON.parse(error.stdout);
      assert.equal(error.code, 1);
      assert.equal(result.decision, "manual_review");
      assert.equal(result.requiredActions.includes("privacy-review"), true);
      assert.equal(result.missingEvidence.some((item) => item.id === "retention-policy"), true);
      return true;
    }
  );
});
