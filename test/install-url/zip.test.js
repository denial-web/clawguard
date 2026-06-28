import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { extractZip } from "../../src/install-url/zip.js";
import { InstallUrlError } from "../../src/install-url/url.js";
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

test("extractZip rejects path traversal entry", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "evil.zip");
    await fs.writeFile(
      zipPath,
      buildZip([{ name: "../../etc/passwd", content: "pwned" }])
    );
    await assert.rejects(
      () => extractZip(zipPath, path.join(dir, "out")),
      (error) => error instanceof InstallUrlError && error.code === "path_traversal"
    );
  });
});

test("extractZip skips null-byte filenames", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "null.zip");
    await fs.writeFile(
      zipPath,
      buildZip([
        { name: "safe/ok.txt", content: "ok" },
        { name: "safe/bad\u0000name.txt", content: "skip" }
      ])
    );
    const extractRoot = path.join(dir, "out");
    const result = await extractZip(zipPath, extractRoot);
    assert.equal(result.files, 1);
    assert.ok(await fs.stat(path.join(extractRoot, "safe", "ok.txt")));
  });
});

test("extractZip normalizes backslash paths", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "win.zip");
    await fs.writeFile(
      zipPath,
      buildZip([{ name: "skill\\SKILL.md", content: "# Win path" }])
    );
    const extractRoot = path.join(dir, "out");
    await extractZip(zipPath, extractRoot);
    const text = await fs.readFile(path.join(extractRoot, "skill", "SKILL.md"), "utf8");
    assert.match(text, /Win path/);
  });
});

test("extractZip rejects zip_too_many_entries", async () => {
  await withTmpDir(async (dir) => {
    const entries = Array.from({ length: 6 }, (_, i) => ({
      name: `f${i}.txt`,
      content: String(i)
    }));
    const zipPath = path.join(dir, "many.zip");
    await fs.writeFile(zipPath, buildZip(entries));
    await assert.rejects(
      () => extractZip(zipPath, path.join(dir, "out"), { maxEntries: 5 }),
      (error) => error instanceof InstallUrlError && error.code === "zip_too_many_entries"
    );
  });
});

test("extractZip extracts deflated entry", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "deflated.zip");
    await fs.writeFile(
      zipPath,
      buildZip([{ name: "skill/SKILL.md", content: "# Deflated", compressionMethod: 8 }])
    );
    const extractRoot = path.join(dir, "out");
    await extractZip(zipPath, extractRoot);
    const text = await fs.readFile(path.join(extractRoot, "skill", "SKILL.md"), "utf8");
    assert.match(text, /Deflated/);
  });
});

test("extractZip rejects unsupported_zip_compression", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "bz2.zip");
    await fs.writeFile(
      zipPath,
      buildZip([{ name: "a.txt", content: "x", compressionMethod: 12 }])
    );
    await assert.rejects(
      () => extractZip(zipPath, path.join(dir, "out")),
      (error) =>
        error instanceof InstallUrlError && error.code === "unsupported_zip_compression"
    );
  });
});

test("extractZip last duplicate entry wins", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "dup.zip");
    await fs.writeFile(
      zipPath,
      buildZip([
        { name: "skill/SKILL.md", content: "first" },
        { name: "skill/SKILL.md", content: "second" }
      ])
    );
    const extractRoot = path.join(dir, "out");
    await extractZip(zipPath, extractRoot);
    const text = await fs.readFile(path.join(extractRoot, "skill", "SKILL.md"), "utf8");
    assert.equal(text, "second");
  });
});

test("extractZip rejects an honest decompression bomb over the size cap", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "bomb.zip");
    await fs.writeFile(
      zipPath,
      buildZip([{ name: "big.txt", content: "A".repeat(200_000), compressionMethod: 8 }])
    );
    await assert.rejects(
      () => extractZip(zipPath, path.join(dir, "out"), { maxTotalBytes: 1024 }),
      (error) => error instanceof InstallUrlError && error.code === "archive_too_large"
    );
  });
});

test("extractZip bounds allocation when the header lies about uncompressed size", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "lying-bomb.zip");
    await fs.writeFile(
      zipPath,
      buildZip([
        {
          name: "big.txt",
          content: "A".repeat(200_000),
          compressionMethod: 8,
          uncompressedSizeOverride: 1
        }
      ])
    );
    await assert.rejects(
      () => extractZip(zipPath, path.join(dir, "out"), { maxTotalBytes: 1024 }),
      (error) => error instanceof InstallUrlError && error.code === "archive_too_large"
    );
  });
});

test("extractZip rejects invalid_archive without EOCD", async () => {
  await withTmpDir(async (dir) => {
    const zipPath = path.join(dir, "bad.zip");
    await fs.writeFile(zipPath, Buffer.from("not-a-zip"));
    await assert.rejects(
      () => extractZip(zipPath, path.join(dir, "out")),
      (error) => error instanceof InstallUrlError && error.code === "invalid_archive"
    );
  });
});
