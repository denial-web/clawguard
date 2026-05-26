import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractZip } from "../../src/install-url/zip.js";
import { buildZip, safeSkillZipEntries } from "./zip-fixture.js";

async function withTmpDir(callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-zip-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("extractZip extracts a stored zip skill bundle", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "skill.zip");
    await fs.writeFile(zipPath, buildZip(safeSkillZipEntries({ rootName: "skill" })));
    const extractRoot = path.join(dir, "extracted");
    const result = await extractZip(zipPath, extractRoot);

    assert.equal(result.files, 1);
    const contents = await fs.readFile(path.join(extractRoot, "skill", "SKILL.md"), "utf8");
    assert.match(contents, /Safe Test Skill/);
  });
});
