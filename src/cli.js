#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { loadConfig, mergeConfig, parseSize } from "./config.js";
import { policyShouldFail } from "./policy.js";
import { createHtmlReport } from "./reporters/html.js";
import { createSarifReport } from "./reporters/sarif.js";
import { scanTarget } from "./scanner.js";

const args = process.argv.slice(2);
const execFileAsync = promisify(execFile);
const failLevels = ["none", "low", "medium", "high", "critical"];
const policyPresets = ["personal", "governed", "enterprise"];
const policyFailDecisions = ["warn", "manual_review", "sandbox_required", "dual_approval", "block"];
const riskOrder = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

const commandContext = parseCommand(args);
const { command, framework, optionValues } = commandContext;

if (![
  "scan",
  "scan-workspace",
  "gate",
  "install",
  "approvals-send",
  "approvals-watch",
  "approvals-decide"
].includes(command)) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

try {
  if (command === "approvals-send") {
    const sendOptions = parseApprovalSendOptions(optionValues);
    const result = await sendApproval(sendOptions);
    if (sendOptions.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printApprovalSendResult(result);
    }
    process.exit(0);
  }

  if (command === "approvals-watch") {
    const watchOptions = parseApprovalWatchOptions(optionValues);
    const result = await watchApprovals(watchOptions, {
      onSend: watchOptions.json ? undefined : printApprovalWatchSend
    });
    if (watchOptions.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printApprovalWatchResult(result);
    }
    process.exit(0);
  }

  if (command === "approvals-decide") {
    const decisionOptions = parseApprovalDecisionOptions(optionValues);
    const result = await decideApproval(decisionOptions);
    if (decisionOptions.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printApprovalDecisionResult(result);
    }
    process.exit(0);
  }

  const cliOptions = parseOptions(optionValues);
  cliOptions.framework = framework;
  const loadedConfig = await loadConfig(cliOptions.target, cliOptions.configPath);
  const options = mergeConfig(loadedConfig.config, cliOptions);
  options.framework = framework;
  const result = await scanTarget(options.target, {
    maxFileSizeBytes: options.maxFileSizeBytes,
    maxFindingsPerRulePerFile: options.maxFindingsPerRulePerFile,
    policy: options.policy,
    suppressions: options.suppressions
  });

  result.configPath = loadedConfig.path;

  if (options.sarifPath) {
    await writeReportFile(options.sarifPath, JSON.stringify(createSarifReport(result), null, 2));
  }

  if (options.htmlPath) {
    await writeReportFile(options.htmlPath, createHtmlReport(result));
  }

  let exitCode;

  if (command === "install") {
    const install = await handleInstall(result, options);
    if (options.json) {
      console.log(JSON.stringify(createInstallResult(result, install), null, 2));
    } else {
      printInstallResult(result, install);
    }
    exitCode = installExitCode(result.policy.decision, install);
  } else if (command === "gate") {
    if (options.json) {
      console.log(JSON.stringify(createGateResult(result), null, 2));
    } else {
      printGateResult(result, options);
    }
  } else if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result, options);
  }

  process.exit(exitCode ?? (command === "gate" ? gateExitCode(result.policy.decision) : shouldFail(result, options) ? 2 : 0));
} catch (error) {
  console.error(`${commandLabel(command)} failed: ${error.message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`ClawGuard

Usage:
  clawguard scan <path> [--json] [--policy <preset>] [--fail-on <level>]
  clawguard gate <path> [--json] [--policy <preset>]
  clawguard install <path> --to <dir> [--policy <preset>] [--dry-run]
  clawguard openclaw install <path> --to <dir> [--approval-out <path>]
  clawguard hermes install <path> --to <dir> [--approval-out <path>]
  clawguard approvals send <approval.json|approvals.jsonl> --via openclaw --channel <name> --target <id>
  clawguard approvals send <approval.json|approvals.jsonl> --via telegram --chat-id <id>
  clawguard approvals watch <approvals.jsonl> --via telegram --chat-id <id>
  clawguard approvals decide <approval.json|approvals.jsonl> --id <id> --decision approve|deny
  clawguard scan-workspace <path> [--json] [--policy <preset>]
  npm run scan -- <path>

Options:
  --json                  Print machine-readable JSON.
  --config <path>         Load a specific .clawguard.json config file.
  --html <path>           Write a self-contained HTML report.
  --sarif <path>          Write SARIF 2.1.0 report for GitHub code scanning.
  --policy <preset>       Policy preset: personal, governed, enterprise.
                          Default: personal, unless configured.
  --fail-on <level>       Exit 2 at this level or higher. Levels: none, low, medium, high, critical.
                          Default: critical.
  --fail-on-policy        Exit 2 when policy decision reaches policyFailOn.
  --policy-fail-on <name> Decision threshold for --fail-on-policy.
                          Values: warn, manual_review, sandbox_required, dual_approval, block.
                          Default: manual_review.
  --max-file-size <size>  Skip individual files larger than this size. Examples: 512kb, 1mb.
                          Default: 1mb.
  --to <dir>              Install destination parent directory for install mode.
  --name <name>           Install folder/file name. Defaults to the source basename.
  --dry-run               Run install gate and show the destination without copying files.
  --approval-out <path>   Write a pending approval JSON request before copying.
                          Use .jsonl to append JSON lines for bot/daemon integrations.
  --approval-mode <mode>  Approval mode: non-allow, always. Default: non-allow.
  --via <adapter>         Approval send adapter: openclaw, telegram.
  --channel <name>        Messaging channel for approval send, such as telegram.
  --target <id>           Messaging target/chat id for approval send.
  --sender-bin <path>     Sender binary. Default for --via openclaw: openclaw.
  --sender-arg <value>    Extra argument before the generated sender command. Repeatable.
  --bot-token <token>     Telegram bot token. Default: TELEGRAM_BOT_TOKEN.
  --chat-id <id>          Telegram chat id. Alias for --target with --via telegram.
  --interval <ms>         Approval watch poll interval. Default: 2000.
  --state <path>          Approval watch sent-id state file.
  --once                  Run approval watch once and exit.
  --id <id>               Approval id for send or decide.
  --decision <value>      Approval decision: approve, deny.
  --out <path>            Decision JSONL output file.
  --actor <name>          Decision actor. Default: local-user.
  --reason <text>         Decision reason.

Gate exit codes:
  0 = allow
  1 = warn, manual review, sandbox required, or dual approval
  2 = block

Examples:
  npx @denial-web/clawguard gate ./skills/my-skill
  npx @denial-web/clawguard gate ./skills/my-skill --policy governed
  npx @denial-web/clawguard install ./skills/my-skill --to ./.agents/skills --policy governed
  npx @denial-web/clawguard openclaw install ./skills/my-skill --to ./.agents/skills --approval-out ./.clawguard/approvals.jsonl
  npx @denial-web/clawguard hermes install ./skills/my-skill --to ~/.hermes/skills --approval-out ./.clawguard/approvals.jsonl
  npx @denial-web/clawguard approvals send ./.clawguard/approvals.jsonl --via openclaw --channel telegram --target 123456789
  npx @denial-web/clawguard approvals send ./.clawguard/approvals.jsonl --via telegram --chat-id 123456789
  npx @denial-web/clawguard approvals watch ./.clawguard/approvals.jsonl --via telegram --chat-id 123456789
  npx @denial-web/clawguard approvals decide ./.clawguard/approvals.jsonl --id <id> --decision approve
  npm run scan -- examples/risky-skill
  npm run scan -- examples/metadata-mismatch-skill --policy governed --fail-on-policy
  npm run scan -- examples/metadata-mismatch-skill --html clawguard.html
  npm run scan -- examples/metadata-mismatch-skill --sarif clawguard.sarif
  node src/cli.js scan-workspace examples/openclaw-workspace
  npm run scan -- examples/risky-skill --fail-on medium
  node src/cli.js scan examples/safe-skill --json
`);
}

function printHumanResult(result, options) {
  console.log(`ClawGuard scan: ${result.target}`);
  console.log(`Risk: ${result.level.toUpperCase()} (${result.score}/100)`);
  console.log(`Policy: ${result.policy.decision} (${result.policy.preset})`);
  console.log(`Files scanned: ${result.filesScanned}`);
  console.log(`Files skipped: ${result.filesSkipped}`);
  console.log(`Fail threshold: ${options.failOn}`);
  if (options.failOnPolicy) {
    console.log(`Policy fail threshold: ${options.policyFailOn}`);
  }
  if (result.configPath) {
    console.log(`Config: ${result.configPath}`);
  }

  if (result.policy.decision !== "allow") {
    console.log(`Policy reason: ${result.policy.reason}`);
    if (result.policy.requiredActions.length > 0) {
      console.log(`Required actions: ${result.policy.requiredActions.join(", ")}`);
    }
  }

  if (result.workspace?.skills?.length > 0) {
    console.log(`Workspace skills: ${result.workspace.skills.length}`);
    if (result.workspace.duplicates.length > 0) {
      console.log(`Workspace duplicates: ${result.workspace.duplicates.length}`);
    }
  }

  if (result.clawhub?.entries?.length > 0 || result.clawhub?.origins?.length > 0) {
    console.log(`ClawHub lockfile: ${result.clawhub.lockfile ?? "none"}`);
    console.log(`ClawHub entries: ${result.clawhub.entries?.length ?? 0}`);
    console.log(`ClawHub origins: ${result.clawhub.origins?.length ?? 0}`);
  }

  if (result.dependencies?.manifests?.length > 0 || result.dependencies?.lockfiles?.length > 0) {
    console.log(`Dependency manifests: ${result.dependencies.manifests?.length ?? 0}`);
    console.log(`Dependency lockfiles: ${result.dependencies.lockfiles?.length ?? 0}`);
  }

  if (result.skippedFiles.length > 0) {
    console.log("\nSkipped files:");
    for (const skipped of result.skippedFiles) {
      const detail = skipped.detail ? ` (${skipped.detail})` : "";
      console.log(`- ${skipped.file}: ${skipped.reason}${detail}`);
    }
  }

  if (result.findings.length === 0) {
    console.log("\nNo risky patterns detected.");
    return;
  }

  if (result.suppressedFindings.length > 0) {
    console.log("\nSuppressed findings:");
    for (const finding of result.suppressedFindings) {
      console.log(`- [${finding.severity.toUpperCase()}] ${finding.title}`);
      console.log(`  ${finding.file}:${finding.line}`);
      console.log(`  Reason: ${finding.suppressionReason}`);
    }
  }

  console.log("\nFindings:");
  for (const finding of result.findings) {
    console.log(`- [${finding.severity.toUpperCase()}] ${finding.title}`);
    console.log(`  ${finding.file}:${finding.line}`);
    console.log(`  Evidence: ${finding.evidence}`);
    console.log(`  Recommendation: ${finding.recommendation}`);
  }
}

function parseCommand(values) {
  const rawCommand = values[0];

  if (rawCommand === "approvals" && values[1] === "send") {
    return {
      command: "approvals-send",
      framework: undefined,
      optionValues: values.slice(2)
    };
  }

  if (rawCommand === "approvals" && values[1] === "watch") {
    return {
      command: "approvals-watch",
      framework: undefined,
      optionValues: values.slice(2)
    };
  }

  if (rawCommand === "approvals" && values[1] === "decide") {
    return {
      command: "approvals-decide",
      framework: undefined,
      optionValues: values.slice(2)
    };
  }

  if (["openclaw", "hermes"].includes(rawCommand)) {
    const nestedCommand = values[1];

    if (!nestedCommand) {
      return {
        command: "",
        framework: rawCommand,
        optionValues: []
      };
    }

    if (!["gate", "install"].includes(nestedCommand)) {
      return {
        command: `${rawCommand} ${nestedCommand}`,
        framework: rawCommand,
        optionValues: values.slice(2)
      };
    }

    return {
      command: nestedCommand,
      framework: rawCommand,
      optionValues: values.slice(2)
    };
  }

  return {
    command: rawCommand,
    framework: undefined,
    optionValues: values.slice(1)
  };
}

async function sendApproval(options) {
  const approval = await readApprovalRequest(options.approvalPath, options.id);
  return sendApprovalRequest(approval, options);
}

async function sendApprovalRequest(approval, options) {
  const message = String(approval.message ?? "").trim();

  if (!message) {
    throw new Error("Approval request has no message field.");
  }

  if (options.via === "telegram") {
    return sendTelegramApproval(approval, message, options);
  }

  if (options.via !== "openclaw") {
    throw new Error("Only --via openclaw or --via telegram is supported right now.");
  }

  const senderBin = options.senderBin ?? "openclaw";
  const commandArgs = [
    ...options.senderArgs,
    "message",
    "send",
    "--channel",
    options.channel,
    "--target",
    options.target,
    "--message",
    message
  ];
  const result = {
    approval: {
      id: approval.id,
      status: approval.status,
      decision: approval.decision,
      risk: approval.risk,
      framework: approval.framework
    },
    via: options.via,
    channel: options.channel,
    target: options.target,
    senderBin,
    command: [senderBin, ...commandArgs],
    dryRun: options.dryRun,
    sent: false,
    stdout: "",
    stderr: ""
  };

  if (options.dryRun) {
    return result;
  }

  const output = await execFileAsync(senderBin, commandArgs, {
    maxBuffer: 1024 * 1024
  });

  result.sent = true;
  result.stdout = output.stdout;
  result.stderr = output.stderr;
  return result;
}

async function watchApprovals(options, hooks = {}) {
  const statePath = path.resolve(options.statePath ?? `${options.approvalPath}.sent.json`);
  const persistedIds = await readApprovalWatchState(statePath);
  const sessionIds = new Set();
  const result = {
    approvalPath: path.resolve(options.approvalPath),
    statePath,
    once: options.once,
    intervalMs: options.intervalMs,
    dryRun: options.dryRun,
    checked: 0,
    matched: 0,
    sent: 0,
    skipped: 0,
    deliveries: []
  };

  do {
    const approvals = await readApprovalRequestsIfPresent(options.approvalPath);
    result.checked += approvals.length;

    for (const approval of approvals) {
      if (approval.status !== "pending") {
        result.skipped += 1;
        continue;
      }

      if (!approval.id) {
        result.skipped += 1;
        continue;
      }

      if (persistedIds.has(approval.id) || sessionIds.has(approval.id)) {
        result.skipped += 1;
        continue;
      }

      result.matched += 1;
      const delivery = await sendApprovalRequest(approval, options);
      result.deliveries.push(delivery);
      sessionIds.add(approval.id);

      if (delivery.sent) {
        result.sent += 1;
        persistedIds.add(approval.id);
        await writeApprovalWatchState(statePath, persistedIds);
      }

      if (hooks.onSend) {
        hooks.onSend(delivery);
      }
    }

    if (options.once) {
      return result;
    }

    await sleep(options.intervalMs);
  } while (true);
}

async function decideApproval(options) {
  const approval = await readApprovalRequest(options.approvalPath, options.id);
  const outputPath = path.resolve(options.outPath ?? `${options.approvalPath}.decisions.jsonl`);
  const decision = createApprovalDecision(approval, options);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.appendFile(outputPath, `${JSON.stringify(decision)}\n`);

  return {
    approval: {
      id: approval.id,
      status: approval.status,
      decision: approval.decision,
      risk: approval.risk,
      framework: approval.framework
    },
    outputPath,
    decision
  };
}

function createApprovalDecision(approval, options) {
  const decision = normalizeApprovalDecision(options.decision);
  const status = decision === "approve" ? "approved" : "denied";

  return {
    schemaVersion: "clawguard.decision.v1",
    id: randomUUID(),
    approvalId: approval.id,
    status,
    decision,
    decidedAt: new Date().toISOString(),
    actor: options.actor,
    reason: options.reason,
    framework: approval.framework,
    target: approval.target,
    destination: approval.destination,
    risk: approval.risk,
    policy: approval.policy,
    source: {
      path: path.resolve(options.approvalPath),
      approvalCreatedAt: approval.createdAt
    }
  };
}

async function sendTelegramApproval(approval, message, options) {
  const botToken = options.botToken ?? process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("Telegram send requires --bot-token or TELEGRAM_BOT_TOKEN.");
  }

  const apiBase = options.telegramApiBase ?? "https://api.telegram.org";
  const endpoint = `${apiBase.replace(/\/$/, "")}/bot${botToken}/sendMessage`;
  const body = {
    chat_id: options.chatId,
    text: message,
    disable_web_page_preview: true
  };
  const result = {
    approval: {
      id: approval.id,
      status: approval.status,
      decision: approval.decision,
      risk: approval.risk,
      framework: approval.framework
    },
    via: "telegram",
    channel: "telegram",
    target: options.chatId,
    endpoint: redactTelegramToken(endpoint),
    request: body,
    dryRun: options.dryRun,
    sent: false,
    response: null
  };

  if (options.dryRun) {
    return result;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  result.response = payload;

  if (!response.ok) {
    throw new Error(`Telegram send failed with HTTP ${response.status}: ${text}`);
  }

  result.sent = true;
  return result;
}

function printApprovalSendResult(result) {
  console.log(`ClawGuard approval send: ${result.approval.id}`);
  console.log(`Via: ${result.via}`);
  console.log(`Channel: ${result.channel}`);
  console.log(`Target: ${result.target}`);
  console.log(`Decision: ${formatDecision(result.approval.decision ?? "unknown")}`);
  console.log(`Dry run: ${result.dryRun ? "yes" : "no"}`);
  console.log(`Sent: ${result.sent ? "yes" : "no"}`);

  if (result.dryRun) {
    if (result.command) {
      console.log(`Command: ${result.command.map(shellQuote).join(" ")}`);
    } else if (result.endpoint) {
      console.log(`Endpoint: ${result.endpoint}`);
    }
  }
}

function printApprovalWatchSend(result) {
  console.log(`ClawGuard approval watch sent: ${result.approval.id}`);
  console.log(`Via: ${result.via}`);
  console.log(`Target: ${result.target}`);
  console.log(`Sent: ${result.sent ? "yes" : "no"}`);
  if (result.dryRun && result.endpoint) {
    console.log(`Endpoint: ${result.endpoint}`);
  }
}

function printApprovalWatchResult(result) {
  console.log(`ClawGuard approval watch: ${result.approvalPath}`);
  console.log(`State: ${result.statePath}`);
  console.log(`Once: ${result.once ? "yes" : "no"}`);
  console.log(`Dry run: ${result.dryRun ? "yes" : "no"}`);
  console.log(`Checked: ${result.checked}`);
  console.log(`Matched pending: ${result.matched}`);
  console.log(`Sent: ${result.sent}`);
  console.log(`Skipped: ${result.skipped}`);
}

function printApprovalDecisionResult(result) {
  console.log(`ClawGuard approval decision: ${result.approval.id}`);
  console.log(`Decision: ${formatDecision(result.decision.decision)}`);
  console.log(`Status: ${result.decision.status}`);
  console.log(`Actor: ${result.decision.actor}`);
  if (result.decision.reason) {
    console.log(`Reason: ${result.decision.reason}`);
  }
  console.log(`Output: ${result.outputPath}`);
}

async function readApprovalRequest(approvalPath, id) {
  const resolvedPath = path.resolve(approvalPath);
  const approvals = await readApprovalRequests(resolvedPath);

  if (approvals.length === 0) {
    throw new Error(`No approval requests found in ${resolvedPath}`);
  }

  const approval = id
    ? approvals.find((candidate) => candidate.id === id)
    : approvals.at(-1);

  if (!approval) {
    throw new Error(`Approval request not found: ${id}`);
  }

  if (approval.schemaVersion !== "clawguard.approval.v1") {
    throw new Error("Unsupported approval request schema.");
  }

  return approval;
}

async function readApprovalRequestsIfPresent(approvalPath) {
  const resolvedPath = path.resolve(approvalPath);

  try {
    return await readApprovalRequests(resolvedPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function readApprovalRequests(resolvedPath) {
  const content = await fs.readFile(resolvedPath, "utf8");
  const approvals = resolvedPath.endsWith(".jsonl")
    ? content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [JSON.parse(content)];

  for (const approval of approvals) {
    if (approval.schemaVersion !== "clawguard.approval.v1") {
      throw new Error("Unsupported approval request schema.");
    }
  }

  return approvals;
}

async function readApprovalWatchState(statePath) {
  try {
    const content = await fs.readFile(statePath, "utf8");
    const state = JSON.parse(content);
    const ids = Array.isArray(state) ? state : state.sentIds;
    return new Set(Array.isArray(ids) ? ids : []);
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Set();
    }

    throw error;
  }
}

async function writeApprovalWatchState(statePath, sentIds) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify({
    schemaVersion: "clawguard.approval-watch-state.v1",
    updatedAt: new Date().toISOString(),
    sentIds: [...sentIds].sort()
  }, null, 2)}\n`);
}

