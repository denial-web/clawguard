import { promises as fs } from "node:fs";
import path from "node:path";

const sopPacksRoot = new URL("../../sop-packs/", import.meta.url);

export async function listSopPacks() {
  const packPaths = await findJsonFiles(sopPacksRoot);
  const packs = [];

  for (const packPath of packPaths) {
    const pack = await readSopPack(packPath);
    packs.push(summarizeSopPack(pack, packPath));
  }

  return packs.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadSopPack(packId) {
  const normalizedId = normalizePackId(packId);
  const packPaths = await findJsonFiles(sopPacksRoot);

  for (const packPath of packPaths) {
    const pack = await readSopPack(packPath);
    if (pack.id === normalizedId) {
      return {
        pack,
        path: packPath
      };
    }
  }

  throw new Error(`Unknown SOP pack: ${packId}`);
}

export async function resolveSopPackId(options) {
  if (options.packId) {
    return normalizePackId(options.packId);
  }

  if (!options.industry) {
    throw new Error("sop check requires --pack <id> or --industry <name>.");
  }

  const industry = normalizePackId(options.industry);
  const packs = await listSopPacks();
  const matches = packs.filter((pack) => pack.industry === industry || pack.id.includes(`/${industry}/`));

  if (matches.length === 0) {
    throw new Error(`No SOP pack found for industry: ${options.industry}`);
  }

  if (matches.length > 1) {
    throw new Error(`Multiple SOP packs found for industry ${options.industry}. Use --pack <id>.`);
  }

  return matches[0].id;
}

function summarizeSopPack(pack, packPath) {
  return {
    id: pack.id,
    title: pack.title,
    industry: pack.industry,
    role: pack.role,
    description: pack.description,
    evidenceCount: Array.isArray(pack.evidence) ? pack.evidence.length : 0,
    sourceCount: Array.isArray(pack.sources) ? pack.sources.length : 0,
    path: packPath
  };
}

async function readSopPack(packPath) {
  const text = await fs.readFile(packPath, "utf8");
  const pack = JSON.parse(text);
  validateSopPack(pack, packPath);
  return pack;
}

function validateSopPack(pack, packPath) {
  if (pack?.schemaVersion !== "clawguard.sopPack.v1") {
    throw new Error(`Invalid SOP pack schema in ${packPath}`);
  }

  for (const field of ["id", "title", "industry", "role"]) {
    if (!pack[field] || typeof pack[field] !== "string") {
      throw new Error(`SOP pack ${packPath} is missing ${field}.`);
    }
  }

  if (!Array.isArray(pack.evidence)) {
    throw new Error(`SOP pack ${packPath} must include evidence array.`);
  }
}

async function findJsonFiles(rootUrl) {
  const rootPath = rootUrl.pathname;
  const files = [];

  await walk(rootPath, files);
  return files.filter((file) => file.endsWith(".json")).sort();
}

async function walk(directory, files) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }
}

function normalizePackId(value) {
  return String(value ?? "").trim().toLowerCase();
}
