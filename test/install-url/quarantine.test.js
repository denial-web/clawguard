import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createQuarantineRun,
  findRunByApprovalId,
  generateRunId,
  readQuarantineJson,
  removeDownloadDir,
  removeQuarantineRun,
  writeQuarantineJson
} from "../../src/install-url/quarantine.js";

async function withQuarantineRoot(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-q-"));

  try {
    return await callback(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("generateRunId emits 26-char Crockford base32 ids", () => {
  const id = generateRunId();
  assert.equal(id.length, 26);
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.notEqual(id, generateRunId(), "successive ids should differ");
});

test("createQuarantineRun lays out the documented directory structure", async () => {
  await withQuarantineRoot(async (root) => {
    const run = await createQuarantineRun({ root });
    assert.equal(run.root, path.resolve(root));
    assert.ok(run.runId.length === 26);

    const downloadStat = await fs.stat(run.downloadDir);
    const extractedStat = await fs.stat(run.extractedDir);
    assert.ok(downloadStat.isDirectory());
    assert.ok(extractedStat.isDirectory());

    if (process.platform !== "win32") {
      const stat = await fs.stat(run.path);
      assert.equal(stat.mode & 0o777, 0o700, `unexpected mode ${(stat.mode & 0o777).toString(8)}`);
    }
  });
});

test("writeQuarantineJson + readQuarantineJson roundtrip", async () => {
  await withQuarantineRoot(async (root) => {
    const run = await createQuarantineRun({ root });
    await writeQuarantineJson(run.sourcePath, { url: "https://example.com", n: 1 });
    const round = await readQuarantineJson(run.sourcePath);
    assert.deepEqual(round, { url: "https://example.com", n: 1 });
  });
});

test("removeQuarantineRun deletes the entire run tree", async () => {
  await withQuarantineRoot(async (root) => {
    const run = await createQuarantineRun({ root });
    await removeQuarantineRun(run.path);
    await assert.rejects(fs.stat(run.path));
  });
});

test("removeDownloadDir leaves the rest of the run intact", async () => {
  await withQuarantineRoot(async (root) => {
    const run = await createQuarantineRun({ root });
    await removeDownloadDir(run.downloadDir);
    await assert.rejects(fs.stat(run.downloadDir));
    const stillThere = await fs.stat(run.extractedDir);
    assert.ok(stillThere.isDirectory());
  });
});

test("findRunByApprovalId locates a run from its approval.json", async () => {
  await withQuarantineRoot(async (root) => {
    const run = await createQuarantineRun({ root });
    await writeQuarantineJson(run.approvalPath, { approvalId: "appr_xyz" });

    const found = await findRunByApprovalId(root, "appr_xyz");
    assert.ok(found);
    assert.equal(found.runId, run.runId);

    const missing = await findRunByApprovalId(root, "appr_does_not_exist");
    assert.equal(missing, null);
  });
});
