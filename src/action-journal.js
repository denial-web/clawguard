import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const journalSchema = "clawguard.actionJournal.v1";
const incidentSchema = "clawguard.incident.v1";

export async function recordAction(plan, options = {}) {
  const journalPath = path.resolve(options.journalPath ?? ".clawguard/actions.jsonl");
  const snapshotRoot = path.resolve(options.snapshotDir ?? path.join(path.dirname(journalPath), "snapshots"));
  const snapshot = await captureSnapshot({
    id: plan.id,
    actionType: plan.action.type,
    target: options.target ?? plan.action.target,
    snapshotRoot
  });
  const previousHash = options.hashChain ? await readLastRecordHash(journalPath) : undefined;
  const record = createJournalRecord({
    plan,
    status: options.status ?? "planned",
    snapshot,
    previousHash,
    incidentId: options.incidentId
  });

  record.hash = hashRecord(record);
  await appendJsonLine(journalPath, record);

  return {
    schemaVersion: "clawguard.actionRecordResult.v1",
    journalPath,
    record
  };
}

export async function recoverAction(options = {}) {
  const journalPath = path.resolve(options.journalPath ?? ".clawguard/actions.jsonl");
  const records = await readJournalRecords(journalPath);
  const record = records.find((candidate) => candidate.id === options.id || candidate.planId === options.id);

  if (!record) {
    throw new Error(`No action journal record found for id: ${options.id}`);
  }

  const recovery = {
    schemaVersion: "clawguard.actionRecovery.v1",
    id: randomUUID(),
    recoveredAt: new Date().toISOString(),
    actionId: record.id,
    planId: record.planId,
    journalPath,
    dryRun: Boolean(options.dryRun),
    status: "not-recoverable",
    actions: [],
    reason: undefined
  };

  if (record.recovery.recoverability !== "reversible") {
    recovery.reason = "Action is not directly reversible; create a compensating incident record instead.";
    recovery.actions.push("create-compensating-record");
    return recovery;
  }

  if (!record.snapshot?.snapshotPath || !record.snapshot?.target) {
    recovery.reason = "No pre-action snapshot was captured for this action.";
    recovery.actions.push("manual-recovery-required");
    return recovery;
  }

  const target = path.resolve(record.snapshot.target);
  const snapshotPath = path.resolve(record.snapshot.snapshotPath);
  const quarantineDir = path.resolve(options.quarantineDir ?? path.join(path.dirname(journalPath), "recovery-quarantine"));
  const quarantinePath = path.join(quarantineDir, `${path.basename(target)}.${new Date().toISOString().replace(/[:.]/g, "-")}`);

  recovery.status = "recovered";
  recovery.target = target;
  recovery.snapshotPath = snapshotPath;
  recovery.quarantinePath = quarantinePath;

  if (options.dryRun) {
    recovery.status = "would-recover";
    recovery.actions.push("would-quarantine-current-target", "would-restore-snapshot");
    return recovery;
  }

  if (await exists(target)) {
    await fs.mkdir(quarantineDir, { recursive: true });
    await fs.rename(target, quarantinePath);
    recovery.actions.push("quarantined-current-target");
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(snapshotPath, target, {
    recursive: true,
    force: false,
    errorOnExist: true,
    verbatimSymlinks: true
  });
  recovery.actions.push("restored-pre-action-snapshot");

  await appendJsonLine(journalPath, {
    schemaVersion: journalSchema,
    id: randomUUID(),
    planId: record.planId,
    createdAt: new Date().toISOString(),
    status: "recovered",
    action: record.action,
    actor: record.actor,
    recovery: record.recovery,
    recoveryEvent: recovery
  });

  return recovery;
}

export async function verifyActionJournal(options = {}) {
  const journalPath = path.resolve(options.journalPath ?? ".clawguard/actions.jsonl");
  const records = await readJournalRecords(journalPath);
  const findings = [];
  let previousHash;

  for (const record of records) {
    const expected = hashRecord({
      ...record,
      hash: undefined
    });

    if (record.hash && record.hash !== expected) {
      findings.push({
        id: "hash-mismatch",
        recordId: record.id,
        message: "Record hash does not match record contents."
      });
    }

    if (record.previousHash && previousHash && record.previousHash !== previousHash) {
      findings.push({
        id: "chain-break",
        recordId: record.id,
        message: "Record previousHash does not match the prior record hash."
      });
    }

    previousHash = record.hash ?? expected;
  }

  return {
    schemaVersion: "clawguard.actionJournalVerify.v1",
    journalPath,
    checked: records.length,
    ok: findings.length === 0,
    findings
  };
}

export async function openIncident(options = {}) {
  const incidentPath = path.resolve(options.incidentPath ?? ".clawguard/incidents.jsonl");
  const actionRecord = options.actionId
    ? await findActionRecord(options.journalPath ?? ".clawguard/actions.jsonl", options.actionId)
    : undefined;
  const incident = {
    schemaVersion: incidentSchema,
    id: options.id ?? randomUUID(),
    status: "open",
    openedAt: new Date().toISOString(),
    severity: options.severity ?? inferIncidentSeverity(actionRecord),
    title: options.title ?? "ClawGuard financial governor incident",
    reason: options.reason,
    actionId: actionRecord?.id,
    planId: actionRecord?.planId,
    requiredActions: incidentActionsFor(actionRecord),
    source: {
      journalPath: options.journalPath ? path.resolve(options.journalPath) : undefined
    }
  };

  await appendJsonLine(incidentPath, incident);

  return {
    schemaVersion: "clawguard.incidentOpenResult.v1",
    incidentPath,
    incident
  };
}

export async function closeIncident(options = {}) {
  const incidentPath = path.resolve(options.incidentPath ?? ".clawguard/incidents.jsonl");
  const closeRecord = {
    schemaVersion: incidentSchema,
    id: options.id,
    status: "closed",
    closedAt: new Date().toISOString(),
    actor: options.actor ?? "local-user",
    reason: options.reason ?? "Incident reviewed and closed."
  };

  if (!closeRecord.id) {
    throw new Error("incident close requires --id <incident-id>.");
  }

  await appendJsonLine(incidentPath, closeRecord);

  return {
    schemaVersion: "clawguard.incidentCloseResult.v1",
    incidentPath,
    incident: closeRecord
  };
}

async function captureSnapshot({ id, actionType, target, snapshotRoot }) {
  if (!["write-local", "install-skill"].includes(actionType) || !target) {
    return {
      captured: false,
      reason: "Action type does not require a local pre-action snapshot."
    };
  }

  const resolvedTarget = path.resolve(target);

  if (!await exists(resolvedTarget)) {
    return {
      captured: false,
      target: resolvedTarget,
      reason: "Target did not exist before action."
    };
  }

  const snapshotPath = path.join(snapshotRoot, id, "target");
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.cp(resolvedTarget, snapshotPath, {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true
  });

  return {
    captured: true,
    target: resolvedTarget,
    snapshotPath,
    hash: await hashPath(snapshotPath)
  };
}

function createJournalRecord({ plan, status, snapshot, previousHash, incidentId }) {
  return {
    schemaVersion: journalSchema,
    id: randomUUID(),
    planId: plan.id,
    createdAt: new Date().toISOString(),
    status,
    decision: plan.decision,
    reason: plan.reason,
    requiredActions: plan.requiredActions,
    action: plan.action,
    actor: plan.actor,
    recovery: plan.recovery,
    snapshot,
    incidentId,
    previousHash
  };
}

async function findActionRecord(journalPath, id) {
  const records = await readJournalRecords(journalPath);
  return records.find((record) => record.id === id || record.planId === id);
}

async function readJournalRecords(journalPath) {
  const content = await fs.readFile(path.resolve(journalPath), "utf8");
  const records = content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

  for (const record of records) {
    if (record.schemaVersion !== journalSchema) {
      throw new Error("Unsupported action journal schema.");
    }
  }

  return records;
}

async function readLastRecordHash(journalPath) {
  try {
    const records = await readJournalRecords(journalPath);
    const last = records.at(-1);
    return last?.hash;
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function appendJsonLine(outputPath, value) {
  const resolved = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.appendFile(resolved, `${JSON.stringify(value)}\n`);
}

function hashRecord(record) {
  const normalized = JSON.stringify(sortJson(record));
  return createHash("sha256").update(normalized).digest("hex");
}

async function hashPath(targetPath) {
  const stat = await fs.lstat(targetPath);

  if (stat.isFile()) {
    return createHash("sha256").update(await fs.readFile(targetPath)).digest("hex");
  }

  if (!stat.isDirectory()) {
    return createHash("sha256").update(`${stat.mode}:${stat.size}`).digest("hex");
  }

  const hash = createHash("sha256");
  const entries = await fs.readdir(targetPath, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const childPath = path.join(targetPath, entry.name);
    hash.update(entry.name);
    hash.update(await hashPath(childPath));
  }

  return hash.digest("hex");
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJson(entryValue)])
    );
  }

  return value;
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

function inferIncidentSeverity(actionRecord) {
  if (!actionRecord) return "medium";
  if (actionRecord.decision === "block") return "high";
  if (actionRecord.decision === "dual_approval") return "high";
  return "medium";
}

function incidentActionsFor(actionRecord) {
  const actions = ["preserve-evidence", "review-action-journal"];

  if (!actionRecord) {
    actions.push("identify-affected-action");
    return actions;
  }

  if (actionRecord.recovery?.recoverability === "reversible") {
    actions.push("run-action-recover");
  } else {
    actions.push("create-compensating-record");
  }

  if (actionRecord.decision === "block") {
    actions.push("confirm-action-did-not-execute");
  }

  return [...new Set(actions)];
}