function printGateResult(result, options) {
  const decision = result.policy.decision;
  console.log(`ClawGuard gate: ${result.target}`);
  console.log(`Decision: ${formatDecision(decision)}`);
  console.log(`Risk: ${result.level.toUpperCase()} (${result.score}/100)`);
  console.log(`Policy: ${result.policy.preset}`);
  console.log(`Exit code: ${gateExitCode(decision)}`);
  console.log(`Reason: ${result.policy.reason}`);

  if (result.configPath) {
    console.log(`Config: ${result.configPath}`);
  }

  if (result.policy.requiredActions.length > 0) {
    console.log(`Required actions: ${result.policy.requiredActions.join(", ")}`);
  }

  if (result.findings.length > 0) {
    console.log(`Findings: ${result.findings.length}`);
    const topFindings = result.findings.slice(0, 5);
    for (const finding of topFindings) {
      console.log(`- [${finding.severity.toUpperCase()}] ${finding.title}`);
      console.log(`  ${finding.file}:${finding.line}`);
    }

    if (result.findings.length > topFindings.length) {
      console.log(`- ${result.findings.length - topFindings.length} more finding(s). Run scan for full details.`);
    }
  }

  if (decision === "allow") {
    console.log("\nGate result: safe to continue under the selected policy.");
  } else if (decision === "block") {
    console.log("\nGate result: block install or trust until reviewed.");
  } else {
    console.log("\nGate result: pause before install or trust.");
  }
}

