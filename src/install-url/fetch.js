import { createHash } from "node:crypto";
import dnsPromises from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";

import { isBlockedHost, resolveHostBlocked } from "./host.js";
import { InstallUrlError } from "./url.js";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "clawguard-install/1.0";

export const FETCH_DEFAULTS = Object.freeze({
  maxBytes: DEFAULT_MAX_BYTES,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxRedirects: MAX_REDIRECTS
});

export { isBlockedHost as isBlockedFetchHost };

export async function fetchToFile(url, destinationPath, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const allowLoopback = Boolean(options.allowLoopback);
  const allowInsecureLoopback = Boolean(options.allowInsecureLoopback);
  const integrity = parseIntegrity(options.integrity ?? null);
  const lookupImpl = options.lookupImpl;

  let current;
  try {
    current = new URL(url);
  } catch {
    throw new InstallUrlError(`Could not parse URL: ${url}`, { code: "invalid_url" });
  }

  const shared = {
    maxBytes,
    timeoutMs,
    maxRedirects,
    allowLoopback,
    allowInsecureLoopback,
    integrity,
    lookupImpl
  };

  // A mocked transport (tests) controls where bytes come from, so use the
  // fetch-based path with resolve-time DNS validation. Real downloads use the
  // node:https path, which pins the validated IP at connect time and so closes
  // the DNS-rebinding window between validation and connection.
  if (options.fetchImpl) {
    return fetchToFileViaFetch(current, destinationPath, {
      ...shared,
      fetchImpl: options.fetchImpl,
      resolveDns: options.resolveDns ?? true
    });
  }

  return fetchToFileViaHttps(current, destinationPath, shared);
}

function parseIntegrity(integrity) {
  if (!integrity) {
    return null;
  }

  const subresource = integrity.match(/^sha256-([A-Za-z0-9+/=]+)$/);

  if (subresource) {
    const buffer = Buffer.from(subresource[1], "base64");

    if (buffer.length !== 32) {
      throw new InstallUrlError("invalid sha256 integrity value (base64 length must be 32 bytes)", {
        code: "invalid_integrity"
      });
    }

    return { algorithm: "sha256", expectedHex: buffer.toString("hex"), format: "sri" };
  }

  const colon = integrity.match(/^sha256:([0-9a-fA-F]{64})$/);

  if (colon) {
    return { algorithm: "sha256", expectedHex: colon[1].toLowerCase(), format: "hex" };
  }

  throw new InstallUrlError(
    "integrity must look like 'sha256-<base64>' or 'sha256:<hex>'.",
    { code: "invalid_integrity_format" }
  );
}

function assertUrlPolicy(url, { allowLoopback, allowInsecureLoopback }) {
  const protocolOk = url.protocol === "https:"
    || (allowInsecureLoopback && url.protocol === "http:" && allowLoopback && isBlockedHost(url.hostname));

  if (!protocolOk) {
    throw new InstallUrlError(`refusing non-https redirect to ${url.href}`, { code: "redirect_non_https" });
  }

  if (url.username || url.password) {
    throw new InstallUrlError("refusing URL containing credentials", { code: "credentials_in_url" });
  }

  if (!allowLoopback && isBlockedHost(url.hostname)) {
    throw new InstallUrlError(`refusing fetch to private or loopback host: ${url.hostname}`, {
      code: "blocked_host"
    });
  }
}

function finalizeResult({ current, redirectCount, contentType, sizeBytes, sha256, integrity }) {
  let integrityVerified = null;

  if (integrity) {
    integrityVerified = sha256 === integrity.expectedHex;

    if (!integrityVerified) {
      throw new InstallUrlError(
        `integrity mismatch: expected sha256 ${integrity.expectedHex}, got ${sha256}.`,
        { code: "integrity_mismatch" }
      );
    }
  }

  return {
    finalUrl: current.href,
    scheme: current.protocol,
    sizeBytes,
    redirectCount,
    contentType: contentType ?? null,
    sha256,
    integrityVerified,
    integrityProvided: Boolean(integrity)
  };
}

// --- node:https path (real downloads, connect-time IP pinning) ---------------

