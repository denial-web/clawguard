import { promises as fs } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import { InstallUrlError } from "./url.js";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function stripArchivePath(rawName, stripPrefix) {
  if (!stripPrefix) {
    return rawName;
  }

  const normalized = rawName.replace(/^\/+/, "").replace(/\\/g, "/");
  const prefix = stripPrefix.replace(/^\/+/, "").replace(/\\/g, "/");

  if (!normalized.startsWith(prefix)) {
    return null;
  }

  const remainder = normalized.slice(prefix.length).replace(/^\/+/, "");

  if (remainder.length === 0) {
    return null;
  }

  return remainder;
}

function normalizeAndCheckPath(rawName, extractRoot, stripPrefix) {
  const strippedEntry = stripArchivePath(rawName, stripPrefix);

  if (strippedEntry === null) {
    return { skip: true, unsafe: false, resolved: null };
  }

  const stripped = strippedEntry.replace(/^\/+/, "").replace(/\\/g, "/");

  if (stripped.includes("\0")) {
    return { skip: true, unsafe: false, resolved: null };
  }

  const joined = path.join(extractRoot, stripped);
  const normalized = path.resolve(joined);
  const rootNormalized = path.resolve(extractRoot);

  if (normalized !== rootNormalized && !normalized.startsWith(rootNormalized + path.sep)) {
    return { unsafe: true, resolved: normalized };
  }

  return { unsafe: false, resolved: normalized, skip: false };
}

function findEndOfCentralDirectory(buffer) {
  const minEocd = 22;

  for (let offset = buffer.length - minEocd; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === SIG_EOCD) {
      return offset;
    }
  }

  return -1;
}

function readCentralDirectory(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);

  if (eocdOffset === -1) {
    throw new InstallUrlError("zip archive is missing end-of-central-directory record.", {
      code: "invalid_archive"
    });
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralOffset;

  while (entries.length < entryCount) {
    if (buffer.readUInt32LE(offset) !== SIG_CENTRAL) {
      throw new InstallUrlError("zip central directory is corrupt.", { code: "invalid_archive" });
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function decompressEntry(buffer, localOffset, entry) {
  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed;
  }

  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed);
  }

  throw new InstallUrlError(`unsupported zip compression method: ${entry.compressionMethod}`, {
    code: "unsupported_zip_compression"
  });
}

export async function extractZip(sourcePath, extractRoot, options = {}) {
  try {
    return await extractZipImpl(sourcePath, extractRoot, options);
  } catch (error) {
    if (error instanceof InstallUrlError) {
      throw error;
    }

    throw new InstallUrlError(`archive is not a valid zip file: ${error?.message ?? "unknown error"}`, {
      code: "invalid_archive"
    });
  }
}

async function extractZipImpl(sourcePath, extractRoot, options = {}) {
  const maxEntries = options.maxEntries ?? 5000;
  const stripPrefix = options.stripPrefix ?? null;
  const buffer = await fs.readFile(sourcePath);
  const entries = readCentralDirectory(buffer);
  await fs.mkdir(extractRoot, { recursive: true });
  const rootResolved = path.resolve(extractRoot);
  const skipped = [];
  let files = 0;
  let directories = 0;
  let bytesWritten = 0;

  if (entries.length > maxEntries) {
    throw new InstallUrlError(`zip archive has too many entries (>${maxEntries}).`, {
      code: "zip_too_many_entries"
    });
  }

  for (const entry of entries) {
    if (entry.fileName.endsWith("/")) {
      const pathCheck = normalizeAndCheckPath(entry.fileName.slice(0, -1), rootResolved, stripPrefix);

      if (pathCheck.skip) {
        continue;
      }

      if (pathCheck.unsafe) {
        throw new InstallUrlError(`zip entry escapes extraction root: ${entry.fileName}`, {
          code: "path_traversal"
        });
      }

      await fs.mkdir(pathCheck.resolved, { recursive: true, mode: 0o755 });
      directories += 1;
      continue;
    }

    const pathCheck = normalizeAndCheckPath(entry.fileName, rootResolved, stripPrefix);

    if (pathCheck.skip) {
      continue;
    }

    if (pathCheck.unsafe) {
      throw new InstallUrlError(`zip entry escapes extraction root: ${entry.fileName}`, {
        code: "path_traversal"
      });
    }

    const payload = decompressEntry(buffer, entry.localHeaderOffset, entry);
    await fs.mkdir(path.dirname(pathCheck.resolved), { recursive: true, mode: 0o755 });
    await fs.writeFile(pathCheck.resolved, payload, { mode: 0o644 });
    bytesWritten += payload.length;
    files += 1;
  }

  return {
    extractRoot: rootResolved,
    entries: entries.length,
    files,
    directories,
    symlinksSkipped: 0,
    hardlinksSkipped: 0,
    bytesWritten,
    skipped
  };
}
