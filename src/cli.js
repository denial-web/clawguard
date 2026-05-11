#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { loadConfig, mergeConfig, parseSize } from "./config.js";
import { runMonitor } from "./monitor.js";
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
  "monitor",
  "approvals-send",
  "approvals-watch",
  "approvals-decide",
  "approvals-poll-telegram",
  "approvals-apply",
  "approvals-doctor",
  "approvals-demo-flow"
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

  if (command === "approvals-poll-telegram") {
    const pollOptions = parseApprovalTelegramPollOptions(optionValues);
    const result = await pollTelegramApprovals(pollOptions);
    if (pollOptions.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printApprovalTelegramPollResult(result);
    }
    process.exit(0);
  }

  if (command === "approvals-apply") {
    const applyOptions = parseApprovalApplyOptions(optionValues);
    const result = await applyApprovalDecision(applyOptions);
    if (applyOptions.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printApprovalApplyResult(result);
    }
    process.exit(approvalApplyExitCode(result));
  }

  if (command === "approvals-doctor") {
    const doctorOptions = parseApprovalDoctorOptions(optionValues);
    const result = await runApprovalDoctor(doctorOptions);
    if (doctorOptions.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printApprovalDoctorResult(result);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "approvals-demo-flow") {
    const demoOptions = parseApprovalDemoFlowOptions(optionValues);
    const result = await runApprovalDemoFlow(demoOptions);
    if (demoOptions.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printApprovalDemoFlowResult(result);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "monitor") {
    const monitorOptions = parseMonitorOptions(optionValues);
    const result = await runMonitor(monitorOptions);
    if (monitorOptions.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printMonitorResult(result);
    }
    process.exit(result.ok ? 0 : 1);
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
  clawguard monitor <trusted-dir> --approvals <approvals.jsonl> [--decisions <decisions.jsonl>]
  clawguard openclaw install <path> --to <dir> [--approval-out <path>]
  clawguard hermes install <path> --to <dir> [--approval-out <path>]
  clawguard approvals send <approval.json|approvals.jsonl> --via openclaw --channel <name> --target <id>
  clawguard approvals send <approval.json|approvals.jsonl> --via telegram --chat-id <id>
  clawguard approvals watch <approvals.jsonl> --via telegram --chat-id <id>
  clawguard approvals decide <approval.json|approvals.jsonl> --id <id> --decision approve|deny
  clawguard approvals poll-telegram <approvals.jsonl> --decisions <decisions.jsonl>
  clawguard approvals apply <approvals.jsonl> --id <id> --decisions <decisions.jsonl>
  clawguard approvals doctor [--chat-id <id>]
  clawguard approvals demo-flow [--keep]
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
                          In monitor mode, report quarantine actions without moving files.
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
  --decisions <path>      Decision JSONL output file for reply polling.
  --actor <name>          Decision actor. Default: local-user.
  --reason <text>         Decision reason.
  --offset-state <path>   Telegram update offset state file.
  --telegram-updates-file <path>
                          Read Telegram updates from a JSON file for tests or offline replay.
  --approvals <path>      Approval JSON or JSONL queue for monitor mode.
  --quarantine <dir>      Move unapproved monitor entries into this directory.
  --audit-log <path>      Append monitor results as JSONL for audit history.
  --check-telegram        In approvals doctor, call Telegram getMe to verify the bot token.
  --framework <name>      In approvals doctor, show openclaw or hermes commands. Default: openclaw.
                          In approvals demo-flow, label the demo as openclaw or hermes.
  --keep                  In approvals demo-flow, keep the temporary demo workspace.

Gate exit codes:
  0 = allow
  1 = warn, manual review, sandbox required, or dual approval
  2 = block

Examples:
  npx @denial-web/clawguard gate ./skills/my-skill
  npx @denial-web/clawguard gate ./skills/my-skill --policy governed
  npx @denial-web/clawguard install ./skills/my-skill --to ./.agents/skills --policy governed
  npx @denial-web/clawguard monitor ./.agents/skills --approvals ./.clawguard/approvals.jsonl --decisions ./.clawguard/decisions.jsonl
  npx @denial-web/clawguard openclaw install ./skills/my-skill --to ./.agents/skills --approval-out ./.clawguard/approvals.jsonl
  npx @denial-web/clawguard hermes install ./skills/my-skill --to ~/.hermes/skills --approval-out ./.clawguard/approvals.jsonl
  npx @denial-web/clawguard approvals send ./.clawguard/approvals.jsonl --via openclaw --channel telegram --target 123456789
  npx @denial-web/clawguard approvals send ./.clawguard/approvals.jsonl --via telegram --chat-id 123456789
  npx @denial-web/clawguard approvals watch ./.clawguard/approvals.jsonl --via telegram --chat-id 123456789
  npx @denial-web/clawguard approvals decide ./.clawguard/approvals.jsonl --id <id> --decision approve
  npx @denial-web/clawguard approvals poll-telegram ./.clawguard/approvals.jsonl --decisions ./.clawguard/decisions.jsonl
  npx @denial-web/clawguard approvals apply ./.clawguard/approvals.jsonl --id <id> --decisions ./.clawguard/decisions.jsonl
  npx @denial-web/clawguard approvals doctor --chat-id 123456789
  npx @denial-web/clawguard approvals demo-flow --keep
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

  if (rawCommand === "monitor") {
    return {
      command: "monitor",
      framework: undefined,
      optionValues: values.slice(1)
    };
  }

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

  if (rawCommand === "approvals" && values[1] === "poll-telegram") {
    return {
      command: "approvals-poll-telegram",
      framework: undefined,
      optionValues: values.slice(2)
    };
  }

  if (rawCommand === "approvals" && values[1] === "apply") {
    return {
      command: "approvals-apply",
      framework: undefined,
      optionValues: values.slice(2)
    };
  }

  if (rawCommand === "approvals" && values[1] === "doctor") {
    return {
      command: "approvals-doctor",
      framework: undefined,
      optionValues: values.slice(2)
    };
  }

  if (rawCommand === "approvals" && values[1] === "demo-flow") {
    return {
      command: "approvals-demo-flow",
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

  await appendApprovalDecision(outputPath, decision);

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

async function appendApprovalDecision(outputPath, decision) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.appendFile(outputPath, `${JSON.stringify(decision)}\n`);
}

async function pollTelegramApprovals(options) {
  const offsetStatePath = path.resolve(options.offsetStatePath ?? `${options.decisionsPath}.telegram-state.json`);
  const offset = await readTelegramOffsetState(offsetStatePath);
  const updates = await fetchTelegramUpdates(options, offset);
  const outputPath = path.resolve(options.decisionsPath);
  const result = {
    approvalPath: path.resolve(options.approvalPath),
    decisionsPath: outputPath,
    offsetStatePath,
    dryRun: options.dryRun,
    checked: updates.length,
    commands: 0,
    decided: 0,
    skipped: 0,
    errors: [],
    decisions: [],
    nextOffset: offset
  };

  for (const update of updates) {
    const parsed = parseTelegramApprovalUpdate(update);

    if (!parsed) {
      result.skipped += 1;
      result.nextOffset = nextTelegramOffset(result.nextOffset, update.update_id);
      continue;
    }

    result.commands += 1;
    result.nextOffset = nextTelegramOffset(result.nextOffset, update.update_id);

    try {
      const approval = await readApprovalRequest(options.approvalPath, parsed.approvalId);
      const decision = createApprovalDecision(approval, {
        approvalPath: options.approvalPath,
        decision: parsed.decision,
        actor: parsed.actor,
        reason: parsed.reason
      });
      result.decisions.push(decision);

      if (!options.dryRun) {
        await appendApprovalDecision(outputPath, decision);
        result.decided += 1;
      }
    } catch (error) {
      result.errors.push({
        updateId: update.update_id,
        approvalId: parsed.approvalId,
        message: error.message
      });
    }
  }

  if (!options.dryRun && result.nextOffset !== offset) {
    await writeTelegramOffsetState(offsetStatePath, result.nextOffset);
  }

  return result;
}

async function applyApprovalDecision(options) {
  const approval = await readApprovalRequest(options.approvalPath, options.id);
  const decisionsPath = path.resolve(options.decisionsPath ?? `${options.approvalPath}.decisions.jsonl`);
  const decision = await readLatestApprovalDecision(decisionsPath, approval.id);
  const result = {
    approval: {
      id: approval.id,
      status: approval.status,
      decision: approval.decision,
      risk: approval.risk,
      framework: approval.framework
    },
    decision,
    decisionsPath,
    source: approval.target ? path.resolve(approval.target) : undefined,
    destination: approval.destination ? path.resolve(approval.destination) : undefined,
    dryRun: options.dryRun,
    installed: false,
    skipped: true,
    reason: undefined
  };

  if (!decision) {
    result.reason = "No decision has been recorded for this approval.";
    return result;
  }

  if (decision.decision !== "approve") {
    result.reason = decision.reason ?? "Approval was denied.";
    return result;
  }

  if (!result.source) {
    throw new Error("Approval request has no target path to install.");
  }

  if (!result.destination) {
    throw new Error("Approval request has no destination path to install.");
  }

  if (options.dryRun) {
    result.skipped = false;
    result.reason = "Dry run passed; no files were copied.";
    return result;
  }

  await assertInstallableSource(result.source);
  await assertDestinationAvailable(result.destination);
  await fs.mkdir(path.dirname(result.destination), { recursive: true });
  await fs.cp(result.source, result.destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true
  });

  result.installed = true;
  result.skipped = false;
  result.reason = "Copied after recorded approval.";
  return result;
}

async function runApprovalDoctor(options) {
  const approvalPath = path.resolve(options.approvalPath);
  const decisionsPath = path.resolve(options.decisionsPath);
  const installDir = path.resolve(options.installDir);
  const target = options.target;
  const token = options.botToken ?? process.env.TELEGRAM_BOT_TOKEN;
  const checks = [
    checkNodeVersion(),
    {
      id: "approval-path-format",
      status: approvalPath.endsWith(".jsonl") ? "pass" : "warn",
      message: approvalPath.endsWith(".jsonl")
        ? "Approval queue uses JSONL."
        : "Approval queue is not .jsonl; JSONL is recommended for watcher integrations.",
      detail: approvalPath
    },
    {
      id: "telegram-token",
      status: token ? "pass" : "warn",
      message: token
        ? "Telegram bot token is configured."
        : "Telegram bot token is not configured. Set TELEGRAM_BOT_TOKEN or pass --bot-token.",
      detail: token ? "present" : "missing"
    },
    {
      id: "telegram-chat",
      status: options.chatId ? "pass" : "warn",
      message: options.chatId
        ? "Telegram chat id is configured."
        : "Telegram chat id is missing. Pass --chat-id before running the watcher.",
      detail: options.chatId ?? "missing"
    }
  ];

  checks.push(await checkWritablePath("approval-directory-writable", path.dirname(approvalPath)));
  checks.push(await checkWritablePath("decision-directory-writable", path.dirname(decisionsPath)));
  checks.push(await checkWritablePath("install-directory-writable", installDir));

  if (options.checkTelegram) {
    checks.push(await checkTelegramBot(token, options));
  }

  const commands = createApprovalDoctorCommands({
    framework: options.framework,
    target,
    installDir,
    approvalPath,
    decisionsPath,
    chatId: options.chatId ?? "<telegram-chat-id>"
  });
  const ok = checks.every((check) => check.status !== "fail");

  return {
    ok,
    framework: options.framework,
    paths: {
      target,
      installDir,
      approvalPath,
      decisionsPath
    },
    checks,
    commands
  };
}

async function runApprovalDemoFlow(options) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-demo-flow-"));
  const candidatePath = path.join(workspace, "candidate-skill");
  const installDir = path.join(workspace, "trusted-skills");
  const approvalPath = path.join(workspace, ".clawguard", "approvals.jsonl");
  const decisionsPath = path.join(workspace, ".clawguard", "decisions.jsonl");
  const steps = [];

  await fs.mkdir(candidatePath, { recursive: true });
  await fs.writeFile(path.join(candidatePath, "SKILL.md"), [
    "# ClawGuard Demo Skill",
    "",
    "A harmless local skill used to prove the approval gate flow.",
    "",
    "It does not execute code, fetch network resources, or install dependencies.",
    ""
  ].join("\n"));
  steps.push({
    name: "create-demo-skill",
    status: "pass",
    detail: candidatePath
  });

  const scan = await scanTarget(candidatePath, {
    policy: options.policy
  });
  steps.push({
    name: "scan",
    status: "pass",
    detail: `${formatDecision(scan.policy.decision)} / ${scan.level.toUpperCase()} (${scan.score}/100)`
  });

  const install = await handleInstall(scan, {
    target: candidatePath,
    installDir,
    installName: "demo-skill",
    dryRun: false,
    approvalOut: approvalPath,
    approvalMode: "always",
    framework: options.framework
  });

  if (!install.approvalRequest) {
    throw new Error("Demo flow expected an approval request but none was created.");
  }

  steps.push({
    name: "write-approval",
    status: "pass",
    detail: install.approvalRequest.id
  });

  const approval = await readApprovalRequest(approvalPath, install.approvalRequest.id);
  const decisionResult = await decideApproval({
    approvalPath,
    id: approval.id,
    decision: "approve",
    outPath: decisionsPath,
    actor: "clawguard-demo-flow",
    reason: "Local demo approval.",
    json: false
  });
  steps.push({
    name: "record-owner-decision",
    status: "pass",
    detail: formatDecision(decisionResult.decision.decision)
  });

  const apply = await applyApprovalDecision({
    approvalPath,
    id: approval.id,
    decisionsPath,
    dryRun: false,
    json: false
  });
  steps.push({
    name: "apply-decision",
    status: apply.installed ? "pass" : "fail",
    detail: apply.reason
  });

  const installedSkillPath = path.join(install.destination, "SKILL.md");
  const installedSkill = await fs.readFile(installedSkillPath, "utf8");
  const result = {
    ok: apply.installed && installedSkill.includes("ClawGuard Demo Skill"),
    cleanedUp: false,
    kept: options.keep,
    framework: options.framework,
    policy: options.policy,
    workspace,
    paths: {
      candidate: candidatePath,
      installDir,
      destination: install.destination,
      installedSkill: installedSkillPath,
      approvalPath,
      decisionsPath
    },
    scan: {
      decision: scan.policy.decision,
      risk: {
        level: scan.level,
        score: scan.score
      },
      findings: scan.findings.length
    },
    approval: {
      id: approval.id,
      status: approval.status,
      decision: approval.decision
    },
    decision: {
      id: decisionResult.decision.id,
      decision: decisionResult.decision.decision,
      status: decisionResult.decision.status,
      actor: decisionResult.decision.actor
    },
    apply: {
      installed: apply.installed,
      skipped: apply.skipped,
      reason: apply.reason
    },
    steps
  };

  if (!options.keep) {
    try {
      await fs.rm(workspace, { recursive: true, force: true });
      result.cleanedUp = true;
      steps.push({
        name: "cleanup",
        status: "pass",
        detail: "Temporary workspace removed."
      });
    } catch (error) {
      result.ok = false;
      result.cleanupError = error.message;
      steps.push({
        name: "cleanup",
        status: "fail",
        detail: error.message
      });
    }
  }

  return result;
}

function checkNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  return {
    id: "node-version",
    status: major >= 20 ? "pass" : "fail",
    message: major >= 20
      ? `Node.js ${process.versions.node} satisfies ClawGuard's runtime requirement.`
      : `Node.js ${process.versions.node} is too old. ClawGuard requires Node.js 20 or newer.`,
    detail: process.versions.node
  };
}

async function checkWritablePath(id, directory) {
  const resolved = path.resolve(directory);
  const probePath = path.join(resolved, `.clawguard-doctor-${process.pid}.tmp`);

  try {
    await fs.mkdir(resolved, { recursive: true });
    await fs.writeFile(probePath, "ok\n", { flag: "wx" });
    await fs.unlink(probePath);
    return {
      id,
      status: "pass",
      message: "Directory is writable.",
      detail: resolved
    };
  } catch (error) {
    return {
      id,
      status: "fail",
      message: `Directory is not writable: ${error.message}`,
      detail: resolved
    };
  }
}

async function checkTelegramBot(botToken, options) {
  if (!botToken) {
    return {
      id: "telegram-api",
      status: "warn",
      message: "Skipped Telegram API check because no bot token is configured.",
      detail: "missing token"
    };
  }

  const apiBase = options.telegramApiBase ?? "https://api.telegram.org";
  const endpoint = `${apiBase.replace(/\/$/, "")}/bot${botToken}/getMe`;

  try {
    const response = await fetch(endpoint);
    const text = await response.text();
    let payload;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = undefined;
    }

    if (!response.ok || payload?.ok === false) {
      return {
        id: "telegram-api",
        status: "fail",
        message: `Telegram getMe failed with HTTP ${response.status}.`,
        detail: redactTelegramToken(endpoint)
      };
    }

    return {
      id: "telegram-api",
      status: "pass",
      message: "Telegram bot API responded successfully.",
      detail: payload?.result?.username ? `@${payload.result.username}` : redactTelegramToken(endpoint)
    };
  } catch (error) {
    return {
      id: "telegram-api",
      status: "fail",
      message: `Telegram getMe failed: ${error.message}`,
      detail: redactTelegramToken(endpoint)
    };
  }
}

