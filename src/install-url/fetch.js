import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

import { isBlockedHost } from "./host.js";
import { InstallUrlError } from "./url.js";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_REDIRECTS = 5;

export const FETCH_DEFAULTS = Object.freeze({
  maxBytes: DEFAULT_MAX_BYTES,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxRedirects: MAX_REDIRECTS
});

export { isBlockedHost as isBlockedFetchHost };

function assertSafeUrl(url, { allowLoopback, allowInsecureLoopback }) {
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

export async function fetchToFile(url, destinationPath, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const allowLoopback = Boolean(options.allowLoopback);
  const allowInsecureLoopback = Boolean(options.allowInsecureLoopback);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const integrity = parseIntegrity(options.integrity ?? null);

  if (typeof fetchImpl !== "function") {
    throw new InstallUrlError("global fetch is unavailable; Node 20+ required.", { code: "no_fetch" });
  }

  let current;

  try {
    current = new URL(url);
  } catch {
    throw new InstallUrlError(`Could not parse URL: ${url}`, { code: "invalid_url" });
  }

  assertSafeUrl(current, { allowLoopback, allowInsecureLoopback });

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
          headers: { "User-Agent": "clawguard-install/1.0" }
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

        assertSafeUrl(next, { allowLoopback, allowInsecureLoopback });
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
          throw new InstallUrlError(
            `download exceeded --max-bytes (${maxBytes}).`,
            { code: "max_bytes_exceeded" }
          );
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

    const digestHex = hash.digest("hex");
    let integrityVerified = null;

    if (integrity) {
      integrityVerified = digestHex === integrity.expectedHex;

      if (!integrityVerified) {
        throw new InstallUrlError(
          `integrity mismatch: expected sha256 ${integrity.expectedHex}, got ${digestHex}.`,
          { code: "integrity_mismatch" }
        );
      }
    }

    return {
      finalUrl: current.href,
      scheme: current.protocol,
      sizeBytes,
      redirectCount,
      contentType: response.headers.get("content-type"),
      sha256: digestHex,
      integrityVerified,
      integrityProvided: Boolean(integrity)
    };
  } finally {
    clearTimeout(timer);
  }
}
