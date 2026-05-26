import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { buildGzipTarball, mediumSkillEntries, riskySkillEntries, safeSkillEntries } from "./install-url/tar-fixture.js";
import { buildZip, safeSkillZipEntries } from "./install-url/zip-fixture.js";

const execFileAsync = promisify(execFile);

function startTarballServer(bytes, options = {}) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (options.delayMs) {
        setTimeout(() => sendBody(), options.delayMs);
      } else {
        sendBody();
      }

      function sendBody() {
        res.writeHead(200, { "content-type": "application/gzip", "content-length": String(bytes.length) });
        res.end(bytes);
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function withDirs(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-install-cli-"));
  const trustedDir = path.join(root, "trusted", "skill");
  const quarantineDir = path.join(root, "quarantine");
  const approvalOut = path.join(root, "approvals.jsonl");

  try {
    return await callback({ root, trustedDir, quarantineDir, approvalOut });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function runInstall(args, { expectFail = false } = {}) {
  const fullArgs = ["src/cli.js", "install", ...args];
  const env = { ...process.env, CLAWGUARD_INSTALL_INSECURE_LOOPBACK: "1" };

  try {
    const result = await execFileAsync(process.execPath, fullArgs, { cwd: process.cwd(), env });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (!expectFail) {
      throw error;
    }

    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("install <https-url> installs a safe tarball with exit code 0", async () => {
  const tarball = buildGzipTarball(safeSkillEntries({ rootName: "safe-skill" }));
  const { server, port } = await startTarballServer(tarball);

  try {
    await withDirs(async ({ trustedDir, quarantineDir, approvalOut }) => {
      const result = await runInstall([
        `http://127.0.0.1:${port}/safe-skill.tar.gz`,
        "--to", trustedDir,
        "--policy", "personal",
        "--quarantine", quarantineDir,
        "--approval-out", approvalOut,
        "--allow-loopback-fetch",
        "--json",
        "--timeout", "5000"
      ]);

      const payload = JSON.parse(result.stdout);
      assert.equal(payload.schemaVersion, "clawguard.install.v1");
      assert.equal(payload.check.decision, "allow");
      assert.equal(payload.installation.performed, true);
      assert.equal(payload.installation.destination, trustedDir);

      const stat = await fs.stat(path.join(trustedDir, "safe-skill", "SKILL.md"));
      assert.ok(stat.isFile());
    });
  } finally {
    await closeServer(server);
  }
});

test("install <https-url> blocks a risky tarball with exit code 2", async () => {
  const tarball = buildGzipTarball(riskySkillEntries());
  const { server, port } = await startTarballServer(tarball);

  try {
    await withDirs(async ({ trustedDir, quarantineDir, approvalOut }) => {
      const result = await runInstall([
        `http://127.0.0.1:${port}/risky.tar.gz`,
        "--to", trustedDir,
        "--policy", "personal",
        "--quarantine", quarantineDir,
        "--approval-out", approvalOut,
        "--allow-loopback-fetch",
        "--json",
        "--timeout", "5000"
      ], { expectFail: true });

      assert.equal(result.code, 2);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.check.decision, "block");
      assert.equal(payload.installation.performed, false);
      await assert.rejects(fs.stat(trustedDir));
    });
  } finally {
    await closeServer(server);
  }
});

test("install rejects unsupported URL schemes with exit code 3", async () => {
  await withDirs(async ({ trustedDir }) => {
    const result = await runInstall([
      "npm:@scope/pkg@1.0.0",
      "--to", trustedDir,
      "--policy", "personal",
      "--json"
    ], { expectFail: true });

    assert.equal(result.code, 3);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.error.code, "unsupported_scheme");
  });
});

test("install clawhub: reference resolves lock and installs tarball", async () => {
  const tarball = buildGzipTarball(safeSkillEntries({ rootName: "safe-skill" }));
  const { server, port } = await startTarballServer(tarball);

  try {
    await withDirs(async ({ root, trustedDir, quarantineDir, approvalOut }) => {
      const lockPath = path.join(root, ".clawhub", "lock.json");
      await fs.mkdir(path.dirname(lockPath), { recursive: true });
      await fs.writeFile(
        lockPath,
        JSON.stringify({
          skills: [
            {
              name: "safe-skill",
              version: "1.0.0",
              source: `http://127.0.0.1:${port}/safe-skill.tar.gz`,
              path: "skills/safe-skill"
            }
          ]
        }),
        "utf8"
      );

      const result = await runInstall([
        "clawhub:safe-skill@1.0.0",
        "--to", trustedDir,
        "--policy", "personal",
        "--quarantine", quarantineDir,
        "--approval-out", approvalOut,
        "--allow-loopback-fetch",
        "--clawhub-lock", lockPath,
        "--json"
      ]);

      assert.equal(result.code, 0);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.source.kind, "clawhub");
      assert.equal(payload.source.scheme, "clawhub");
      assert.equal(payload.installation.performed, true);
      await fs.access(path.join(trustedDir, "safe-skill", "SKILL.md"));
    });
  } finally {
    await closeServer(server);
  }
});

test("install https zip archives", async () => {
  const zipBytes = buildZip(safeSkillZipEntries({ rootName: "safe-skill" }));
  const { server, port } = await startTarballServer(zipBytes);

  try {
    await withDirs(async ({ trustedDir, quarantineDir }) => {
      const result = await runInstall([
        `http://127.0.0.1:${port}/skill.zip`,
        "--to", trustedDir,
        "--policy", "personal",
        "--quarantine", quarantineDir,
        "--allow-loopback-fetch",
        "--json"
      ]);

      assert.equal(result.code, 0);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.installation.performed, true);
      await fs.access(path.join(trustedDir, "safe-skill", "SKILL.md"));
    });
  } finally {
    await closeServer(server);
  }
});

test("install detects integrity mismatch and exits 3", async () => {
  const tarball = buildGzipTarball(safeSkillEntries());
  const { server, port } = await startTarballServer(tarball);

  try {
    await withDirs(async ({ trustedDir, quarantineDir }) => {
      const result = await runInstall([
        `http://127.0.0.1:${port}/skill.tar.gz`,
        "--to", trustedDir,
        "--policy", "personal",
        "--quarantine", quarantineDir,
        "--allow-loopback-fetch",
        "--integrity", `sha256:${"00".repeat(32)}`,
        "--json"
      ], { expectFail: true });

      assert.equal(result.code, 3);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.error.code, "integrity_mismatch");
    });
  } finally {
    await closeServer(server);
  }
});

