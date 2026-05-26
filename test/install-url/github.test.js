import assert from "node:assert/strict";
import test from "node:test";
import { githubTreeToCodeloadTarball } from "../../src/install-url/github.js";

test("githubTreeToCodeloadTarball converts tree URLs to codeload tarballs", () => {
  const result = githubTreeToCodeloadTarball(
    "https://github.com/openclaw/skills/tree/main/skills/weather-helper"
  );

  assert.equal(result.tarballUrl, "https://codeload.github.com/openclaw/skills/tar.gz/refs/heads/main");
  assert.equal(result.stripPrefix, "skills-main/skills/weather-helper/");
});

test("githubTreeToCodeloadTarball returns null for non-tree URLs", () => {
  assert.equal(githubTreeToCodeloadTarball("https://github.com/openclaw/skills"), null);
  assert.equal(
    githubTreeToCodeloadTarball("https://github.com/openclaw/skills/archive/refs/tags/v1.0.0.tar.gz"),
    null
  );
});