function createApprovalDoctorCommands(details) {
  const installArgs = [
    "npx",
    "@denial-web/clawguard",
    details.framework,
    "install",
    details.target,
    "--to",
    details.installDir,
    "--approval-out",
    details.approvalPath
  ];
  const watchArgs = [
    "npx",
    "@denial-web/clawguard",
    "approvals",
    "watch",
    details.approvalPath,
    "--via",
    "telegram",
    "--chat-id",
    details.chatId
  ];
  const pollArgs = [
    "npx",
    "@denial-web/clawguard",
    "approvals",
    "poll-telegram",
    details.approvalPath,
    "--decisions",
    details.decisionsPath
  ];
  const applyArgs = [
    "npx",
    "@denial-web/clawguard",
    "approvals",
    "apply",
    details.approvalPath,
    "--id",
    "<approval-id>",
    "--decisions",
    details.decisionsPath
  ];

  return {
    guardedInstall: installArgs.map(shellQuote).join(" "),
    watchTelegram: `TELEGRAM_BOT_TOKEN=<token> ${watchArgs.map(shellQuote).join(" ")}`,
    pollTelegram: `TELEGRAM_BOT_TOKEN=<token> ${pollArgs.map(shellQuote).join(" ")}`,
    applyDecision: applyArgs.map(shellQuote).join(" ")
  };
}

