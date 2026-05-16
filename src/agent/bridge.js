import net from "node:net";
import { appendAgentApprovalRequest, createAgentApprovalRequest, readLatestDecision } from "./approvals.js";
import { appendAuditEvent } from "./audit.js";
import { ensureAgentState, resolveAgentPaths } from "./paths.js";
import { readAgentActionProposal } from "./proposals.js";
import { loadConfig } from "../config.js";

export function getAgentBridgeSpec() {
  return {
    schemaVersion: "clawguard.agentBridgeSpec.v2",
    purpose: "External browser/app executors can propose one action at a time; ClawGuard validates, approval-gates, audits, and may execute read-only browser actions in an isolated adapter.",
    flow: [
      "bridge creates agent-action proposal JSON",
      "clawguard agent proposal validate <proposal.json>",
      "clawguard agent proposal explain <proposal.json>",
      "clawguard agent proposal run <proposal.json>",
      "clawguard agent bridge execute <proposal.json> for supported read-only browser actions",
      "external bridges execute only approved action ids",
      "bridge returns execution result for audit when execution happens outside ClawGuard"
    ],
    proposalTools: [
      "browser.open",
      "browser.extract",
      "browser.click_proposed",
      "browser.type_proposed",
      "app.open_proposed",
      "app.action_proposed"
    ],
    hardBoundaries: [
      "No blanket bridge permission.",
      "No password, token, seed phrase, payment, or credential entry.",
      "No payment, purchase, transfer, destructive, submit, send, or delete action without high-risk approval.",
      "No localhost or private URL access unless explicitly high-risk allowed.",
      "No hidden or ambiguous selectors.",
      "ClawGuard executes only browser.open and browser.extract in an isolated read-only adapter.",
      "Click, type, submit, download, upload, payment, and desktop app actions remain proposal-only."
    ],
    executionContract: {
      approvedActionIdRequired: true,
      oneActionPerApproval: true,
      supportedInternalExecutionTools: ["browser.open", "browser.extract"],
      bridgeMustReturn: {
        actionId: "string",
        ok: "boolean",
        status: "completed|blocked|error",
        summary: "string",
        artifacts: "array"
      }
    }
  };
}

export async function executeAgentBridgeProposal(options = {}) {
  const workspace = options.workspace ?? ".";
  const loadedConfig = await loadConfig(workspace, options.configPath);
  const config = loadedConfig.config;
  const paths = resolveAgentPaths(workspace, config.agent, {
    configPath: loadedConfig.path,
    approvalPath: options.approvalPath,
    decisionsPath: options.decisionsPath
  });
  await ensureAgentState(paths);

  const proposal = await readAgentActionProposal(options.proposalPath);
  const bridgeConfig = config.agent.integrations?.browserBridge ?? {};

  if (!bridgeConfig.enabled) {
    return auditBridgeResult(paths.auditPath, {
      status: "blocked",
      ok: false,
      proposal,
      error: "Browser bridge execution is disabled. Set agent.integrations.browserBridge.enabled to true.",
      output: null,
      artifacts: []
    });
  }

  if (!["browser.open", "browser.extract"].includes(proposal.tool)) {
    return auditBridgeResult(paths.auditPath, {
      status: "blocked",
      ok: false,
      proposal,
      error: `${proposal.tool} is proposal-only. ClawGuard bridge execute supports only browser.open and browser.extract.`,
      output: null,
      artifacts: []
    });
  }

  const targetUrl = new URL(proposal.args.url);
  const privateTarget = isBlockedHost(targetUrl.hostname);
  if (privateTarget && !bridgeConfig.allowPrivateUrls) {
    return auditBridgeResult(paths.auditPath, {
      status: "blocked",
      ok: false,
      proposal,
      error: "Browser bridge execution blocks private URLs unless agent.integrations.browserBridge.allowPrivateUrls is true.",
      output: null,
      artifacts: []
    });
  }

  const allowedDomainError = validateAllowedDomain(targetUrl, bridgeConfig.allowedDomains ?? []);
  if (allowedDomainError) {
    return auditBridgeResult(paths.auditPath, {
      status: "blocked",
      ok: false,
      proposal,
      error: allowedDomainError,
      output: null,
      artifacts: []
    });
  }

  const approval = await ensureBridgeApproval(proposal, {
    paths,
    approvalId: options.approvalId,
    requiresApproval: privateTarget || ["high", "critical"].includes(proposal.risk)
  });
  if (!approval.approved) {
    return auditBridgeResult(paths.auditPath, {
      ...approval.result,
      proposal
    });
  }

  try {
    const driver = String(options.driver ?? bridgeConfig.driver ?? "fetch").toLowerCase();
    const output = driver === "playwright"
      ? await executeWithPlaywright(proposal, options)
      : await executeWithFetch(proposal, options);
    return auditBridgeResult(paths.auditPath, {
      status: "completed",
      ok: true,
      proposal,
      output: {
        ...output,
        mode: "sandboxed_bridge",
        driver,
        actionId: proposal.id
      },
      error: null,
      artifacts: output.artifacts ?? []
    });
  } catch (error) {
    return auditBridgeResult(paths.auditPath, {
      status: "error",
      ok: false,
      proposal,
      output: null,
      error: error.message,
      artifacts: []
    });
  }
}

