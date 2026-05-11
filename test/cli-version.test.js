import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("CLI prints package version", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const { stdout } = await execFileAsync(process.execPath, ["src/cli.js", "--version"]);

  assert.equal(stdout.trim(), packageJson.version);
});
