import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export async function appendAuditEvent(auditPath, type, event = {}) {
  const resolvedPath = path.resolve(auditPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  const previous = await readLastAuditEntry(resolvedPath);
  const entryBase = {
    schemaVersion: "clawguard.agentAudit.v1",
    id: randomUUID(),
    time: new Date().toISOString(),
    type,
    prevHash: previous?.hash ?? "genesis",
    event
  };
  const hash = hashEntry(entryBase);
  const entry = { ...entryBase, hash };
  await fs.appendFile(resolvedPath, `${JSON.stringify(entry)}\n`);
  return entry;
}

export async function readAuditEvents(auditPath, { limit = 50 } = {}) {
  let entries;
  try {
    entries = await readAuditEntries(path.resolve(auditPath));
  } catch (error) {
    if (error.code === "ENOENT") {
      entries = [];
    } else {
      throw error;
    }
  }

  return Number.isSafeInteger(limit) && limit > 0 ? entries.slice(-limit) : entries;
}

export async function verifyAuditChain(auditPath) {
  let entries;
  try {
    entries = await readAuditEntries(path.resolve(auditPath));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        ok: true,
        entries: 0,
        errors: []
      };
    }
    throw error;
  }

  const errors = [];
  let previousHash = "genesis";
  for (const [index, entry] of entries.entries()) {
    const { hash, ...entryBase } = entry;
    if (entry.prevHash !== previousHash) {
      errors.push({
        index,
        id: entry.id,
        reason: "prevHash mismatch",
        expected: previousHash,
        actual: entry.prevHash
      });
    }
    const expectedHash = hashEntry(entryBase);
    if (hash !== expectedHash) {
      errors.push({
        index,
        id: entry.id,
        reason: "hash mismatch",
        expected: expectedHash,
        actual: hash
      });
    }
    previousHash = hash;
  }

  return {
    ok: errors.length === 0,
    entries: entries.length,
    errors
  };
}

async function readLastAuditEntry(auditPath) {
  try {
    const entries = await readAuditEntries(auditPath);
    return entries.at(-1) ?? null;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readAuditEntries(auditPath) {
  const content = await fs.readFile(auditPath, "utf8");
  return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function hashEntry(entryBase) {
  return createHash("sha256")
    .update(JSON.stringify(entryBase))
    .digest("hex");
}
