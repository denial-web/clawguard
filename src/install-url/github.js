import { isBlockedHost } from "./host.js";
import { InstallUrlError } from "./url.js";

/**
 * Convert a github.com /tree/ URL into a codeload tarball URL plus an in-archive path prefix.
 * Returns null when the URL is not a GitHub tree link.
 */
export function githubTreeToCodeloadTarball(sourceUrl) {
  let url;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length < 4 || parts[2] !== "tree") {
    return null;
  }

  const [owner, repo, , branch, ...subpath] = parts;
  const tarballUrl = `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${branch}`;
  const archiveRoot = `${repo}-${branch}/`;
  const stripPrefix =
    subpath.length > 0 ? `${archiveRoot}${subpath.join("/")}/` : archiveRoot;

  return { tarballUrl, stripPrefix };
}

export function resolveFetchableSourceUrl(sourceUrl, options = {}) {
  if (!sourceUrl || typeof sourceUrl !== "string") {
    throw new InstallUrlError("ClawHub lock entry is missing a source URL.", { code: "clawhub_missing_source" });
  }

  const trimmed = sourceUrl.trim();
  const allowLoopback = Boolean(options.allowLoopback);
  const allowInsecureLoopback = Boolean(options.allowInsecureLoopback);

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol === "https:") {
      const github = githubTreeToCodeloadTarball(trimmed);

      if (github) {
        return github;
      }

      return { tarballUrl: trimmed, stripPrefix: null };
    }

    if (
      allowInsecureLoopback &&
      allowLoopback &&
      parsed.protocol === "http:" &&
      isBlockedHost(parsed.hostname)
    ) {
      return { tarballUrl: trimmed, stripPrefix: null };
    }
  } catch {
    // fall through
  }

  throw new InstallUrlError(`ClawHub source URL is not fetchable as HTTPS: ${trimmed}`, {
    code: "clawhub_unsupported_source"
  });
}
