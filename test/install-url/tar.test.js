import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractTarGz } from "../../src/install-url/tar.js";
import {
  buildGzipTarball,
  riskySkillEntries,
  safeSkillEntries,
  tarballWithSymlink,
  tarballWithTraversal
} from "./tar-fixture.js";

async function withTmpDir(callback) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-tar-"));

  try {
    return await callback(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeTarball(dir, bytes) {
  const tarPath = path.join(dir, "input.tar.gz");
  await fs.writeFile(tarPath, bytes);
  return tarPath;
}

test("extractTarGz extracts a safe skill bundle", async () => {
  await withTmpDir(async (dir) => {
    const tarPath = await writeTarball(dir, buildGzipTarball(safeSkillEntries({ rootName: "skill" })));
    const extractRoot = path.join(dir, "extracted");
    const result = await extractTarGz(tarPath, extractRoot);

    assert.equal(result.files, 1);
    assert.equal(result.symlinksSkipped, 0);

    const contents = await fs.readFile(path.join(extractRoot, "skill", "SKILL.md"), "utf8");
    assert.match(contents, /Safe Test Skill/);
  });
});

test("extractTarGz blocks path-traversal entries", async () => {
  await withTmpDir(async (dir) => {
    const tarPath = await writeTarball(dir, tarballWithTraversal());
    const extractRoot = path.join(dir, "extracted");
    await assert.rejects(extractTarGz(tarPath, extractRoot), (error) => error.code === "path_traversal");
  });
});

test("extractTarGz drops symlinks rather than following them", async () => {
  await withTmpDir(async (dir) => {
    const tarPath = await writeTarball(dir, tarballWithSymlink());
    const extractRoot = path.join(dir, "extracted");
    const result = await extractTarGz(tarPath, extractRoot);

    assert.equal(result.symlinksSkipped, 1);
    assert.equal(result.skipped[0].reason, "symlink");
    const linkPath = path.join(extractRoot, "skill", "link");
    await assert.rejects(fs.lstat(linkPath));
  });
});

test("extractTarGz normalizes file modes to 0644", async () => {
  if (process.platform === "win32") {
    return;
  }

  await withTmpDir(async (dir) => {
    const tarPath = await writeTarball(dir, buildGzipTarball([
      { name: "skill/", type: "5" },
      { name: "skill/exec.sh", data: "#!/bin/sh\necho hi\n", mode: 0o755, type: "0" }
    ]));
    const extractRoot = path.join(dir, "extracted");
    await extractTarGz(tarPath, extractRoot);
    const stat = await fs.stat(path.join(extractRoot, "skill", "exec.sh"));
    assert.equal(stat.mode & 0o777, 0o644);
  });
});

test("extractTarGz rejects a decompression bomb over the size cap", async () => {
  await withTmpDir(async (dir) => {
    const tarPath = await writeTarball(
      dir,
      buildGzipTarball([{ name: "big.bin", data: Buffer.alloc(300_000, 0x41), type: "0" }])
    );
    await assert.rejects(
      () => extractTarGz(tarPath, path.join(dir, "extracted"), { maxTotalBytes: 1024 }),
      (error) => error.code === "archive_too_large"
    );
  });
});

test("extractTarGz scans cleanly produce a risky-skill bundle for downstream tests", async () => {
  await withTmpDir(async (dir) => {
    const tarPath = await writeTarball(dir, buildGzipTarball(riskySkillEntries()));
    const extractRoot = path.join(dir, "extracted");
    const result = await extractTarGz(tarPath, extractRoot);
    assert.ok(result.files >= 1);
    const skill = await fs.readFile(path.join(extractRoot, "risky-skill", "SKILL.md"), "utf8");
    assert.match(skill, /curl /);
  });
});