async function fetchToFileViaHttps(startUrl, destinationPath, options) {
  const { maxBytes, timeoutMs, maxRedirects, allowLoopback, allowInsecureLoopback, integrity, lookupImpl } = options;
  const lookup = makeGuardedLookup({ allowLoopback, lookup: lookupImpl });
  let current = startUrl;
  let redirectCount = 0;

  while (true) {
    assertUrlPolicy(current, { allowLoopback, allowInsecureLoopback });

    const mod = current.protocol === "https:" ? https : http;
    const agent = new mod.Agent({ lookup, keepAlive: false });
    let res;

    try {
      res = await requestOnce(mod, current, { agent, timeoutMs });
    } catch (error) {
      agent.destroy();
      throw error;
    }

    const status = res.statusCode ?? 0;

    if (status >= 300 && status < 400) {
      res.resume();
      const location = res.headers.location;

      if (!location) {
        agent.destroy();
        throw new InstallUrlError(`redirect response without Location header (status ${status}).`, {
          code: "redirect_missing_location"
        });
      }

      redirectCount += 1;

      if (redirectCount > maxRedirects) {
        agent.destroy();
        throw new InstallUrlError(`too many redirects (>${maxRedirects}).`, { code: "too_many_redirects" });
      }

      let next;
      try {
        next = new URL(location, current);
      } catch {
        agent.destroy();
        throw new InstallUrlError(`invalid redirect target: ${location}`, { code: "invalid_redirect" });
      }

      agent.destroy();
      current = next;
      continue;
    }

    if (status < 200 || status >= 300) {
      res.resume();
      agent.destroy();
      throw new InstallUrlError(`fetch failed with HTTP ${status}`, { code: "fetch_status" });
    }

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });

    try {
      const streamed = await streamResponseToFile(res, destinationPath, maxBytes);
      return finalizeResult({
        current,
        redirectCount,
        contentType: res.headers["content-type"] ?? null,
        sizeBytes: streamed.sizeBytes,
        sha256: streamed.sha256,
        integrity
      });
    } finally {
      agent.destroy();
    }
  }
}

function requestOnce(mod, url, { agent, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const req = mod.request(
      url,
      { method: "GET", agent, headers: { "User-Agent": USER_AGENT, Accept: "*/*" } },
      (res) => {
        if (settled) {
          res.resume();
          return;
        }
        settled = true;
        resolve(res);
      }
    );

    req.on("error", (error) => {
      if (error instanceof InstallUrlError) {
        return fail(error);
      }
      if (error?.code === "CLAWGUARD_BLOCKED_HOST") {
        return fail(new InstallUrlError(
          "refusing fetch to host that resolves to a private or loopback address.",
          { code: "blocked_host_resolved" }
        ));
      }
      fail(new InstallUrlError(`fetch failed: ${error?.message ?? "unknown error"}`, {
        code: "fetch_network_error"
      }));
    });

    if (timeoutMs > 0) {
      req.setTimeout(timeoutMs, () => {
        req.destroy(new InstallUrlError(`fetch timed out after ${timeoutMs}ms.`, { code: "fetch_timeout" }));
      });
    }

    req.end();
  });
}

function streamResponseToFile(res, destinationPath, maxBytes) {
  return new Promise((resolve, reject) => {
    const fileStream = createWriteStream(destinationPath);
    const hash = createHash("sha256");
    let sizeBytes = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      res.destroy();
      fileStream.destroy();
      reject(error);
    };

    res.on("data", (chunk) => {
      if (settled) return;
      sizeBytes += chunk.length;

      if (sizeBytes > maxBytes) {
        fail(new InstallUrlError(`download exceeded --max-bytes (${maxBytes}).`, {
          code: "max_bytes_exceeded"
        }));
        return;
      }

      hash.update(chunk);

      if (!fileStream.write(chunk)) {
        res.pause();
        fileStream.once("drain", () => res.resume());
      }
    });

    res.on("end", () => {
      if (settled) return;
      fileStream.end((error) => {
        if (error) {
          fail(error);
          return;
        }
        settled = true;
        resolve({ sizeBytes, sha256: hash.digest("hex") });
      });
    });

    res.on("error", (error) => {
      fail(new InstallUrlError(`fetch failed: ${error?.message ?? "unknown error"}`, {
        code: "fetch_network_error"
      }));
    });

    fileStream.on("error", (error) => fail(error));
  });
}

/**
 * Builds a Node lookup function for an http(s) Agent that performs the
 * private/loopback check on the resolved address at connect time. Because the
 * Agent connects to exactly the address this returns, validation and connection
 * share one resolution, closing the DNS-rebinding TOCTOU. A custom `lookup`
 * (promise-returning) can be injected for deterministic tests.
 */
