import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("gate allows a safe skill with exit code 0", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "gate",
    "examples/safe-skill"
  ], { cwd: process.cwd() });

  assert.match(result.stdout, /ClawGuard gate:/);
  assert.match(result.stdout, /Decision: ALLOW/);
  assert.match(result.stdout, /Exit code: 0/);
});

test("gate blocks a risky skill with exit code 2", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "src/cli.js",
      "gate",
      "examples/risky-skill"
    ], { cwd: process.cwd() }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stdout, /Decision: BLOCK/);
      assert.match(error.stdout, /do-not-install/);
      return true;
    }
  );
});

test("gate emits machine-readable JSON", async () => {
  const result = await execFileAsync(process.execPath, [
    "src/cli.js",
    "gate",
    "examples/safe-skill",
    "--json"
  ], { cwd: process.cwd() });
  const gate = JSON.parse(result.stdout);

  assert.equal(gate.decision, "allow");
  assert.equal(gate.exitCode, 0);
  assert.equal(gate.risk.level, "info");
  assert.equal(gate.policy.preset, "personal");
  assert.deepEqual(gate.policy.requiredActions, []);
});