async function ensureBridgeApproval(proposal, context) {
  if (!context.requiresApproval) {
    return { approved: true };
  }

  if (context.approvalId) {
    const decision = await readLatestDecision(context.paths.decisionsPath, context.approvalId);
    if (!decision) {
      return {
        approved: false,
        result: {
          ok: false,
          status: "pending_approval",
          output: null,
          error: `No decision recorded for approval ${context.approvalId}.`,
          approvalRequest: {
            id: context.approvalId,
            path: context.paths.approvalPath,
            status: "pending"
          },
          artifacts: []
        }
      };
    }

    if (decision.decision !== "approve") {
      return {
        approved: false,
        result: {
          ok: false,
          status: "blocked",
          output: null,
          error: decision.reason ?? `Approval ${context.approvalId} was denied.`,
          approvalDecision: decision,
          artifacts: []
        }
      };
    }

    return { approved: true, decision };
  }

  const request = createAgentApprovalRequest({
    tool: proposal.tool,
    args: proposal.args,
    target: proposal.args.url,
    destination: "sandboxed-browser-bridge",
    risk: proposal.risk,
    reason: proposal.reason,
    requiredActions: ["review-url", "approve-sandboxed-browser-bridge"],
    artifacts: [{
      type: "bridge-execution-proposal",
      actionId: proposal.id,
      tool: proposal.tool,
      url: proposal.args.url
    }]
  });
  const approvalRequest = await appendAgentApprovalRequest(context.paths.approvalPath, request);
  return {
    approved: false,
    result: {
      ok: false,
      status: "pending_approval",
      output: { message: "Approval required before sandboxed browser bridge execution." },
      error: null,
      approvalRequest,
      artifacts: []
    }
  };
}

async function executeWithFetch(proposal, options) {
  if (proposal.tool === "browser.open") {
    const response = await fetch(proposal.args.url, { redirect: "follow" });
    const text = await limitedText(response, options.maxBytes ?? 65536);
    assertOkResponse(response, text.content);
    return {
      url: response.url,
      statusCode: response.status,
      title: extractTitle(text.content),
      textPreview: htmlToText(text.content).slice(0, 2000),
      truncated: text.truncated,
      artifacts: []
    };
  }

  if (proposal.tool === "browser.extract") {
    if (proposal.args.selector && !["title", "body"].includes(String(proposal.args.selector).toLowerCase())) {
      throw new Error("fetch bridge driver supports browser.extract selectors only for title or body. Use --driver playwright for CSS selectors.");
    }
    const response = await fetch(proposal.args.url, { redirect: "follow" });
    const text = await limitedText(response, options.maxBytes ?? 65536);
    assertOkResponse(response, text.content);
    const selector = String(proposal.args.selector ?? "body").toLowerCase();
    return {
      url: response.url,
      statusCode: response.status,
      selector,
      title: extractTitle(text.content),
      text: selector === "title" ? extractTitle(text.content) : htmlToText(text.content).slice(0, options.maxExtractChars ?? 8000),
      truncated: text.truncated,
      artifacts: []
    };
  }

  throw new Error(`Unsupported fetch bridge tool: ${proposal.tool}`);
}

async function executeWithPlaywright(proposal, options) {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error("Playwright driver is unavailable. Install project dependencies or use --driver fetch.");
  }

  const browser = await playwright.chromium.launch({
    headless: true,
    timeout: options.timeoutMs ?? 15000
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      javaScriptEnabled: options.javaScript !== false
    });
    const page = await context.newPage();
    await page.goto(proposal.args.url, {
      waitUntil: "domcontentloaded",
      timeout: options.timeoutMs ?? 15000
    });
    const title = await page.title();
    const currentUrl = page.url();

    if (proposal.tool === "browser.open") {
      return {
        url: currentUrl,
        title,
        textPreview: (await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")).slice(0, 2000),
        artifacts: []
      };
    }

    const selector = proposal.args.selector ?? "body";
    const text = selector === "title"
      ? title
      : await page.locator(selector).first().innerText({ timeout: options.timeoutMs ?? 15000 });
    return {
      url: currentUrl,
      title,
      selector,
      text: text.slice(0, options.maxExtractChars ?? 8000),
      truncated: text.length > (options.maxExtractChars ?? 8000),
      artifacts: []
    };
  } finally {
    await browser.close();
  }
}

async function auditBridgeResult(auditPath, result) {
  const audit = await appendAuditEvent(auditPath, "bridge.execution", {
    ok: result.ok,
    status: result.status,
    proposal: {
      id: result.proposal?.id,
      tool: result.proposal?.tool,
      risk: result.proposal?.risk,
      source: result.proposal?.source
    },
    error: result.error ?? null,
    artifacts: result.artifacts ?? []
  });

  return {
    schemaVersion: "clawguard.agentBridgeExecution.v1",
    ok: result.ok,
    status: result.status,
    proposal: result.proposal,
    output: result.output,
    error: result.error,
    approvalRequest: result.approvalRequest,
    approvalDecision: result.approvalDecision,
    artifacts: result.artifacts ?? [],
    auditId: audit.id
  };
}

function validateAllowedDomain(url, allowedDomains) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const allowed = allowedDomains.some((domain) => {
    const value = String(domain).toLowerCase();
    return host === value || host.endsWith(`.${value}`);
  });
  return allowed ? null : `Browser bridge execution blocks ${host}; it is not in agent.integrations.browserBridge.allowedDomains.`;
}

function isBlockedHost(hostname) {
  const host = String(hostname ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }

  const version = net.isIP(host);
  if (version === 4) {
    const parts = host.split(".").map((part) => Number(part));
    return parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0;
  }

  if (version === 6) {
    return host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:");
  }

  return false;
}

async function limitedText(response, maxBytes) {
  const text = await response.text();
  const buffer = Buffer.from(text);
  if (buffer.length <= maxBytes) {
    return { content: text, truncated: false };
  }
  return {
    content: buffer.subarray(0, maxBytes).toString("utf8"),
    truncated: true
  };
}

function assertOkResponse(response, text) {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${String(text).slice(0, 300)}`);
  }
}

function extractTitle(html) {
  return decodeHtml(String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
}

function htmlToText(html) {
  return decodeHtml(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}