async function handleInstall(result, options) {
  const decision = result.policy.decision;
  const sourcePath = path.resolve(options.target);
  const destination = resolveInstallDestination(sourcePath, options);
  const install = {
    destination,
    dryRun: options.dryRun,
    framework: options.framework,
    installed: false,
    skipped: decision !== "allow",
    approvalRequest: null
  };

  if (shouldCreateApprovalRequest(decision, options)) {
    install.approvalRequest = await writeApprovalRequest(result, install, options);
    install.skipped = true;
    return install;
  }

  if (decision !== "allow") {
    return install;
  }

  if (!options.installDir) {
    throw new Error("install requires --to <dir>. ClawGuard will not guess an install location.");
  }

  if (options.dryRun) {
    return install;
  }

  await assertInstallableSource(sourcePath);
  await assertDestinationAvailable(destination);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(sourcePath, destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true
  });

  install.installed = true;
  install.skipped = false;
  return install;
}

function printInstallResult(result, install) {
  const decision = result.policy.decision;
  console.log(`ClawGuard install: ${result.target}`);
  if (install.framework) {
    console.log(`Framework: ${displayFramework(install.framework)}`);
  }
  console.log(`Decision: ${formatDecision(decision)}`);
  console.log(`Risk: ${result.level.toUpperCase()} (${result.score}/100)`);
  console.log(`Policy: ${result.policy.preset}`);
  console.log(`Exit code: ${installExitCode(decision, install)}`);
  console.log(`Destination: ${install.destination ?? "not selected"}`);
  console.log(`Installed: ${install.installed ? "yes" : "no"}`);

  if (install.dryRun) {
    console.log("Dry run: yes");
  }

  if (result.policy.requiredActions.length > 0) {
    console.log(`Required actions: ${result.policy.requiredActions.join(", ")}`);
  }

  if (install.approvalRequest) {
    console.log(`Approval request: ${install.approvalRequest.path}`);
    console.log(`Approval id: ${install.approvalRequest.id}`);
    console.log("\nInstall result: pending user approval before copying files.");
  } else if (decision === "allow" && install.installed) {
    console.log("\nInstall result: copied after passing the selected policy.");
  } else if (decision === "allow" && install.dryRun) {
    console.log("\nInstall result: dry run passed; no files were copied.");
  } else if (decision === "allow") {
    console.log("\nInstall result: ready to copy after passing the selected policy.");
  } else if (decision === "block") {
    console.log("\nInstall result: blocked before copying files.");
  } else {
    console.log("\nInstall result: paused before copying files.");
  }
}

