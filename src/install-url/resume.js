import { promises as fs } from "node:fs";
import path from "node:path";

import {
  findRunByApprovalId,
  readQuarantineJson,
  removeQuarantineRun,
  DEFAULT_QUARANTINE_ROOT
} from "./quarantine.js";
import { InstallUrlError } from "./url.js";

export async function resumeInstallFromApproval(options) {
  if (!options?.approvalId) {
    throw new InstallUrlError("resume requires --resume <approval-id>.", { code: "missing_approval_id" });
  }

  const quarantineRoot = options.quarantineDir ?? DEFAULT_QUARANTINE_ROOT;
  const run = await findRunByApprovalId(quarantineRoot, options.approvalId);

  if (!run) {
    throw new InstallUrlError(
      `no quarantined install found for approval ${options.approvalId} under ${quarantineRoot}.`,
      { code: "quarantine_not_found" }
    );
  }

  const approval = await readQuarantineJson(run.approvalPath);
  const decision = await findLatestDecision({
    approvalOut: options.approvalOut,
    approvalId: options.approvalId,
    explicitDecision: options.decision
  });

  if (!decision) {
    throw new InstallUrlError(
      `no decision recorded for approval ${options.approvalId} (pass --decision approve|deny if applying manually).`,
      { code: "no_decision" }
    );
  }

  const destination = approval.destination ?? options.installDir;

  if (!destination) {
    throw new InstallUrlError("resume cannot determine install destination.", {
      code: "missing_install_dir"
    });
  }

  const generatedAt = new Date().toISOString();

  if (decision.status === "denied") {
    await removeQuarantineRun(run.path);

    return {
      schemaVersion: "clawguard.install.v1",
      command: "install-resume",
      action: "denied",
      approvalId: options.approvalId,
      decision,
      installation: { performed: false, destination, copiedAt: null, removed: true },
      quarantine: { runId: run.runId, path: null, extractedPath: null },
      generatedAt
    };
  }

  await copyExtracted(run.extractedDir, destination);
  const copiedAt = new Date().toISOString();
  await removeQuarantineRun(run.path);

  return {
    schemaVersion: "clawguard.install.v1",
    command: "install-resume",
    action: "approved",
    approvalId: options.approvalId,
    decision,
    installation: { performed: true, destination, copiedAt, removed: true },
    quarantine: { runId: run.runId, path: null, extractedPath: null },
    generatedAt
  };
}

async function findLatestDecision({ approvalOut, approvalId, explicitDecision }) {
  if (explicitDecision) {
    const normalized = String(explicitDecision).toLowerCase();

    if (normalized !== "approve" && normalized !== "deny") {
      throw new InstallUrlError("--decision must be approve or deny.", { code: "invalid_decision" });
    }

    return {
      schemaVersion: "clawguard.decision.v1",
      approvalId,
      status: normalized === "approve" ? "approved" : "denied",
      decision: normalized,
      decidedAt: new Date().toISOString(),
      source: "cli-flag"
    };
  }

  const decisionsPath = resolveDecisionsPath(approvalOut);

  if (!decisionsPath) {
    return null;
  }

  let content;

  try {
    content = await fs.readFile(decisionsPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  const lines = content.split(/\r?\n/).filter(Boolean);
  let latest = null;

  for (const line of lines) {
    let record;

    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    if (record?.approvalId === approvalId && record.schemaVersion === "clawguard.decision.v1") {
      latest = record;
    }
  }

  return latest;
}

function resolveDecisionsPath(approvalOut) {
  if (!approvalOut) {
    return null;
  }

  const resolved = path.resolve(approvalOut);

  if (resolved.endsWith(".decisions.jsonl")) {
    return resolved;
  }

  return `${resolved}.decisions.jsonl`;
}

async function copyExtracted(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await assertDestinationFree(destination);
  await fs.cp(source, destination, {
    recursive: true,
    errorOnExist: true,
    force: false
  });
}

async function assertDestinationFree(destination) {
  let stat;

  try {
    stat = await fs.lstat(destination);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }

    throw error;
  }

  if (stat) {
    throw new InstallUrlError(`destination already exists: ${destination}`, {
      code: "destination_exists"
    });
  }
}
