import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadClawHubLock, parseClawHubReference, resolveClawHubReference } from "../../src/install-url/clawhub.js";

test("parseClawHubReference extracts slug and version", () => {
  const ref = parseClawHubReference("clawhub:weather-helper@1.0.0");
  assert.equal(ref.slug, "weather-helper");
  assert.equal(ref.name, "weather-helper");
  assert.equal(ref.version, "1.0.0");
});

test("parseClawHubReference supports org/skill slugs", () => {
  const ref = parseClawHubReference("clawhub:org/skill@1.0.0");
  assert.equal(ref.slug, "org/skill");
  assert.equal(ref.name, "skill");
  assert.equal(ref.version, "1.0.0");
});

test("resolveClawHubReference reads lock entries and resolves github tree sources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-clawhub-"));
  const lockPath = path.join(root, ".clawhub", "lock.json");

  try {
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      JSON.stringify({
        skills: [
          {
            name: "weather-helper",
            version: "1.0.0",
            source: "https://github.com/openclaw/skills/tree/main/skills/weather-helper",
            path: "skills/weather-helper"
          }
        ]
      }),
      "utf8"
    );

    const resolved = await resolveClawHubReference("clawhub:weather-helper@1.0.0", { lockPath });
    assert.equal(resolved.fetchUrl, "https://codeload.github.com/openclaw/skills/tar.gz/refs/heads/main");
    assert.equal(resolved.stripPrefix, "skills-main/skills/weather-helper/");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("loadClawHubLock throws when lockfile is missing", async () => {
  await assert.rejects(loadClawHubLock("/tmp/does-not-exist-lock.json"), (error) => {
    return error.code === "clawhub_lock_missing";
  });
});
