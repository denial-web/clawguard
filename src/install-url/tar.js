import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

import { InstallUrlError } from "./url.js";

const TAR_BLOCK = 512;
const TYPE_FILE = "0";
const TYPE_FILE_LEGACY = "\0";
const TYPE_HARDLINK = "1";
const TYPE_SYMLINK = "2";
const TYPE_DIRECTORY = "5";
const TYPE_PAX_NEXT = "x";
const TYPE_PAX_GLOBAL = "g";
const TYPE_GNU_LONGNAME = "L";
const TYPE_GNU_LONGLINK = "K";

function parseOctal(buffer, offset, size) {
  let end = offset + size;

  while (end > offset && (buffer[end - 1] === 0 || buffer[end - 1] === 0x20)) {
    end -= 1;
  }

  let start = offset;

  while (start < end && buffer[start] === 0x20) {
    start += 1;
  }

  if (start === end) {
    return 0;
  }

  const text = buffer.toString("ascii", start, end);
  const value = Number.parseInt(text, 8);

  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function readCString(buffer, offset, size) {
  let end = offset;
  const limit = offset + size;

  while (end < limit && buffer[end] !== 0) {
    end += 1;
  }

  return buffer.toString("utf8", offset, end);
}

function parseHeader(block) {
  const name = readCString(block, 0, 100);
  const mode = parseOctal(block, 100, 8);
  const size = parseOctal(block, 124, 12);
  const type = String.fromCharCode(block[156]);
  const linkname = readCString(block, 157, 100);
  const magic = block.toString("ascii", 257, 263);
  const prefix = readCString(block, 345, 155);
  let fullName = name;

  if (magic.startsWith("ustar") && prefix.length > 0) {
    fullName = `${prefix}/${name}`;
  }

  return { name: fullName, mode, size, type, linkname };
}

function parsePaxRecords(text) {
  const records = {};
  let offset = 0;

  while (offset < text.length) {
    const spaceIndex = text.indexOf(" ", offset);

    if (spaceIndex === -1) {
      break;
    }

    const length = Number.parseInt(text.slice(offset, spaceIndex), 10);

    if (!Number.isFinite(length) || length <= 0) {
      break;
    }

    const recordEnd = offset + length;
    const body = text.slice(spaceIndex + 1, recordEnd - 1);
    const equals = body.indexOf("=");

    if (equals > 0) {
      records[body.slice(0, equals)] = body.slice(equals + 1);
    }

    offset = recordEnd;
  }

  return records;
}

function isBlockEmpty(block) {
  for (let i = 0; i < block.length; i += 1) {
    if (block[i] !== 0) {
      return false;
    }
  }

  return true;
}

function normalizeAndCheckPath(rawName, extractRoot) {
  const stripped = rawName.replace(/^\/+/, "").replace(/\\/g, "/");
  const joined = path.join(extractRoot, stripped);
  const normalized = path.resolve(joined);
  const rootNormalized = path.resolve(extractRoot);

  if (normalized !== rootNormalized && !normalized.startsWith(rootNormalized + path.sep)) {
    return { unsafe: true, resolved: normalized };
  }

  return { unsafe: false, resolved: normalized };
}

async function readExact(iterator, leftover, byteCount) {
  let buffer = leftover;

  while (buffer.length < byteCount) {
    const next = await iterator.next();

    if (next.done) {
      return null;
    }

    const chunk = Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value);
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
  }

  return { taken: buffer.subarray(0, byteCount), remainder: buffer.subarray(byteCount) };
}

export async function extractTarGz(sourcePath, extractRoot, options = {}) {
  try {
    return await extractTarGzImpl(sourcePath, extractRoot, options);
  } catch (error) {
    if (error instanceof InstallUrlError) {
      throw error;
    }

    if (isLikelyArchiveError(error)) {
      throw new InstallUrlError(
        `archive is not a valid gzipped tar (.tar.gz / .tgz): ${error?.message ?? "unknown error"}`,
        { code: "invalid_archive" }
      );
    }

    throw error;
  }
}

function isLikelyArchiveError(error) {
  const code = error?.code ?? "";
  const message = error?.message ?? "";

  if (typeof code === "string" && (code.startsWith("Z_") || code === "ERR_ZLIB_BINDING")) {
    return true;
  }

  return /incorrect header check|unexpected end of file|invalid distance|invalid block type/i.test(message);
}

