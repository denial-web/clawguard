import assert from "node:assert/strict";
import test from "node:test";
import { basenameFromUrl, detectSourceKind, InstallUrlError, isLikelyTarball, isLikelyZip } from "../../src/install-url/url.js";

test("detectSourceKind classifies local paths", () => {
  const result = detectSourceKind("./examples/safe-skill");
  assert.equal(result.kind, "path");
  assert.equal(result.url, null);
  assert.ok(result.path.endsWith("examples/safe-skill"));
});

test("detectSourceKind classifies https URLs", () => {
  const result = detectSourceKind("https://example.com/skill.tar.gz");
  assert.equal(result.kind, "url");
  assert.equal(result.scheme, "https:");
  assert.equal(result.url.hostname, "example.com");
});

function captureThrow(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new Error("expected function to throw");
}

test("detectSourceKind rejects http with exit code 3", () => {
  const error = captureThrow(() => detectSourceKind("http://example.com/skill.tar.gz"));
  assert.ok(error instanceof InstallUrlError);
  assert.equal(error.exitCode, 3);
  assert.equal(error.code, "unsupported_scheme");
});

test("detectSourceKind defers clawhub: and zip schemes", () => {
  const clawhub = captureThrow(() => detectSourceKind("clawhub:org/skill@1"));
  assert.equal(clawhub.code, "unsupported_scheme");

  const fileUrl = captureThrow(() => detectSourceKind("file:///tmp/x.tar.gz"));
  assert.equal(fileUrl.code, "unsupported_scheme");
});

test("detectSourceKind rejects URLs with credentials", () => {
  const error = captureThrow(() => detectSourceKind("https://user:pass@example.com/skill.tar.gz"));
  assert.equal(error.code, "credentials_in_url");
});

test("isLikelyTarball recognises common tarball patterns", () => {
  assert.equal(isLikelyTarball(new URL("https://example.com/skill.tar.gz")), true);
  assert.equal(isLikelyTarball(new URL("https://example.com/skill.tgz")), true);
  assert.equal(
    isLikelyTarball(new URL("https://github.com/owner/repo/archive/refs/tags/v1.0.0.tar.gz")),
    true
  );
  assert.equal(isLikelyTarball(new URL("https://example.com/skill.zip")), false);
});

test("isLikelyZip flags zip archives so the orchestrator can reject them", () => {
  assert.equal(isLikelyZip(new URL("https://example.com/skill.zip")), true);
  assert.equal(isLikelyZip(new URL("https://example.com/skill.tar.gz")), false);
});

test("basenameFromUrl extracts a usable file name", () => {
  assert.equal(basenameFromUrl(new URL("https://example.com/path/skill.tar.gz")), "skill.tar.gz");
  assert.equal(basenameFromUrl(new URL("https://example.com/")), "bundle.tar.gz");
});
