import net from "node:net";
import dns from "node:dns/promises";

export function isBlockedHost(hostname) {
  const host = String(hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "");

  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }

  const version = net.isIP(host);

  if (version === 4) {
    return isBlockedIpv4(host);
  }

  if (version === 6) {
    return isBlockedIpv6(host);
  }

  // Not a normal dotted IPv4, IPv6 literal, or hostname. Resolvers and some
  // HTTP clients still interpret bare numeric / hex / octal forms as IPv4
  // (e.g. 2130706433, 0x7f000001, 017700000001 all mean 127.0.0.1). A real
  // DNS hostname always contains a non-digit, so treat pure-numeric and
  // 0x-prefixed hosts as blocked rather than guessing how the client decodes them.
  if (/^0x[0-9a-f]+$/.test(host) || /^[0-9]+$/.test(host)) {
    return true;
  }

  return false;
}

/**
 * Resolves the hostname and blocks if it (or any address it resolves to) is a
 * private/loopback/link-local target. Defeats DNS-based SSRF where a public
 * name points at 127.0.0.1 or a cloud metadata endpoint (169.254.169.254).
 *
 * Note: this is resolve-time validation, not connect-time pinning, so it
 * narrows but does not fully eliminate DNS-rebinding races. Pass a `lookup`
 * implementation to make this deterministic in tests.
 */
export async function resolveHostBlocked(hostname, { lookup } = {}) {
  if (isBlockedHost(hostname)) {
    return true;
  }

  const host = String(hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "");

  if (!host || net.isIP(host)) {
    return false;
  }

  const lookupImpl = lookup ?? ((name) => dns.lookup(name, { all: true }));
  let records;

  try {
    records = await lookupImpl(host);
  } catch {
    // Resolution failure is left to the fetch layer, which will error out.
    return false;
  }

  const list = Array.isArray(records) ? records : [records];
  return list.some((record) => {
    const address = typeof record === "string" ? record : record?.address;
    return isBlockedHost(address);
  });
}

function isBlockedIpv4(host) {
  const parts = host.split(".").map((part) => Number(part));
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254) ||
    parts[0] === 0
  );
}

function isBlockedIpv6(host) {
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    return true;
  }

  // IPv4-mapped / IPv4-compatible addresses (::ffff:127.0.0.1 or ::ffff:7f00:1)
  // tunnel an IPv4 target through an IPv6 literal; decode and re-check it.
  const mapped = extractMappedIpv4(host);
  return Boolean(mapped) && isBlockedIpv4(mapped);
}

function extractMappedIpv4(host) {
  const dotted = host.match(/:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    return dotted[1];
  }

  const hex = host.match(/:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex && host.includes("::")) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(".");
  }

  return null;
}