function createInstallResult(result, install) {
  return {
    ...createGateResult(result),
    exitCode: installExitCode(result.policy.decision, install),
    framework: install.framework,
    destination: install.destination,
    installed: install.installed,
    dryRun: install.dryRun,
    skipped: install.skipped,
    approvalRequest: install.approvalRequest
  };
}

function createGateResult(result) {
  return {
    target: result.target,
    decision: result.policy.decision,
    exitCode: gateExitCode(result.policy.decision),
    risk: {
      level: result.level,
      score: result.score
    },
    policy: {
      preset: result.policy.preset,
      reason: result.policy.reason,
      requiredActions: result.policy.requiredActions
    },
    summary: result.summary,
    findings: result.findings.map((finding) => ({
      ruleId: finding.ruleId,
      severity: finding.severity,
      title: finding.title,
      file: finding.file,
      line: finding.line,
      recommendation: finding.recommendation
    }))
  };
}

function resolveInstallDestination(sourcePath, options) {
  if (!options.installDir) {
    return undefined;
  }

  const installName = options.installName ?? path.basename(sourcePath);
  return path.resolve(options.installDir, installName);
}

function shouldCreateApprovalRequest(decision, options) {
  if (!options.approvalOut) {
    return false;
  }

  if (options.approvalMode === "always") {
    return true;
  }

  return decision !== "allow";
}

