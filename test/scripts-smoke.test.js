import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(repoRoot, "test", "fixtures", "bench");
const benchDir = path.join(repoRoot, "bench-results");

function runNode(script, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c;
    });
    child.stderr.on("data", (c) => {
      stderr += c;
    });
    child.on("exit", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.on("error", reject);
  });
}

test("aggregate-doctrine-reports merges suites and computes aggregate p-value", async () => {
  const out = path.join(os.tmpdir(), `clawguard-agg-${Date.now()}.json`);
  const result = await runNode(path.join(repoRoot, "scripts", "aggregate-doctrine-reports.mjs"), [
    "--out",
    out,
    "--task-set",
    "in_distribution",
    "--input",
    `agent_safety=${path.join(fixtures, "cat-a.json")}`,
    "--input",
    `agent_governance=${path.join(fixtures, "cat-b.json")}`
  ]);
  assert.equal(result.code, 0);
  const json = JSON.parse(await readFile(out, "utf8"));
  assert.ok(json.in_distribution?.aggregate);
  assert.equal(json.in_distribution.aggregate.total_comparisons, 2);
  assert.ok(Number.isFinite(json.in_distribution.aggregate.p_value));
  await rm(out, { force: true });
});

test("render-agent-benchmark writes markdown with new title", async () => {
  await mkdir(benchDir, { recursive: true });
  const localPath = path.join(benchDir, "agent-local.json");
  const doctrinePath = path.join(benchDir, "agent-doctrine.json");
  const localBackup = await readFile(localPath, "utf8").catch(() => null);
  const doctrineBackup = await readFile(doctrinePath, "utf8").catch(() => null);

  try {
    await copyFile(path.join(fixtures, "agent-local-min.json"), localPath);
    await writeFile(
      doctrinePath,
      JSON.stringify(
        {
          in_distribution: JSON.parse(
            await readFile(path.join(fixtures, "agent-doctrine-suite.json"), "utf8")
          ),
          heldout: null
        },
        null,
        2
      ) + "\n"
    );

    const result = await runNode(path.join(repoRoot, "scripts", "render-agent-benchmark.js"), []);
    assert.equal(result.code, 0);
    const md = await readFile(
      path.join(repoRoot, "docs", "AGENT_BENCHMARK_v1.0.0-beta.9.md"),
      "utf8"
    );
    assert.match(md, /governance-schema compliance benchmark/);
    assert.match(md, /Held-out paraphrases/);
    assert.match(md, /eval shim/);
  } finally {
    if (localBackup) {
      await writeFile(localPath, localBackup);
    } else {
      await rm(localPath, { force: true });
    }
    if (doctrineBackup) {
      await writeFile(doctrinePath, doctrineBackup);
    } else {
      await rm(doctrinePath, { force: true });
    }
  }
});
