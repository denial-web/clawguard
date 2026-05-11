import { promises as fs } from "node:fs";
import path from "node:path";

const approvalSchema = "clawguard.approval.v1";
const decisionSchema = "clawguard.decision.v1";

export async function runMonitor(options) {
  const targetDir = path.resolve(options.targetDir);
  const approvalsPath = path.resolve(options.approvalsPath);
  const decisionsPath = path.resolve(options.decisionsPath ?? path.join(path.dirname(approvalsPath), "decisions.jsonl"));
  const quarantineDir = options.quarantineDir ? path.resolve(options.quarantineDir) : undefined;
  const auditLogPath = options.auditLogPath ? path.resolve(options.auditLogPath) : undefined;

  if (quarantineDir && isInsideOrSame(targetDir, quarantineDir)) {
    throw new Error("--quarantine must be outside the monitored trusted skill directory.");
  }

  const approvals = await readApprovalRequestsIfPresent(approvalsPath);
  const decisions = await readApprovalDecisionsIfPresent(decisionsPath);
  const approvalState = buildApprovalState(approvals, decisions);
  const entries = await readTrustedEntries(targetDir);
  const result = {
    ok: true,
    schemaVersion: "clawguard.monitor.v1",
    checkedAt: new Date().toISOString(),
    targetDir,
    approvalsPath,
    decisionsPath,
    quarantineDir,
    auditLogPath,
    dryRun: options.dryRun,
    summary: {
      checked: entries.length,
      approved: 0,
      unapproved: 0,
      quarantined: 0
    },
    entries: []
  };

  for (const entry of entries) {
    const state = approvalState.byDestination.get(entry.path);
    const status = createEntryStatus(entry, state);

    if (status.approved) {
      result.summary.approved += 1;
      result.entries.push(status);
      continue;
    }

    result.ok = false;
    result.summary.unapproved += 1;

    if (quarantineDir) {
      const quarantinePath = await uniqueQuarantinePath(quarantineDir, entry.name);
      status.quarantinePath = quarantinePath;
      status.action = options.dryRun ? "would-quarantine" : "quarantined";

      if (!options.dryRun) {
        await fs.mkdir(quarantineDir, { recursive: true });
        await fs.rename(entry.path, quarantinePath);
        result.summary.quarantined += 1;
      }
    }

    result.entries.push(status);
  }

  if (auditLogPath) {
    await appendAuditLog(auditLogPath, result);
  }

  return result;
}

async function readTrustedEntries(targetDir) {
  const entries = await fs.readdir(targetDir, { withFileTypes: true });
  const output = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.resolve(targetDir, entry.name);
    output.push({
      name: entry.name,
      path: entryPath,
      type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : entry.isSymbolicLink() ? "symlink" : "other"
    });
  }

  return output.sort((left, right) => left.name.localeCompare(right.name));
}

function buildApprovalState(approvals, decisions) {
  const decisionsByApproval = new Map();
  const byDestination = new Map();

  for (const decision of decisions) {
    decisionsByApproval.set(decision.approvalId, decision);
  }

  for (const approval of approvals) {
    if (!approval.destination) {
      continue;
    }

    const decision = decisionsByApproval.get(approval.id);
    const approved = approval.status === "approved" || decision?.decision === "approve";
    const denied = approval.status === "denied" || decision?.decision === "deny";
    byDestination.set(path.resolve(approval.destination), {
      approval,
      decision,
      approved,
      denied
    });
  }

  return {
    byDestination
  };
}

function createEntryStatus(entry, state) {
  if (!state) {
    return {
      ...entry,
      approved: false,
      reason: "no-approval-record",
      action: "flagged"
    };
  }

  if (state.approved) {
    return {
      ...entry,
      approved: true,
      approvalId: state.approval.id,
      decisionId: state.decision?.id,
      reason: "approved-decision",
      action: "allow"
    };
  }

  return {
    ...entry,
    approved: false,
    approvalId: state.approval.id,
    decisionId: state.decision?.id,
    reason: state.denied ? "denied-decision" : "pending-approval",
    action: "flagged"
  };
}

async function readApprovalRequestsIfPresent(approvalPath) {
  try {
    return await readJsonRecords(approvalPath, approvalSchema, "approval request");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readApprovalDecisionsIfPresent(decisionsPath) {
  try {
    return await readJsonRecords(decisionsPath, decisionSchema, "approval decision");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readJsonRecords(recordPath, schemaVersion, label) {
  const resolvedPath = path.resolve(recordPath);
  const content = await fs.readFile(resolvedPath, "utf8");
  const records = resolvedPath.endsWith(".jsonl")
    ? content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [JSON.parse(content)];

  for (const record of records) {
    if (record.schemaVersion !== schemaVersion) {
      throw new Error(`Unsupported ${label} schema in ${resolvedPath}.`);
    }
  }

  return records;
}

async function uniqueQuarantinePath(quarantineDir, entryName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basename = `${entryName}.${timestamp}`;
  let candidate = path.join(quarantineDir, basename);
  let suffix = 1;

  while (await exists(candidate)) {
    candidate = path.join(quarantineDir, `${basename}.${suffix}`);
    suffix += 1;
  }

  return candidate;
}

async function exists(candidatePath) {
  try {
    await fs.lstat(candidatePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function appendAuditLog(auditLogPath, result) {
  await fs.mkdir(path.dirname(auditLogPath), { recursive: true });
  await fs.appendFile(auditLogPath, `${JSON.stringify(result)}\n`);
}

function isInsideOrSame(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