async function extractTarGzImpl(sourcePath, extractRoot, options = {}) {
  const maxEntries = options.maxEntries ?? 5000;
  await fs.mkdir(extractRoot, { recursive: true });
  const rootResolved = path.resolve(extractRoot);
  const skipped = [];
  let entries = 0;
  let bytesWritten = 0;
  let directories = 0;
  let files = 0;
  let symlinkCount = 0;
  let hardlinkCount = 0;

  const fileStream = createReadStream(sourcePath);
  const gunzip = createGunzip();
  fileStream.pipe(gunzip);
  const iterator = Readable.toWeb(gunzip).getReader();

  const asyncIter = {
    async next() {
      const { value, done } = await iterator.read();
      return { value, done };
    }
  };

  let leftover = Buffer.alloc(0);
  let emptyBlocks = 0;
  let pendingLongName = null;
  let pendingLongLink = null;
  let pendingPax = null;

  try {
    while (true) {
      const headerRead = await readExact(asyncIter, leftover, TAR_BLOCK);

      if (!headerRead) {
        break;
      }

      leftover = headerRead.remainder;
      const headerBlock = headerRead.taken;

      if (isBlockEmpty(headerBlock)) {
        emptyBlocks += 1;

        if (emptyBlocks >= 2) {
          break;
        }

        continue;
      }

      emptyBlocks = 0;
      const header = parseHeader(headerBlock);
      const dataBlocks = Math.ceil(header.size / TAR_BLOCK);
      const padded = dataBlocks * TAR_BLOCK;

      let dataBuffer = Buffer.alloc(0);

      if (padded > 0) {
        const dataRead = await readExact(asyncIter, leftover, padded);

        if (!dataRead) {
          throw new InstallUrlError("truncated tar archive", { code: "tar_truncated" });
        }

        leftover = dataRead.remainder;
        dataBuffer = dataRead.taken.subarray(0, header.size);
      }

      let entryName = header.name;

      if (pendingLongName !== null) {
        entryName = pendingLongName;
        pendingLongName = null;
      }

      let linkname = header.linkname;

      if (pendingLongLink !== null) {
        linkname = pendingLongLink;
        pendingLongLink = null;
      }

      if (pendingPax !== null) {
        if (typeof pendingPax.path === "string") {
          entryName = pendingPax.path;
        }

        if (typeof pendingPax.linkpath === "string") {
          linkname = pendingPax.linkpath;
        }

        pendingPax = null;
      }

      if (header.type === TYPE_GNU_LONGNAME) {
        pendingLongName = dataBuffer.toString("utf8").replace(/\0+$/, "");
        continue;
      }

      if (header.type === TYPE_GNU_LONGLINK) {
        pendingLongLink = dataBuffer.toString("utf8").replace(/\0+$/, "");
        continue;
      }

      if (header.type === TYPE_PAX_NEXT) {
        pendingPax = parsePaxRecords(dataBuffer.toString("utf8"));
        continue;
      }

      if (header.type === TYPE_PAX_GLOBAL) {
        continue;
      }

      entries += 1;

      if (entries > maxEntries) {
        throw new InstallUrlError(`tar archive has too many entries (>${maxEntries}).`, {
          code: "tar_too_many_entries"
        });
      }

      const pathCheck = normalizeAndCheckPath(entryName, rootResolved);

      if (pathCheck.unsafe) {
        throw new InstallUrlError(`tar entry escapes extraction root: ${entryName}`, {
          code: "path_traversal"
        });
      }

      const destination = pathCheck.resolved;

      if (header.type === TYPE_SYMLINK) {
        symlinkCount += 1;
        skipped.push({ name: entryName, reason: "symlink", linkname });
        continue;
      }

      if (header.type === TYPE_HARDLINK) {
        hardlinkCount += 1;
        skipped.push({ name: entryName, reason: "hardlink", linkname });
        continue;
      }

      if (header.type === TYPE_DIRECTORY) {
        await fs.mkdir(destination, { recursive: true, mode: 0o755 });
        directories += 1;
        continue;
      }

      if (header.type === TYPE_FILE || header.type === TYPE_FILE_LEGACY) {
        await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
        await fs.writeFile(destination, dataBuffer, { mode: 0o644 });
        bytesWritten += dataBuffer.length;
        files += 1;
        continue;
      }

      skipped.push({ name: entryName, reason: `unsupported_type:${header.type}`, linkname });
    }
  } finally {
    try { await iterator.cancel(); } catch {}
  }

  return {
    extractRoot: rootResolved,
    entries,
    files,
    directories,
    symlinksSkipped: symlinkCount,
    hardlinksSkipped: hardlinkCount,
    bytesWritten,
    skipped
  };
}