async function writeApprovalRequest(result, install, options) {
  const request = createApprovalRequest(result, install, options);
  const outputPath = path.resolve(options.approvalOut);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (outputPath.endsWith(".jsonl")) {
    await fs.appendFile(outputPath, `${JSON.stringify(request)}\n`);
  } else {
    await fs.writeFile(outputPath, `${JSON.stringify(request, null, 2)}\n`, { flag: "wx" });
  }

  return {
    id: request.id,
    path: outputPath,
    status: request.status,
    message: request.message
  };
}

function createApprovalRequest(result, install, options) {
  const id = randomUUID();
  const decision = result.policy.decision;
  const framework = options.framework ?? "generic";
  const target = path.resolve(options.target);
  const topFindings = result.findings.slice(0, 5).map((finding) => ({
    ruleId: finding.ruleId,
    severity: finding.severity,
    title: finding.title,
    file: finding.file,
    line: finding.line,
    recommendation: finding.recommendation
  }));

  return {
    schemaVersion: "clawguard.approval.v1",
    id,
    status: "pending",
    createdAt: new Date().toISOString(),
    framework,
    target,
    destination: install.destination,
    decision,
    risk: {
      level: result.level,
      score: result.score
    },
    policy: {
      preset: result.policy.preset,
      reason: result.policy.reason,
      requiredActions: result.policy.requiredActions
    },
    install: {
      dryRun: install.dryRun,
      installed: false,
      skipped: true
    },
    summary: result.summary,
    findings: topFindings,
    message: createApprovalMessage({
      framework,
      target,
      destination: install.destination,
      decision,
      risk: result.level,
      score: result.score,
      requiredActions: result.policy.requiredActions,
      findings: topFindings
    })
  };
}

