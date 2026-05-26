import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_QUARANTINE_ROOT = path.join(".clawguard", "quarantine");

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateRunId() {
  const buffer = randomBytes(16);
  let value = 0n;

  for (const byte of buffer) {
    value = (value << 8n) | BigInt(byte);
  }

  const chars = new Array(26);

  for (let i = 25; i >= 0; i -= 1) {
    chars[i] = CROCKFORD_BASE32[Number(value & 31n)];
    value >>= 5n;
  }

  return chars.join("");
}

export async function createQuarantineRun({ root, runId } = {}) {
  const quarantineRoot = path.resolve(root ?? DEFAULT_QUARANTINE_ROOT);
  await fs.mkdir(quarantineRoot, { recursive: true });

  if (process.platform !== "win32") {
    try { await fs.chmod(quarantineRoot, 0o700); } catch {}
  }

  const id = runId ?? generateRunId();
  const runPath = path.join(quarantineRoot, id);
  await fs.mkdir(runPath);

  if (process.platform !== "win32") {
    try { await fs.chmod(runPath, 0o700); } catch {}
  }

  const downloadDir = path.join(runPath, "download");
  const extractedDir = path.join(runPath, "extracted");
  await fs.mkdir(downloadDir);
  await fs.mkdir(extractedDir);

  return {
    runId: id,
    root: quarantineRoot,
    path: runPath,
    downloadDir,
    extractedDir,
    sourcePath: path.join(runPath, "source.json"),
    scanReportPath: path.join(runPath, "scan-report.json"),
    checkPath: path.join(runPath, "check.json"),
    approvalPath: path.join(runPath, "approval.json")
  };
}

export async function writeQuarantineJson(filePath, payload) {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

export async function readQuarantineJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

export async function removeQuarantineRun(runPath) {
  if (!runPath) {
    return;
  }

  await fs.rm(runPath, { recursive: true, force: true });
}

export async function removeDownloadDir(downloadDir) {
  if (!downloadDir) {
    return;
  }

  await fs.rm(downloadDir, { recursive: true, force: true });
}

export async function findRunByApprovalId(quarantineRoot, approvalId) {
  const root = path.resolve(quarantineRoot ?? DEFAULT_QUARANTINE_ROOT);
  let entries;

  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const approvalPath = path.join(root, entry.name, "approval.json");
    let approval;

    try {
      approval = await readQuarantineJson(approvalPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }

      continue;
    }

    if (approval?.approvalId === approvalId) {
      return {
        runId: entry.name,
        root,
        path: path.join(root, entry.name),
        downloadDir: path.join(root, entry.name, "download"),
        extractedDir: path.join(root, entry.name, "extracted"),
        sourcePath: path.join(root, entry.name, "source.json"),
        scanReportPath: path.join(root, entry.name, "scan-report.json"),
        checkPath: path.join(root, entry.name, "check.json"),
        approvalPath
      };
    }
  }

  return null;
}