test("install rejects a non-tarball response with exit code 3", async () => {
  const { server, port } = await startTarballServer(Buffer.from("<html>not a tarball</html>"));

  try {
    await withDirs(async ({ trustedDir, quarantineDir }) => {
      const result = await runInstall([
        `http://127.0.0.1:${port}/decoy.tar.gz`,
        "--to", trustedDir,
        "--policy", "personal",
        "--quarantine", quarantineDir,
        "--allow-loopback-fetch",
        "--json",
        "--timeout", "5000"
      ], { expectFail: true });

      assert.equal(result.code, 3);
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.error.code, "invalid_archive");
    });
  } finally {
    await closeServer(server);
  }
});

test("install --resume completes a manual_review approval", async () => {
  const tarball = buildGzipTarball(mediumSkillEntries({ rootName: "review-skill" }));
  const { server, port } = await startTarballServer(tarball);

  try {
    await withDirs(async ({ trustedDir, quarantineDir, approvalOut }) => {
      const first = await runInstall([
        `http://127.0.0.1:${port}/skill.tar.gz`,
        "--to", trustedDir,
        "--policy", "governed",
        "--quarantine", quarantineDir,
        "--approval-out", approvalOut,
        "--allow-loopback-fetch",
        "--json"
      ], { expectFail: true });

      assert.equal(first.code, 1);
      const firstPayload = JSON.parse(first.stdout);
      assert.equal(firstPayload.check.decision, "manual_review");
      const approvalId = firstPayload.approval.approvalId;
      assert.ok(approvalId);

      const second = await runInstall([
        "--resume", approvalId,
        "--to", trustedDir,
        "--approval-out", approvalOut,
        "--quarantine", quarantineDir,
        "--decision", "approve",
        "--json"
      ]);

      const secondPayload = JSON.parse(second.stdout);
      assert.equal(secondPayload.command, "install-resume");
      assert.equal(secondPayload.action, "approved");
      assert.equal(secondPayload.installation.performed, true);

      const stat = await fs.stat(path.join(trustedDir, "review-skill", "SKILL.md"));
      assert.ok(stat.isFile());
    });
  } finally {
    await closeServer(server);
  }
});
