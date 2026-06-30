import assert from "node:assert/strict";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import test from "node:test";
import { fetchToFile, isBlockedFetchHost } from "../../src/install-url/fetch.js";
import { buildGzipTarball, safeSkillEntries } from "./tar-fixture.js";

function startServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function tmpFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-fetch-"));
  return { dir, file: path.join(dir, "out.tar.gz") };
}

test("isBlockedFetchHost rejects loopback, private, and link-local addresses", () => {
  assert.equal(isBlockedFetchHost("localhost"), true);
  assert.equal(isBlockedFetchHost("127.0.0.1"), true);
  assert.equal(isBlockedFetchHost("10.0.0.5"), true);
  assert.equal(isBlockedFetchHost("192.168.1.1"), true);
  assert.equal(isBlockedFetchHost("169.254.1.1"), true);
  assert.equal(isBlockedFetchHost("::1"), true);
  assert.equal(isBlockedFetchHost("fc00::1"), true);
  assert.equal(isBlockedFetchHost("example.com"), false);
});

test("fetchToFile blocks private hosts unless allowLoopback is set", async () => {
  const { dir, file } = await tmpFile();

  try {
    await assert.rejects(
      fetchToFile("https://127.0.0.1/skill.tar.gz", file, { timeoutMs: 1000 }),
      (error) => error.code === "blocked_host"
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("fetchToFile streams a tarball, hashes it, and records redirect count", async () => {
  const tarball = buildGzipTarball(safeSkillEntries());
  const { server, port } = await startServer((req, res) => {
    res.writeHead(200, { "content-type": "application/gzip" });
    res.end(tarball);
  });

  const { dir, file } = await tmpFile();

  try {
    const result = await fetchToFile(`http://127.0.0.1:${port}/skill.tar.gz`.replace("http://", "https://"), file, {
      timeoutMs: 2000,
      allowLoopback: true,
      fetchImpl: async () => new Response(tarball, { headers: { "content-type": "application/gzip" } })
    });

    assert.equal(result.sizeBytes, tarball.length);
    assert.equal(result.redirectCount, 0);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
  } finally {
    await closeServer(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("fetchToFile follows safe redirects but rejects redirects to private hosts", async () => {
  let hop = 0;
  const tarball = buildGzipTarball(safeSkillEntries());

  const fetchImpl = async (_url) => {
    hop += 1;

    if (hop === 1) {
      return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/evil.tar.gz" } });
    }

    return new Response(tarball, { headers: { "content-type": "application/gzip" } });
  };

  const { dir, file } = await tmpFile();

  try {
    await assert.rejects(
      fetchToFile("https://example.com/skill.tar.gz", file, { fetchImpl, timeoutMs: 1000 }),
      (error) => error.code === "blocked_host"
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("fetchToFile downloads over the real node:http transport (no mock)", async () => {
  const tarball = buildGzipTarball(safeSkillEntries());
  const { server, port } = await startServer((req, res) => {
    res.writeHead(200, { "content-type": "application/gzip" });
    res.end(tarball);
  });
  const { dir, file } = await tmpFile();

  try {
    const result = await fetchToFile(`http://127.0.0.1:${port}/skill.tar.gz`, file, {
      timeoutMs: 3000,
      allowLoopback: true,
      allowInsecureLoopback: true
    });

    assert.equal(result.sizeBytes, tarball.length);
    assert.equal(result.redirectCount, 0);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
    const written = await fs.readFile(file);
    assert.equal(written.length, tarball.length);
  } finally {
    await closeServer(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("fetchToFile follows a redirect over the real transport", async () => {
  const tarball = buildGzipTarball(safeSkillEntries());
  const { server, port } = await startServer((req, res) => {
    if (req.url === "/start.tar.gz") {
      res.writeHead(302, { location: `http://127.0.0.1:${port}/final.tar.gz` });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/gzip" });
    res.end(tarball);
  });
  const { dir, file } = await tmpFile();

  try {
    const result = await fetchToFile(`http://127.0.0.1:${port}/start.tar.gz`, file, {
      timeoutMs: 3000,
      allowLoopback: true,
      allowInsecureLoopback: true
    });

    assert.equal(result.redirectCount, 1);
    assert.equal(result.sizeBytes, tarball.length);
  } finally {
    await closeServer(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("fetchToFile enforces max-bytes over the real transport", async () => {
  const big = Buffer.alloc(4096, 0x41);
  const { server, port } = await startServer((req, res) => {
    res.writeHead(200);
    res.end(big);
  });
  const { dir, file } = await tmpFile();

  try {
    await assert.rejects(
      fetchToFile(`http://127.0.0.1:${port}/big.tar.gz`, file, {
        maxBytes: 512,
        timeoutMs: 2000,
        allowLoopback: true,
        allowInsecureLoopback: true
      }),
      (error) => error.code === "max_bytes_exceeded"
    );
  } finally {
    await closeServer(server);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("fetchToFile blocks at connect time when DNS resolves to a private address", async () => {
  const { dir, file } = await tmpFile();

  try {
    await assert.rejects(
      fetchToFile("https://rebind.evil.example/skill.tar.gz", file, {
        timeoutMs: 1000,
        lookupImpl: async () => [{ address: "169.254.169.254", family: 4 }]
      }),
      (error) => error.code === "blocked_host_resolved"
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("fetchToFile rejects a host that resolves to a private address", async () => {
  const { dir, file } = await tmpFile();

  try {
    await assert.rejects(
      fetchToFile("https://metadata.evil.example/skill.tar.gz", file, {
        timeoutMs: 1000,
        resolveDns: true,
        lookupImpl: async () => [{ address: "169.254.169.254", family: 4 }],
        fetchImpl: async () => new Response(Buffer.alloc(8))
      }),
      (error) => error.code === "blocked_host_resolved"
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("fetchToFile enforces max-bytes during streaming", async () => {
  const big = Buffer.alloc(2048, 0x41);
  const { dir, file } = await tmpFile();

  try {
    await assert.rejects(
      fetchToFile("https://example.com/big.tar.gz", file, {
        maxBytes: 512,
        timeoutMs: 1000,
        fetchImpl: async () => new Response(big)
      }),
      (error) => error.code === "max_bytes_exceeded"
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("fetchToFile verifies sha256 integrity and surfaces mismatches", async () => {
  const tarball = buildGzipTarball(safeSkillEntries());
  const wrongHashHex = "00".repeat(32);
  const { dir, file } = await tmpFile();

  try {
    await assert.rejects(
      fetchToFile("https://example.com/skill.tar.gz", file, {
        timeoutMs: 1000,
        integrity: `sha256:${wrongHashHex}`,
        fetchImpl: async () => new Response(tarball)
      }),
      (error) => error.code === "integrity_mismatch"
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
