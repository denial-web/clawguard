import net from "node:net";

export function isBlockedHost(hostname) {
  const host = String(hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "");

  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }

  const version = net.isIP(host);

  if (version === 4) {
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

  if (version === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  }

  return false;
}