function makeGuardedLookup({ allowLoopback, lookup }) {
  const resolve = lookup ?? ((hostname) => dnsPromises.lookup(hostname, { all: true }));

  return (hostname, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" ? {} : (options ?? {});

    Promise.resolve()
      .then(() => resolve(hostname))
      .then((result) => {
        const list = normalizeAddresses(result);

        if (list.length === 0) {
          const error = new Error(`could not resolve ${hostname}`);
          error.code = "ENOTFOUND";
          throw error;
        }

        if (!allowLoopback && list.some((entry) => isBlockedHost(entry.address))) {
          const error = new Error(`refusing connection to a private/loopback address for ${hostname}`);
          error.code = "CLAWGUARD_BLOCKED_HOST";
          throw error;
        }

        if (opts.all) {
          cb(null, list);
        } else {
          cb(null, list[0].address, list[0].family);
        }
      })
      .catch((error) => cb(error));
  };
}

function normalizeAddresses(result) {
  const list = Array.isArray(result) ? result : result ? [result] : [];
  return list
    .map((entry) => {
      if (typeof entry === "string") {
        return { address: entry, family: net.isIP(entry) || 4 };
      }
      return { address: entry?.address, family: entry?.family || net.isIP(entry?.address ?? "") || 4 };
    })
    .filter((entry) => Boolean(entry.address));
}

// --- fetch-based path (mocked transport in tests) ----------------------------

async function fetchToFileViaFetch(startUrl, destinationPath, options) {
  const { maxBytes, timeoutMs, maxRedirects, allowLoopback, allowInsecureLoopback, integrity, fetchImpl, resolveDns, lookupImpl } = options;

  if (typeof fetchImpl !== "function") {
    throw new InstallUrlError("global fetch is unavailable; Node 20+ required.", { code: "no_fetch" });
  }

  const assertSafe = async (url) => {
    assertUrlPolicy(url, { allowLoopback, allowInsecureLoopback });
    if (!allowLoopback && resolveDns && (await resolveHostBlocked(url.hostname, { lookup: lookupImpl }))) {
      throw new InstallUrlError(
        `refusing fetch to host that resolves to a private or loopback address: ${url.hostname}`,
        { code: "blocked_host_resolved" }
      );
    }
  };

  let current = startUrl;
  await assertSafe(current);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("fetch timeout")), timeoutMs);
  let redirectCount = 0;
  let response;

  try {
    while (true) {
      try {
        response = await fetchImpl(current.href, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT }
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new InstallUrlError(`fetch timed out after ${timeoutMs}ms.`, { code: "fetch_timeout" });
        }
        if (error instanceof InstallUrlError) {
          throw error;
        }
        throw new InstallUrlError(`fetch failed: ${error?.message ?? "unknown error"}`, {
          code: "fetch_network_error"
        });
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");

        if (!location) {
          throw new InstallUrlError(`redirect response without Location header (status ${response.status}).`, {
            code: "redirect_missing_location"
          });
        }

        if (response.body && typeof response.body.cancel === "function") {
          try { await response.body.cancel(); } catch {}
        }

        redirectCount += 1;

        if (redirectCount > maxRedirects) {
          throw new InstallUrlError(`too many redirects (>${maxRedirects}).`, { code: "too_many_redirects" });
        }

        let next;
        try {
          next = new URL(location, current);
        } catch {
          throw new InstallUrlError(`invalid redirect target: ${location}`, { code: "invalid_redirect" });
        }

        await assertSafe(next);
        current = next;
        continue;
      }

      if (!response.ok) {
        throw new InstallUrlError(`fetch failed with HTTP ${response.status}`, { code: "fetch_status" });
      }

      break;
    }

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    const fileStream = createWriteStream(destinationPath);
    const hash = createHash("sha256");
    let sizeBytes = 0;

    try {
      if (!response.body) {
        throw new InstallUrlError("response had no body to stream.", { code: "empty_response_body" });
      }

      const reader = response.body.getReader();

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        sizeBytes += value.byteLength;

        if (sizeBytes > maxBytes) {
          try { await reader.cancel(); } catch {}
          throw new InstallUrlError(`download exceeded --max-bytes (${maxBytes}).`, {
            code: "max_bytes_exceeded"
          });
        }

        hash.update(value);

        if (!fileStream.write(value)) {
          await new Promise((resolve) => fileStream.once("drain", resolve));
        }
      }
    } finally {
      await new Promise((resolve, reject) => {
        fileStream.end((error) => (error ? reject(error) : resolve()));
      });
    }

    return finalizeResult({
      current,
      redirectCount,
      contentType: response.headers.get("content-type"),
      sizeBytes,
      sha256: hash.digest("hex"),
      integrity
    });
  } finally {
    clearTimeout(timer);
  }
}