function createApprovalMessage(details) {
  const findingLines = details.findings.length === 0
    ? "No findings were reported."
    : details.findings.map((finding) => `- ${finding.severity.toUpperCase()}: ${finding.title}`).join("\n");

  return [
    `ClawGuard approval needed for ${displayFramework(details.framework)} skill install.`,
    `Decision: ${formatDecision(details.decision)}`,
    `Risk: ${details.risk.toUpperCase()} (${details.score}/100)`,
    `Source: ${details.target}`,
    `Destination: ${details.destination ?? "not selected"}`,
    `Required actions: ${details.requiredActions.length > 0 ? details.requiredActions.join(", ") : "none"}`,
    "Top findings:",
    findingLines
  ].join("\n");
}

async function assertInstallableSource(sourcePath) {
  const stats = await fs.lstat(sourcePath);

  if (stats.isSymbolicLink()) {
    throw new Error("install source cannot be a symlink");
  }

  if (stats.isDirectory()) {
    await assertDirectoryHasNoSymlinks(sourcePath);
  }
}

async function assertDirectoryHasNoSymlinks(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`install source contains a symlink: ${entryPath}`);
    }

    if (entry.isDirectory()) {
      await assertDirectoryHasNoSymlinks(entryPath);
    }
  }
}

async function assertDestinationAvailable(destination) {
  try {
    await fs.lstat(destination);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  throw new Error(`install destination already exists: ${destination}`);
}

function commandLabel(commandName) {
  if (commandName === "approvals-send") {
    return "Approval send";
  }

  if (commandName === "approvals-watch") {
    return "Approval watch";
  }

  if (commandName === "approvals-decide") {
    return "Approval decision";
  }

  if (commandName === "gate") {
    return "Gate";
  }

  if (commandName === "install") {
    return "Install";
  }

  return "Scan";
}

function displayFramework(value) {
  if (value === "openclaw") {
    return "OpenClaw";
  }

  if (value === "hermes") {
    return "Hermes Agent";
  }

  return "agent";
}

function formatDecision(decision) {
  return decision.replaceAll("_", " ").toUpperCase();
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@-]+$/.test(text)) {
    return text;
  }

  return `'${text.replaceAll("'", "'\\''")}'`;
}

