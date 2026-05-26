import { promises as fs } from "node:fs";
import path from "node:path";

import { resolveFetchableSourceUrl } from "./github.js";
import { InstallUrlError } from "./url.js";

const CLAWHUB_SCHEME = /^clawhub:(.+)$/i;

export function parseClawHubReference(input) {
  if (typeof input !== "string" || input.length === 0) {
    throw new InstallUrlError("install requires a ClawHub reference.", { code: "invalid_clawhub" });
  }

  const match = CLAWHUB_SCHEME.exec(input.trim());

  if (!match) {
    throw new InstallUrlError(`invalid ClawHub reference: ${input}`, { code: "invalid_clawhub" });
  }

  const body = match[1].trim();
  const at = body.lastIndexOf("@");

  if (at <= 0 || at === body.length - 1) {
    throw new InstallUrlError(
      `ClawHub reference must include @version (example: clawhub:my-skill@1.0.0): ${input}`,
      { code: "invalid_clawhub" }
    );
  }

  const version = body.slice(at + 1).trim();
  const slug = body.slice(0, at).trim().replace(/^\/+/, "").replace(/\/+$/, "");

  if (!slug || !version) {
    throw new InstallUrlError(`invalid ClawHub reference: ${input}`, { code: "invalid_clawhub" });
  }

  const segments = slug.split("/").filter(Boolean);
  const shortName = segments[segments.length - 1] ?? slug;

  return {
    raw: input.trim(),
    slug,
    name: shortName,
    version
  };
}

export async function loadClawHubLock(lockPath) {
  let text;

  try {
    text = await fs.readFile(lockPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new InstallUrlError(`ClawHub lockfile not found: ${lockPath}`, { code: "clawhub_lock_missing" });
    }

    throw error;
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new InstallUrlError(`ClawHub lockfile is not valid JSON: ${error.message}`, {
      code: "clawhub_lock_invalid"
    });
  }

  return extractLockEntries(parsed);
}

function extractLockEntries(value) {
  const rawEntries = [];

  if (Array.isArray(value?.skills)) {
    rawEntries.push(...value.skills.map((entry) => normalizeLockEntry(entry)));
  } else if (value?.skills && typeof value.skills === "object") {
    rawEntries.push(...Object.values(value.skills).map((entry) => normalizeLockEntry(entry)));
  }

  return rawEntries.filter((entry) => entry.name && entry.source);
}

function normalizeLockEntry(entry) {
  const value = entry && typeof entry === "object" ? entry : {};

  return {
    name: String(value.name ?? value.slug ?? value.id ?? "").trim(),
    version: String(value.version ?? value.ref ?? value.tag ?? "").trim(),
    source: String(value.source ?? value.repository ?? value.repo ?? value.url ?? "").trim(),
    skillDir: String(value.path ?? value.dir ?? value.target ?? "").trim()
  };
}

function entryMatchesReference(entry, reference) {
  const nameMatch =
    entry.name.toLowerCase() === reference.name.toLowerCase() ||
    entry.name.toLowerCase() === reference.slug.toLowerCase();
  const versionMatch = entry.version === reference.version;

  if (!versionMatch) {
    return false;
  }

  if (nameMatch) {
    return true;
  }

  if (entry.skillDir) {
    const dir = entry.skillDir.replace(/^\/+/, "").replace(/\/+$/, "");

    return (
      dir.toLowerCase() === reference.slug.toLowerCase() ||
      dir.toLowerCase().endsWith(`/${reference.slug.toLowerCase()}`)
    );
  }

  return false;
}

export async function resolveClawHubReference(reference, options = {}) {
  const parsed = typeof reference === "string" ? parseClawHubReference(reference) : reference;
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const lockPath = options.lockPath
    ? path.resolve(options.lockPath)
    : path.join(cwd, ".clawhub", "lock.json");
  const entries = await loadClawHubLock(lockPath);
  const match = entries.find((entry) => entryMatchesReference(entry, parsed));

  if (!match) {
    throw new InstallUrlError(
      `no ClawHub lock entry for ${parsed.slug}@${parsed.version} in ${lockPath}`,
      { code: "clawhub_entry_missing" }
    );
  }

  const fetchable = resolveFetchableSourceUrl(match.source, {
    allowLoopback: Boolean(options.allowLoopback),
    allowInsecureLoopback: Boolean(options.allowInsecureLoopback)
  });

  return {
    reference: parsed,
    lockPath,
    lockEntry: match,
    fetchUrl: fetchable.tarballUrl,
    stripPrefix: fetchable.stripPrefix,
    originalSource: match.source
  };
}

export function detectClawHubKind(input) {
  return typeof input === "string" && CLAWHUB_SCHEME.test(input.trim());
}
