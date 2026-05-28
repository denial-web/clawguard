import { crc32, deflateRawSync } from "node:zlib";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function writeUInt16(buffer, offset, value) {
  buffer.writeUInt16LE(value, offset);
}

function writeUInt32(buffer, offset, value) {
  buffer.writeUInt32LE(value, offset);
}

export function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = entry.name.replace(/\\/g, "/");
    const nameBuffer = Buffer.from(name, "utf8");
    const uncompressed = Buffer.from(entry.content ?? "", "utf8");
    const compressionMethod = entry.compressionMethod ?? 0;
    const content =
      compressionMethod === 8 ? deflateRawSync(uncompressed) : uncompressed;
    const crc = crc32(uncompressed) >>> 0;
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    writeUInt32(localHeader, 0, SIG_LOCAL);
    writeUInt16(localHeader, 8, compressionMethod);
    writeUInt32(localHeader, 14, crc);
    writeUInt32(localHeader, 18, content.length);
    writeUInt32(localHeader, 22, content.length);
    writeUInt16(localHeader, 26, nameBuffer.length);
    writeUInt16(localHeader, 28, 0);
    nameBuffer.copy(localHeader, 30);

    localParts.push(localHeader, content);
    const localOffset = offset;
    offset += localHeader.length + content.length;

    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    writeUInt32(centralHeader, 0, SIG_CENTRAL);
    writeUInt16(centralHeader, 10, 0);
    writeUInt16(centralHeader, 10, compressionMethod);
    writeUInt32(centralHeader, 16, crc);
    writeUInt32(centralHeader, 20, content.length);
    writeUInt32(centralHeader, 24, uncompressed.length);
    writeUInt16(centralHeader, 28, nameBuffer.length);
    writeUInt16(centralHeader, 30, 0);
    writeUInt16(centralHeader, 32, 0);
    writeUInt16(centralHeader, 34, 0);
    writeUInt16(centralHeader, 36, 0);
    writeUInt32(centralHeader, 42, localOffset);
    nameBuffer.copy(centralHeader, 46);
    centralParts.push(centralHeader);
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralOffset = offset;
  offset += centralDirectory.length;

  const eocd = Buffer.alloc(22);
  writeUInt32(eocd, 0, SIG_EOCD);
  writeUInt16(eocd, 8, entries.length);
  writeUInt16(eocd, 10, entries.length);
  writeUInt32(eocd, 12, centralDirectory.length);
  writeUInt32(eocd, 16, centralOffset);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

export function safeSkillZipEntries({ rootName = "safe-skill" } = {}) {
  return [
    {
      name: `${rootName}/SKILL.md`,
      content: [
        "# Safe Test Skill",
        "",
        "Summarizes notes only.",
        "",
        "## Permissions",
        "",
        "- Read only user-selected files.",
        ""
      ].join("\n")
    }
  ];
}
