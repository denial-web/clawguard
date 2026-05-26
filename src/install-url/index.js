import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { createCheckResult, checkExitCode } from "../check.js";
import { loadConfig, mergeConfig } from "../config.js";
import { scanTarget } from "../scanner.js";
import { fetchToFile, FETCH_DEFAULTS } from "./fetch.js";
import {
  createQuarantineRun,
  removeDownloadDir,
  removeQuarantineRun,
  writeQuarantineJson
} from "./quarantine.js";
import { extractTarGz } from "./tar.js";
import { basenameFromUrl, detectSourceKind, InstallUrlError, isLikelyTarball } from "./url.js";

export const INSTALL_PAYLOAD_VERSION = "clawguard.install.v1";

export async function installFromUrl(options) {
  if (!options || typeof options !== "object") {
    throw new InstallUrlError("install requires options.", { code: "missing_options" });
  }

  const { url } = options;

  if (!url) {
    throw new InstallUrlError("install URL is required.", { code: "missing_url" });
  }

  if (!options.installDir) {
    throw new InstallUrlError("install requires --to <dir>.", { code: "missing_install_dir" });
  }

  const detection = detectSourceKind(url, { allowInsecureLoopback: Boolean(options.allowInsecureLoopback) });

  if (detection.kind !== "url") {
    throw new InstallUrlError("installFromUrl requires a URL argument.", { code: "not_a_url" });
  }

  if (!isLikelyTarball(detection.url)) {
    throw new InstallUrlError(
      `unsupported URL: only .tar.gz / .tgz archives are supported in v1.0 (got ${detection.url.pathname}).`,
      { code: "unsupported_archive" }
    );
  }

  const quarantineRoot = options.quarantineDir;
  const run = await createQuarantineRun({ root: quarantineRoot });

  try {
    const downloadFile = path.join(run.downloadDir, basenameFromUrl(detection.url));
    const fetchResult = await fetchToFile(detection.url.href, downloadFile, {
      maxBytes: options.maxBytes ?? FETCH_DEFAULTS.maxBytes,
      timeoutMs: options.timeoutMs ?? FETCH_DEFAULTS.timeoutMs,
      maxRedirects: options.maxRedirects ?? FETCH_DEFAULTS.maxRedirects,
      allowLoopback: Boolean(options.allowLoopback),
      allowInsecureLoopback: Boolean(options.allowInsecureLoopback),
      integrity: options.integrity ?? null,
      fetchImpl: options.fetchImpl
    });

    const fetchedAt = new Date().toISOString();
    const sourceRecord = {
      kind: "url",
      url: detection.url.href,
      finalUrl: fetchResult.finalUrl,
      scheme: detection.url.protocol,
      requestedIntegrity: options.integrity ?? null,
      integrityVerified: fetchResult.integrityVerified,
      sha256: fetchResult.sha256,
      sizeBytes: fetchResult.sizeBytes,
      contentType: fetchResult.contentType ?? null,
      fetchedAt,
      redirectCount: fetchResult.redirectCount
    };
    await writeQuarantineJson(run.sourcePath, sourceRecord);

    const extraction = await extractTarGz(downloadFile, run.extractedDir);
    await removeDownloadDir(run.downloadDir);

    const loadedConfig = await loadConfig(run.extractedDir, options.configPath);
    const scanOptions = mergeConfig(loadedConfig.config, {
      target: run.extractedDir,
      policy: options.policy
    });

    const scan = await scanTarget(run.extractedDir, {
      maxFileSizeBytes: scanOptions.maxFileSizeBytes,
      maxFindingsPerRulePerFile: scanOptions.maxFindingsPerRulePerFile,
      policy: scanOptions.policy,
      suppressions: scanOptions.suppressions
    });
    scan.configPath = loadedConfig.path;
    await writeQuarantineJson(run.scanReportPath, scan);

    const checkResult = createCheckResult(scan, {
      scanReportPath: run.scanReportPath
    });
    await writeQuarantineJson(run.checkPath, checkResult);

    const destination = path.resolve(options.installDir);
    const decision = checkResult.decision;

    if (decision === "block") {
      await removeQuarantineRun(run.path);
      return buildPayload({
        decision,
        source: { ...sourceRecord, runPath: null, extractedPath: null, retained: false },
        runId: run.runId,
        check: checkResult,
        installation: { performed: false, destination: null, copiedAt: null },
        approval: null,
        scanReportPath: null,
        extraction
      });
    }

    if (decision === "manual_review") {
      const approval = await writeInstallApproval({
        run,
        options,
        sourceRecord,
        checkResult,
        destination
      });
      return buildPayload({
        decision,
        source: { ...sourceRecord, runPath: run.path, extractedPath: run.extractedDir, retained: true },
        runId: run.runId,
        check: checkResult,
        installation: { performed: false, destination, copiedAt: null },
        approval,
        scanReportPath: run.scanReportPath,
        extraction
      });
    }

    await copyExtracted(run.extractedDir, destination);
    const copiedAt = new Date().toISOString();
    await removeQuarantineRun(run.path);

    return buildPayload({
      decision,
      source: { ...sourceRecord, runPath: null, extractedPath: null, retained: false },
      runId: run.runId,
      check: checkResult,
      installation: { performed: true, destination, copiedAt },
      approval: null,
      scanReportPath: null,
      extraction
    });
  } catch (error) {
    await removeQuarantineRun(run.path).catch(() => {});
    throw error;
  }
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

async function writeInstallApproval({ run, options, sourceRecord, checkResult, destination }) {
  const approvalId = `appr_${randomUUID()}`;
  const decisionsPath = options.approvalOut
    ? path.resolve(options.approvalOut)
    : path.join(path.dirname(run.root), "approvals.jsonl");
  const message = buildApprovalMessage({ sourceRecord, checkResult, destination });

  const approvalRecord = {
    schemaVersion: "clawguard.approval.v1",
    id: approvalId,
    approvalId,
    status: "pending",
    createdAt: new Date().toISOString(),
    framework: options.framework ?? "generic",
    target: sourceRecord.finalUrl ?? sourceRecord.url,
    destination,
    decision: checkResult.decision,
    risk: { level: checkResult.risk },
    policy: {
      preset: checkResult.policyPreset,
      requiredActions: checkResult.requiredActions
    },
    install: {
      kind: "url",
      runId: run.runId,
      runPath: run.path,
      extractedPath: run.extractedDir,
      installed: false,
      skipped: true
    },
    summary: checkResult.summary,
    findings: checkResult.findings,
    source: sourceRecord,
    message
  };

  await fs.mkdir(path.dirname(decisionsPath), { recursive: true });

  if (decisionsPath.endsWith(".jsonl")) {
    await fs.appendFile(decisionsPath, `${JSON.stringify(approvalRecord)}\n`);
  } else {
    await fs.writeFile(decisionsPath, `${JSON.stringify(approvalRecord, null, 2)}\n`, { flag: "wx" });
  }

  await writeQuarantineJson(run.approvalPath, approvalRecord);

  return {
    approvalId,
    path: decisionsPath,
    summary: checkResult.summary,
    runId: run.runId,
    decisionUrlScheme: null
  };
}

function buildApprovalMessage({ sourceRecord, checkResult, destination }) {
  const findingsLine = checkResult.findings.length === 0
    ? "No findings reported."
    : checkResult.findings.slice(0, 5).map((f) => `- ${f.severity.toUpperCase()}: ${f.title}`).join("\n");

  return [
    `ClawGuard install approval needed for ${sourceRecord.url}.`,
    `Destination: ${destination}`,
    `Risk: ${checkResult.risk.toUpperCase()}`,
    `Decision: ${checkResult.decision}`,
    `Summary: ${checkResult.summary}`,
    "",
    findingsLine
  ].join("\n");
}

function buildPayload({ decision, source, runId, check, installation, approval, scanReportPath, extraction }) {
  return {
    schemaVersion: INSTALL_PAYLOAD_VERSION,
    command: "install",
    source: {
      kind: source.kind,
      url: source.url,
      finalUrl: source.finalUrl,
      scheme: source.scheme,
      integrity: source.requestedIntegrity,
      integrityVerified: source.integrityVerified,
      sha256: source.sha256,
      sizeBytes: source.sizeBytes,
      contentType: source.contentType,
      fetchedAt: source.fetchedAt,
      redirectCount: source.redirectCount
    },
    quarantine: source.retained
      ? {
          runId,
          path: source.runPath,
          extractedPath: source.extractedPath,
          scanReportPath
        }
      : { runId, path: null, extractedPath: null, scanReportPath },
    extraction: {
      entries: extraction.entries,
      files: extraction.files,
      directories: extraction.directories,
      bytesWritten: extraction.bytesWritten,
      symlinksSkipped: extraction.symlinksSkipped,
      hardlinksSkipped: extraction.hardlinksSkipped
    },
    check,
    installation,
    approval,
    generatedAt: new Date().toISOString()
  };
}

export function installPayloadExitCode(payload) {
  if (!payload) {
    return 1;
  }

  return checkExitCode(payload.check?.decision ?? "manual_review");
}