async function readLatestApprovalDecision(decisionsPath, approvalId) {
  let decisions;

  try {
    decisions = await readApprovalDecisions(decisionsPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }

  return decisions.filter((decision) => decision.approvalId === approvalId).at(-1);
}

async function readApprovalDecisions(decisionsPath) {
  const content = await fs.readFile(decisionsPath, "utf8");
  const decisions = content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

  for (const decision of decisions) {
    if (decision.schemaVersion !== "clawguard.decision.v1") {
      throw new Error("Unsupported approval decision schema.");
    }
  }

  return decisions;
}

async function fetchTelegramUpdates(options, offset) {
  if (options.telegramUpdatesPath) {
    const content = await fs.readFile(path.resolve(options.telegramUpdatesPath), "utf8");
    const payload = JSON.parse(content);
    const updates = Array.isArray(payload) ? payload : payload.result;

    if (!Array.isArray(updates)) {
      throw new Error("Telegram updates file must be an array or an object with a result array.");
    }

    return updates.filter((update) => !offset || !Number.isSafeInteger(update.update_id) || update.update_id >= offset);
  }

  const botToken = options.botToken ?? process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("Telegram poll requires --bot-token or TELEGRAM_BOT_TOKEN.");
  }

  const apiBase = options.telegramApiBase ?? "https://api.telegram.org";
  const endpoint = new URL(`${apiBase.replace(/\/$/, "")}/bot${botToken}/getUpdates`);
  endpoint.searchParams.set("timeout", String(options.timeoutSeconds));

  if (offset) {
    endpoint.searchParams.set("offset", String(offset));
  }

  const response = await fetch(endpoint);
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Telegram poll returned invalid JSON: ${text}`);
  }

  if (!response.ok || payload?.ok === false) {
    throw new Error(`Telegram poll failed with HTTP ${response.status}: ${text}`);
  }

  if (!Array.isArray(payload?.result)) {
    throw new Error("Telegram poll response did not include a result array.");
  }

  return payload.result;
}

function parseTelegramApprovalUpdate(update) {
  const message = update.message ?? update.edited_message ?? update.channel_post;
  const text = message?.text;

  if (!text) {
    return undefined;
  }

  const match = text.trim().match(/^\/?(approve|approved|deny|denied)\s+([A-Za-z0-9_.:@-]+)(?:\s+(.+))?$/i);

  if (!match) {
    return undefined;
  }

  const decision = normalizeApprovalDecision(match[1].toLowerCase());
  const actorName = message.from?.username ?? message.from?.id ?? message.chat?.username ?? message.chat?.id ?? "telegram-user";
  const reason = match[3]?.trim();

  return {
    updateId: update.update_id,
    approvalId: match[2],
    decision,
    actor: `telegram:${actorName}`,
    reason
  };
}

function nextTelegramOffset(currentOffset, updateId) {
  if (!Number.isSafeInteger(updateId)) {
    return currentOffset;
  }

  return Math.max(currentOffset ?? 0, updateId + 1);
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

function printApprovalTelegramPollResult(result) {
  console.log(`ClawGuard Telegram approval poll: ${result.approvalPath}`);
  console.log(`Decisions: ${result.decisionsPath}`);
  console.log(`Offset state: ${result.offsetStatePath}`);
  console.log(`Dry run: ${result.dryRun ? "yes" : "no"}`);
  console.log(`Updates checked: ${result.checked}`);
  console.log(`Commands found: ${result.commands}`);
  console.log(`Decisions written: ${result.decided}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Next offset: ${result.nextOffset ?? "none"}`);

  if (result.errors.length > 0) {
    console.log("Errors:");
    for (const error of result.errors) {
      console.log(`- update ${error.updateId}: ${error.message}`);
    }
  }
}

function printApprovalApplyResult(result) {
  console.log(`ClawGuard approval apply: ${result.approval.id}`);
  console.log(`Decision: ${result.decision ? formatDecision(result.decision.decision) : "PENDING"}`);
  console.log(`Source: ${result.source ?? "not recorded"}`);
  console.log(`Destination: ${result.destination ?? "not recorded"}`);
  console.log(`Dry run: ${result.dryRun ? "yes" : "no"}`);
  console.log(`Installed: ${result.installed ? "yes" : "no"}`);
  console.log(`Exit code: ${approvalApplyExitCode(result)}`);
  console.log(`Reason: ${result.reason}`);
}

function printApprovalDoctorResult(result) {
  console.log("ClawGuard approvals doctor");
  console.log(`Framework: ${displayFramework(result.framework)}`);
  console.log(`Ready: ${result.ok ? "yes" : "no"}`);
  console.log("\nChecks:");
  for (const check of result.checks) {
    console.log(`- [${check.status.toUpperCase()}] ${check.message}`);
    if (check.detail) {
      console.log(`  ${check.detail}`);
    }
  }
  console.log("\nSuggested commands:");
  console.log(`1. ${result.commands.guardedInstall}`);
  console.log(`2. ${result.commands.watchTelegram}`);
  console.log(`3. ${result.commands.pollTelegram}`);
  console.log(`4. ${result.commands.applyDecision}`);
}

function printApprovalDemoFlowResult(result) {
  console.log("ClawGuard approvals demo-flow");
  console.log(`Framework: ${displayFramework(result.framework)}`);
  console.log(`Policy: ${result.policy}`);
  console.log(`Ready: ${result.ok ? "yes" : "no"}`);
  console.log(`Workspace: ${result.workspace}${result.cleanedUp ? " (cleaned up)" : ""}`);
  console.log(`Approval id: ${result.approval.id}`);
  console.log(`Scan: ${formatDecision(result.scan.decision)} / ${result.scan.risk.level.toUpperCase()} (${result.scan.risk.score}/100)`);
  console.log(`Decision: ${formatDecision(result.decision.decision)}`);
  console.log(`Installed: ${result.apply.installed ? "yes" : "no"}`);

  console.log("\nSteps:");
  for (const step of result.steps) {
    console.log(`- [${step.status.toUpperCase()}] ${step.name}: ${step.detail}`);
  }

  if (!result.cleanedUp) {
    console.log("\nArtifacts:");
    console.log(`Approval queue: ${result.paths.approvalPath}`);
    console.log(`Decision log: ${result.paths.decisionsPath}`);
    console.log(`Installed skill: ${result.paths.installedSkill}`);
  }
}

function printMonitorResult(result) {
  console.log(`ClawGuard monitor: ${result.targetDir}`);
  console.log(`Ready: ${result.ok ? "yes" : "no"}`);
  console.log(`Checked: ${result.summary.checked}`);
  console.log(`Approved: ${result.summary.approved}`);
  console.log(`Unapproved: ${result.summary.unapproved}`);
  console.log(`Quarantined: ${result.summary.quarantined}`);
  console.log(`Approvals: ${result.approvalsPath}`);
  console.log(`Decisions: ${result.decisionsPath}`);

  if (result.quarantineDir) {
    console.log(`Quarantine: ${result.quarantineDir}`);
  }

  if (result.auditLogPath) {
    console.log(`Audit log: ${result.auditLogPath}`);
  }

  if (result.entries.length === 0) {
    console.log("\nNo trusted skill entries found.");
    return;
  }

  console.log("\nEntries:");
  for (const entry of result.entries) {
    const status = entry.approved ? "APPROVED" : "UNAPPROVED";
    console.log(`- [${status}] ${entry.name}`);
    console.log(`  Reason: ${entry.reason}`);
    console.log(`  Action: ${entry.action}`);
    if (entry.approvalId) {
      console.log(`  Approval: ${entry.approvalId}`);
    }
    if (entry.quarantinePath) {
      console.log(`  Quarantine path: ${entry.quarantinePath}`);
    }
  }
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

async function readTelegramOffsetState(statePath) {
  try {
    const content = await fs.readFile(statePath, "utf8");
    const state = JSON.parse(content);
    return Number.isSafeInteger(state.nextOffset) ? state.nextOffset : undefined;
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function writeTelegramOffsetState(statePath, nextOffset) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify({
    schemaVersion: "clawguard.telegram-offset.v1",
    updatedAt: new Date().toISOString(),
    nextOffset
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

  if (commandName === "approvals-poll-telegram") {
    return "Telegram approval poll";
  }

  if (commandName === "approvals-apply") {
    return "Approval apply";
  }

  if (commandName === "approvals-doctor") {
    return "Approvals doctor";
  }

  if (commandName === "approvals-demo-flow") {
    return "Approvals demo flow";
  }

  if (commandName === "gate") {
    return "Gate";
  }

  if (commandName === "install") {
    return "Install";
  }

  if (commandName === "monitor") {
    return "Monitor";
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

function approvalApplyExitCode(result) {
  if (!result.decision) {
    return 1;
  }

  if (result.decision.decision !== "approve") {
    return 2;
  }

  return 0;
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

function parseMonitorOptions(values) {
  const options = {
    targetDir: undefined,
    approvalsPath: ".clawguard/approvals.jsonl",
    decisionsPath: undefined,
    quarantineDir: undefined,
    auditLogPath: undefined,
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

    if (value === "--approvals") {
      options.approvalsPath = requireNextValue(values, index, "--approvals");
      index += 1;
      continue;
    }

    if (value === "--approval-out") {
      options.approvalsPath = requireNextValue(values, index, "--approval-out");
      index += 1;
      continue;
    }

    if (value === "--decisions") {
      options.decisionsPath = requireNextValue(values, index, "--decisions");
      index += 1;
      continue;
    }

    if (value === "--quarantine") {
      options.quarantineDir = requireNextValue(values, index, "--quarantine");
      index += 1;
      continue;
    }

    if (value === "--audit-log") {
      options.auditLogPath = requireNextValue(values, index, "--audit-log");
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }

    paths.push(value);
  }

  options.targetDir = paths[0] ?? ".agents/skills";

  if (paths.length > 1) {
    throw new Error("monitor accepts only one trusted skill directory.");
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

function parseApprovalTelegramPollOptions(values) {
  const options = {
    approvalPath: undefined,
    decisionsPath: undefined,
    offsetStatePath: undefined,
    botToken: undefined,
    telegramApiBase: undefined,
    telegramUpdatesPath: undefined,
    timeoutSeconds: 0,
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

    if (value === "--decisions") {
      options.decisionsPath = requireNextValue(values, index, "--decisions");
      index += 1;
      continue;
    }

    if (value === "--out") {
      options.decisionsPath = requireNextValue(values, index, "--out");
      index += 1;
      continue;
    }

    if (value === "--offset-state") {
      options.offsetStatePath = requireNextValue(values, index, "--offset-state");
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

    if (value === "--telegram-updates-file") {
      options.telegramUpdatesPath = requireNextValue(values, index, "--telegram-updates-file");
      index += 1;
      continue;
    }

    if (value === "--timeout") {
      const timeout = Number.parseInt(requireNextValue(values, index, "--timeout"), 10);
      if (!Number.isSafeInteger(timeout) || timeout < 0) {
        throw new Error("--timeout must be a non-negative integer.");
      }
      options.timeoutSeconds = timeout;
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
    throw new Error("approvals poll-telegram requires <approval.json|approvals.jsonl>.");
  }

  if (!options.decisionsPath) {
    throw new Error("approvals poll-telegram requires --decisions <path>.");
  }

  return options;
}

function parseApprovalApplyOptions(values) {
  const options = {
    approvalPath: undefined,
    id: undefined,
    decisionsPath: undefined,
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

    if (value === "--decisions") {
      options.decisionsPath = requireNextValue(values, index, "--decisions");
      index += 1;
      continue;
    }

    if (value === "--out") {
      options.decisionsPath = requireNextValue(values, index, "--out");
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
    throw new Error("approvals apply requires <approval.json|approvals.jsonl>.");
  }

  if (!options.id) {
    throw new Error("approvals apply requires --id <id>.");
  }

  return options;
}

function parseApprovalDoctorOptions(values) {
  const options = {
    approvalPath: ".clawguard/approvals.jsonl",
    decisionsPath: ".clawguard/decisions.jsonl",
    installDir: ".agents/skills",
    target: "./candidate-skill",
    framework: "openclaw",
    chatId: undefined,
    botToken: undefined,
    telegramApiBase: undefined,
    checkTelegram: false,
    json: false
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--json") {
      options.json = true;
      continue;
    }

    if (value === "--approval-out") {
      options.approvalPath = requireNextValue(values, index, "--approval-out");
      index += 1;
      continue;
    }

    if (value === "--decisions") {
      options.decisionsPath = requireNextValue(values, index, "--decisions");
      index += 1;
      continue;
    }

    if (value === "--to") {
      options.installDir = requireNextValue(values, index, "--to");
      index += 1;
      continue;
    }

    if (value === "--target") {
      options.target = requireNextValue(values, index, "--target");
      index += 1;
      continue;
    }

    if (value === "--framework") {
      options.framework = requireNextValue(values, index, "--framework");
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

    if (value === "--check-telegram") {
      options.checkTelegram = true;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }

    throw new Error(`Unexpected argument for approvals doctor: ${value}`);
  }

  if (!["openclaw", "hermes"].includes(options.framework)) {
    throw new Error("Invalid --framework value. Use one of: openclaw, hermes");
  }

  return options;
}

function parseApprovalDemoFlowOptions(values) {
  const options = {
    framework: "openclaw",
    policy: "governed",
    keep: false,
    json: false
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--json") {
      options.json = true;
      continue;
    }

    if (value === "--keep") {
      options.keep = true;
      continue;
    }

    if (value === "--framework") {
      options.framework = requireNextValue(values, index, "--framework");
      index += 1;
      continue;
    }

    if (value === "--policy") {
      options.policy = requireNextValue(values, index, "--policy");
      index += 1;
      continue;
    }

    if (value.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }

    throw new Error(`Unexpected argument for approvals demo-flow: ${value}`);
  }

  if (!["openclaw", "hermes"].includes(options.framework)) {
    throw new Error("Invalid --framework value. Use one of: openclaw, hermes");
  }

  if (!policyPresets.includes(options.policy)) {
    throw new Error(`Invalid --policy value. Use one of: ${policyPresets.join(", ")}`);
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