function redactTelegramToken(value) {
  return String(value).replace(/\/bot[^/]+\/sendMessage$/, "/bot<redacted>/sendMessage");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeApprovalDecision(value) {
  if (value === "approved") {
    return "approve";
  }

  if (value === "denied") {
    return "deny";
  }

  return value;
}

function gateExitCode(decision) {
  if (decision === "allow") {
    return 0;
  }

  if (decision === "block") {
    return 2;
  }

  return 1;
}

function installExitCode(decision, install) {
  if (install.approvalRequest) {
    return 1;
  }

  return gateExitCode(decision);
}

function parseOptions(values) {
  const options = {
    json: false,
    configPath: undefined,
    htmlPath: undefined,
    sarifPath: undefined,
    failOn: undefined,
    failOnPolicy: undefined,
    policy: undefined,
    policyFailOn: undefined,
    maxFileSizeBytes: undefined,
    installDir: undefined,
    installName: undefined,
    dryRun: false,
    approvalOut: undefined,
    approvalMode: "non-allow",
    framework: undefined,
    target: "."
  };
  const paths = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--json") {
      options.json = true;
      continue;
    }

    if (value === "--sarif") {
      options.sarifPath = requireNextValue(values, index, "--sarif");
      index += 1;
      continue;
    }

    if (value === "--html") {
      options.htmlPath = requireNextValue(values, index, "--html");
      index += 1;
      continue;
    }

    if (value === "--") {
      continue;
    }

    if (value === "--config") {
      options.configPath = requireNextValue(values, index, "--config");
      index += 1;
      continue;
    }

    if (value === "--policy") {
      const policy = requireNextValue(values, index, "--policy");
      if (!policyPresets.includes(policy)) {
        throw new Error(`Invalid --policy value. Use one of: ${policyPresets.join(", ")}`);
      }
      options.policy = policy;
      index += 1;
      continue;
    }

    if (value === "--fail-on") {
      const level = requireNextValue(values, index, "--fail-on");
      if (!failLevels.includes(level)) {
        throw new Error(`Invalid --fail-on value. Use one of: ${failLevels.join(", ")}`);
      }
      options.failOn = level;
      index += 1;
      continue;
    }

    if (value === "--fail-on-policy") {
      options.failOnPolicy = true;
      continue;
    }

    if (value === "--policy-fail-on") {
      const decision = requireNextValue(values, index, "--policy-fail-on");
      if (!policyFailDecisions.includes(decision)) {
        throw new Error(`Invalid --policy-fail-on value. Use one of: ${policyFailDecisions.join(", ")}`);
      }
      options.policyFailOn = decision;
      index += 1;
      continue;
    }

    if (value === "--max-file-size") {
      const size = requireNextValue(values, index, "--max-file-size");
      options.maxFileSizeBytes = parseSize(size);
      index += 1;
      continue;
    }

    if (value === "--to") {
      options.installDir = requireNextValue(values, index, "--to");
      index += 1;
      continue;
    }

    if (value === "--name") {
      options.installName = requireNextValue(values, index, "--name");
      index += 1;
      continue;
    }

    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (value === "--approval-out") {
      options.approvalOut = requireNextValue(values, index, "--approval-out");
      index += 1;
      continue;
    }

    if (value === "--approval-mode") {
      const mode = requireNextValue(values, index, "--approval-mode");
      if (!["non-allow", "always"].includes(mode)) {
        throw new Error("Invalid --approval-mode value. Use one of: non-allow, always");
      }
      options.approvalMode = mode;
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }

    paths.push(value);
  }

  options.target = paths[0] ?? ".";
  return options;
}

function parseApprovalSendOptions(values) {
  const options = {
    approvalPath: undefined,
    id: undefined,
    via: "openclaw",
    channel: undefined,
    target: undefined,
    chatId: undefined,
    botToken: undefined,
    telegramApiBase: undefined,
    senderBin: undefined,
    senderArgs: [],
    dryRun: false,
    json: false
  };
  const paths = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--json") {
      options.json = true;
      continue;
    }

    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (value === "--id") {
      options.id = requireNextValue(values, index, "--id");
      index += 1;
      continue;
    }

    if (value === "--via") {
      options.via = requireNextValue(values, index, "--via");
      index += 1;
      continue;
    }

    if (value === "--channel") {
      options.channel = requireNextValue(values, index, "--channel");
      index += 1;
      continue;
    }

    if (value === "--target") {
      options.target = requireNextValue(values, index, "--target");
      index += 1;
      continue;
    }

    if (value === "--chat-id") {
      options.chatId = requireNextValue(values, index, "--chat-id");
      index += 1;
      continue;
    }

    if (value === "--bot-token") {
      options.botToken = requireNextValue(values, index, "--bot-token");
      index += 1;
      continue;
    }

    if (value === "--telegram-api-base") {
      options.telegramApiBase = requireNextValue(values, index, "--telegram-api-base");
      index += 1;
      continue;
    }

    if (value === "--sender-bin") {
      options.senderBin = requireNextValue(values, index, "--sender-bin");
      index += 1;
      continue;
    }

    if (value === "--sender-arg") {
      options.senderArgs.push(requireNextValue(values, index, "--sender-arg"));
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }

    paths.push(value);
  }

  options.approvalPath = paths[0];

  if (!options.approvalPath) {
    throw new Error("approvals send requires <approval.json|approvals.jsonl>.");
  }

  if (!["openclaw", "telegram"].includes(options.via)) {
    throw new Error("Invalid --via value. Use one of: openclaw, telegram");
  }

  if (options.via === "openclaw" && !options.channel) {
    throw new Error("approvals send requires --channel <name>.");
  }

  if (options.via === "openclaw" && !options.target) {
    throw new Error("approvals send requires --target <id>.");
  }

  if (options.via === "telegram") {
    options.chatId = options.chatId ?? options.target;
    if (!options.chatId) {
      throw new Error("approvals send --via telegram requires --chat-id <id>.");
    }
    options.channel = "telegram";
    options.target = options.chatId;
  }

  return options;
}

