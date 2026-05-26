import path from "node:path";

export const SUPPORTED_URL_SCHEMES = ["https:"];
export const TEST_ONLY_URL_SCHEMES = ["http:"];
export const DEFERRED_URL_SCHEMES = {
  "http:": "Plain HTTP is rejected; install requires https.",
  "zip:": "Zip archives are deferred to v1.1.",
  "clawhub:": "ClawHub URLs are deferred to v1.1.",
  "git+https:": "Git URLs are deferred to a future release.",
  "git:": "Git URLs are deferred to a future release.",
  "npm:": "npm registry URLs are deferred to a future release.",
  "oci:": "OCI image URLs are deferred to a future release.",
  "file:": "file: URLs are rejected; pass a local path instead."
};

export class InstallUrlError extends Error {
  constructor(message, { exitCode = 3, code } = {}) {
    super(message);
    this.name = "InstallUrlError";
    this.exitCode = exitCode;
    this.code = code ?? "install_url_error";
  }
}

export function detectSourceKind(input, options = {}) {
  if (typeof input !== "string" || input.length === 0) {
    throw new InstallUrlError("install requires a target argument.", { code: "missing_target" });
  }

  const looksLikeScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input);

  if (!looksLikeScheme) {
    return { kind: "path", scheme: null, path: path.resolve(input), url: null };
  }

  let url;

  try {
    url = new URL(input);
  } catch {
    throw new InstallUrlError(`Could not parse URL: ${input}`, { code: "invalid_url" });
  }

  const scheme = url.protocol;
  const allowedSchemes = options.allowInsecureLoopback
    ? [...SUPPORTED_URL_SCHEMES, ...TEST_ONLY_URL_SCHEMES]
    : SUPPORTED_URL_SCHEMES;

  if (!allowedSchemes.includes(scheme)) {
    const reason = DEFERRED_URL_SCHEMES[scheme] ?? `unsupported URL scheme: ${scheme.replace(/:$/, "")}.`;
    throw new InstallUrlError(`unsupported URL scheme: ${reason}`, { code: "unsupported_scheme" });
  }

  if (!url.hostname) {
    throw new InstallUrlError("install URL must include a hostname.", { code: "missing_hostname" });
  }

  if (url.username || url.password) {
    throw new InstallUrlError("install URLs cannot contain credentials.", { code: "credentials_in_url" });
  }

  return { kind: "url", scheme, path: null, url };
}

export function isLikelyTarball(url) {
  const pathname = url.pathname.toLowerCase();

  if (pathname.endsWith(".tar.gz") || pathname.endsWith(".tgz")) {
    return true;
  }

  if (/\/archive\/(?:refs\/(?:tags|heads)\/)?[^/]+\.tar\.gz$/.test(pathname)) {
    return true;
  }

  return false;
}

export function isLikelyZip(url) {
  return url.pathname.toLowerCase().endsWith(".zip");
}

export function basenameFromUrl(url) {
  const trimmed = url.pathname.replace(/\/+$/, "");
  const last = trimmed.split("/").pop() ?? "";

  if (last.length === 0) {
    return "bundle.tar.gz";
  }

  return last;
}