function parseApprovalWatchOptions(values) {
  const options = {
    approvalPath: undefined,
    via: "telegram",
    channel: undefined,
    target: undefined,
    chatId: undefined,
    botToken: undefined,
    telegramApiBase: undefined,
    senderBin: undefined,
    senderArgs: [],
    dryRun: false,
    json: false,
    once: false,
    intervalMs: 2000,
    statePath: undefined
  };
  const paths = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--json") {
      options.json = true;
      continue;
    }

    if (value === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (value === "--once") {
      options.once = true;
      continue;
    }

    if (value === "--interval") {
      const interval = Number.parseInt(requireNextValue(values, index, "--interval"), 10);
      if (!Number.isSafeInteger(interval) || interval < 250) {
        throw new Error("--interval must be an integer of at least 250 milliseconds.");
      }
      options.intervalMs = interval;
      index += 1;
      continue;
    }

    if (value === "--state") {
      options.statePath = requireNextValue(values, index, "--state");
      index += 1;
      continue;
    }

    if (value === "--via") {
      options.via = requireNextValue(values, index, "--via");
      index += 1;
      continue;
    }

    if (value === "--channel") {
      options.channel = requireNextValue(values, index, "--channel");
      index += 1;
      continue;
    }

    if (value === "--target") {
      options.target = requireNextValue(values, index, "--target");
      index += 1;
      continue;
    }

    if (value === "--chat-id") {
      options.chatId = requireNextValue(values, index, "--chat-id");
      index += 1;
      continue;
    }

    if (value === "--bot-token") {
      options.botToken = requireNextValue(values, index, "--bot-token");
      index += 1;
      continue;
    }

    if (value === "--telegram-api-base") {
      options.telegramApiBase = requireNextValue(values, index, "--telegram-api-base");
      index += 1;
      continue;
    }

    if (value === "--sender-bin") {
      options.senderBin = requireNextValue(values, index, "--sender-bin");
      index += 1;
      continue;
    }

    if (value === "--sender-arg") {
      options.senderArgs.push(requireNextValue(values, index, "--sender-arg"));
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }

    paths.push(value);
  }

  options.approvalPath = paths[0];

  if (!options.approvalPath) {
    throw new Error("approvals watch requires <approval.jsonl>.");
  }

  if (!["openclaw", "telegram"].includes(options.via)) {
    throw new Error("Invalid --via value. Use one of: openclaw, telegram");
  }

  if (options.via === "openclaw" && !options.channel) {
    throw new Error("approvals watch --via openclaw requires --channel <name>.");
  }

  if (options.via === "openclaw" && !options.target) {
    throw new Error("approvals watch --via openclaw requires --target <id>.");
  }

  if (options.via === "telegram") {
    options.chatId = options.chatId ?? options.target;
    if (!options.chatId) {
      throw new Error("approvals watch --via telegram requires --chat-id <id>.");
    }
    options.channel = "telegram";
    options.target = options.chatId;
  }

  return options;
}

function parseApprovalDecisionOptions(values) {
  const options = {
    approvalPath: undefined,
    id: undefined,
    decision: undefined,
    outPath: undefined,
    actor: "local-user",
    reason: undefined,
    json: false
  };
  const paths = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--json") {
      options.json = true;
      continue;
    }

    if (value === "--id") {
      options.id = requireNextValue(values, index, "--id");
      index += 1;
      continue;
    }

    if (value === "--decision") {
      options.decision = requireNextValue(values, index, "--decision");
      index += 1;
      continue;
    }

    if (value === "--out") {
      options.outPath = requireNextValue(values, index, "--out");
      index += 1;
      continue;
    }

    if (value === "--actor") {
      options.actor = requireNextValue(values, index, "--actor");
      index += 1;
      continue;
    }

    if (value === "--reason") {
      options.reason = requireNextValue(values, index, "--reason");
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }

    paths.push(value);
  }

  options.approvalPath = paths[0];

  if (!options.approvalPath) {
    throw new Error("approvals decide requires <approval.json|approvals.jsonl>.");
  }

  if (!options.id) {
    throw new Error("approvals decide requires --id <id>.");
  }

  if (!options.decision) {
    throw new Error("approvals decide requires --decision approve|deny.");
  }

  options.decision = normalizeApprovalDecision(options.decision);

  if (!["approve", "deny"].includes(options.decision)) {
    throw new Error("Invalid --decision value. Use one of: approve, deny");
  }

  return options;
}

async function writeReportFile(outputPath, content) {
  const resolvedPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, `${content}\n`);
}

function requireNextValue(values, index, optionName) {
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function shouldFail(result, options) {
  if (options.failOn !== "none" && riskOrder[result.level] >= riskOrder[options.failOn]) {
    return true;
  }

  if (!options.failOnPolicy) {
    return false;
  }

  return policyShouldFail(result.policy, options.policyFailOn);
}
