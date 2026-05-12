#!/usr/bin/env node

import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getConfigTemplate } from "./config-templates.js";
import { recommendModel } from "./model-router.js";
import { createHtmlReport } from "./reporters/html.js";
import { scanTarget } from "./scanner.js";
import { checkSopWorkflow } from "./sop/checker.js";
import { listSopPacks, loadSopPack } from "./sop/loader.js";
import { createSopWorkflowTemplate } from "./sop/template.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(rootDir, "web");
const defaultPort = 4173;

const examples = [
  {
    id: "safe-skill",
    label: "Safe Skill",
    description: "Clean baseline with no risky patterns.",
    path: "examples/safe-skill"
  },
  {
    id: "risky-skill",
    label: "Risky Skill",
    description: "Remote code and credential risk signals.",
    path: "examples/risky-skill"
  },
  {
    id: "metadata-mismatch-skill",
    label: "Metadata Mismatch",
    description: "Observed behavior differs from SKILL.md declarations.",
    path: "examples/metadata-mismatch-skill"
  },
  {
    id: "openclaw-workspace",
    label: "Workspace Override",
    description: "Duplicate OpenClaw skill names and precedence.",
    path: "examples/openclaw-workspace"
  },
  {
    id: "clawhub-workspace",
    label: "ClawHub Drift",
    description: "Lockfile, origin, source, and version drift.",
    path: "examples/clawhub-workspace"
  },
  {
    id: "dependency-risky-skill",
    label: "Dependency Risk",
    description: "Install scripts, direct sources, and loose specs.",
    path: "examples/dependency-risky-skill"
  },
  {
    id: "dependency-safe-skill",
    label: "Dependency Safe",
    description: "Pinned npm dependency with a lockfile.",
    path: "examples/dependency-safe-skill"
  },
  {
    id: "dependency-python-skill",
    label: "Python Dependencies",
    description: "Python range and direct-source dependency signals.",
    path: "examples/dependency-python-skill"
  },
  {
    id: "risky-mcp-config",
    label: "MCP Config",
    description: "Risky MCP/tool configuration.",
    path: "examples/risky-mcp-config"
  }
];

const exampleById = new Map(examples.map((example) => [example.id, example]));

export const webExamples = examples;

const sopDemos = [
  {
    id: "cafe",
    label: "Cafe Close",
    description: "Cleaning, milk storage, cash, mobile orders, and manager sign-off.",
    industry: "cafe",
    packId: "small-business/cafe/closing",
    incompletePath: "examples/sop-workflows/cafe-closing-incomplete.json",
    completePath: "examples/sop-workflows/cafe-closing-complete.json"
  },
  {
    id: "milk-tea",
    label: "Milk Tea Close",
    description: "Boba discard time, topping labels, fridge logs, cash, and sign-off.",
    industry: "milk-tea",
    packId: "small-business/milk-tea/closing",
    incompletePath: "examples/sop-workflows/milk-tea-closing-incomplete.json",
    completePath: "examples/sop-workflows/milk-tea-closing-complete.json"
  },
  {
    id: "mart",
    label: "Mart Daily Close",
    description: "Cash safe, cold case, restricted sales log, security, and shrink.",
    industry: "mart",
    packId: "small-business/mart/daily-close",
    incompletePath: "examples/sop-workflows/mart-daily-close-incomplete.json",
    completePath: "examples/sop-workflows/mart-daily-close-complete.json"
  },
  {
    id: "toy-shop",
    label: "Toy Shop Close",
    description: "Recalls, warning labels, safety complaints, packaging, and cash.",
    industry: "toy-shop",
    packId: "small-business/toy-shop/daily-close",
    incompletePath: "examples/sop-workflows/toy-shop-daily-close-incomplete.json",
    completePath: "examples/sop-workflows/toy-shop-daily-close-complete.json"
  },
  {
    id: "banking-complaints",
    label: "Complaint Triage",
    description: "Customer impact, escalation, PII redaction, and supervisor approval.",
    industry: "banking-complaints",
    packId: "financial-services/customer-complaint-triage",
    incompletePath: "examples/sop-workflows/customer-complaint-triage-incomplete.json",
    completePath: "examples/sop-workflows/customer-complaint-triage-complete.json"
  },
  {
    id: "banking-kyc",
    label: "KYC Intake",
    description: "Documents, screening, risk draft, privacy minimization, and compliance review.",
    industry: "banking-kyc",
    packId: "financial-services/kyc-document-intake",
    incompletePath: "examples/sop-workflows/kyc-document-intake-incomplete.json",
    completePath: "examples/sop-workflows/kyc-document-intake-complete.json"
  },
  {
    id: "banking-fraud",
    label: "Fraud Alert Review",
    description: "Transaction evidence, customer contact, risk rationale, escalation, and supervisor approval.",
    industry: "banking-fraud",
    packId: "financial-services/fraud-alert-review",
    incompletePath: "examples/sop-workflows/fraud-alert-review-incomplete.json",
    completePath: "examples/sop-workflows/fraud-alert-review-complete.json"
  }
];

const sopDemoById = new Map(sopDemos.map((demo) => [demo.id, demo]));

export const webSopDemos = sopDemos;

export function createWebServer(options = {}) {
  const appRoot = options.rootDir ?? rootDir;
  const appPublic = options.publicDir ?? publicDir;

  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/api/examples") {
        await sendJson(response, { examples });
        return;
      }

      if (request.method === "GET" && request.url === "/api/sop-packs") {
        await sendJson(response, await listWebSopPacks());
        return;
      }

      if (request.method === "POST" && request.url === "/api/scan") {
        const body = await readJsonBody(request);
        const result = await scanPastedSkill(body, appRoot);
        await sendJson(response, result);
        return;
      }

      if (request.method === "POST" && request.url === "/api/scan-files") {
        const body = await readJsonBody(request);
        const result = await scanUploadedFiles(body);
        await sendJson(response, result);
        return;
      }

      if (request.method === "POST" && request.url === "/api/scan-example") {
        const body = await readJsonBody(request);
        const result = await scanExampleTarget(body, appRoot);
        await sendJson(response, result);
        return;
      }

      if (request.method === "POST" && request.url === "/api/html-report") {
        const body = await readJsonBody(request);
        await sendHtml(response, createWebHtmlReport(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/run-plan") {
        const body = await readJsonBody(request);
        await sendJson(response, createWebRunPlan(body));
        return;
      }

      if (request.method === "POST" && request.url === "/api/sop-check") {
        const body = await readJsonBody(request);
        await sendJson(response, await checkWebSopDemo(body, appRoot));
        return;
      }

      if (request.method === "GET") {
        await serveStatic(request, response, appPublic);
        return;
      }

      await sendJson(response, { error: "Method not allowed" }, 405);
    } catch (error) {
      await sendJson(response, { error: error.message }, error.statusCode ?? 500);
    }
  });
}

export function startWebServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? defaultPort);
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const server = createWebServer(options);

  server.listen(port, host, () => {
    console.log(`ClawGuard web demo: http://${host}:${port}`);
  });

  return server;
}

export async function scanPastedSkill(body, appRoot = rootDir) {
  const text = String(body?.text ?? "").trimEnd();
  const policy = normalizePolicy(body?.policy);

  if (!text.trim()) {
    throw httpError("Paste SKILL.md content before scanning.", 400);
  }

  if (Buffer.byteLength(text, "utf8") > 512 * 1024) {
    throw httpError("Pasted content is too large for the demo scanner.", 413);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-paste-"));
  const filename = sanitizeFilename(body?.filename ?? "SKILL.md");
  const filePath = path.join(tempDir, filename);

  await fs.writeFile(filePath, text, "utf8");

  try {
    const scan = await scanTarget(tempDir, { policy });
    return {
      displayTarget: filename,
      source: "paste",
      scan
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function scanUploadedFiles(body) {
  const files = Array.isArray(body?.files) ? body.files : [];
  const policy = normalizePolicy(body?.policy);
  const label = String(body?.label ?? "Uploaded folder").slice(0, 120);

  if (files.length === 0) {
    throw httpError("Choose a folder with at least one readable file.", 400);
  }

  if (files.length > 200) {
    throw httpError("Folder has too many files for the demo scanner.", 413);
  }

  const totalBytes = files.reduce((sum, file) => {
    return sum + Buffer.byteLength(String(file?.text ?? ""), "utf8");
  }, 0);

  if (totalBytes > 1024 * 1024) {
    throw httpError("Folder content is too large for the demo scanner.", 413);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-upload-"));

  try {
    for (const file of files) {
      const relative = safeRelativeUploadPath(file?.path);
      const text = String(file?.text ?? "");

      if (Buffer.byteLength(text, "utf8") > 512 * 1024) {
        continue;
      }

      const destination = path.join(tempDir, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, text, "utf8");
    }

    const scan = await scanTarget(tempDir, { policy });
    return {
      displayTarget: label || "Uploaded folder",
      source: "folder",
      scan
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function scanExampleTarget(body, appRoot = rootDir) {
  const id = String(body?.example ?? "");
  const policy = normalizePolicy(body?.policy);
  const example = exampleById.get(id);

  if (!example) {
    throw httpError("Unknown example.", 404);
  }

  const target = path.resolve(appRoot, example.path);
  const examplesRoot = path.resolve(appRoot, "examples");

  if (!isInsidePath(examplesRoot, target)) {
    throw httpError("Example path is outside the examples directory.", 400);
  }

  return {
    displayTarget: example.label,
    source: "example",
    example,
    scan: await scanTarget(target, { policy })
  };
}

export async function listWebSopPacks() {
  const packs = await listSopPacks();
  const packById = new Map(packs.map((pack) => [pack.id, pack]));

  return {
    schemaVersion: "clawguard.webSopList.v1",
    demos: sopDemos.map((demo) => ({
      ...demo,
      pack: packById.get(demo.packId) ?? null
    }))
  };
}

export async function checkWebSopDemo(body, appRoot = rootDir) {
  const demoId = String(body?.demo ?? "");
  const mode = normalizeSopDemoMode(body?.mode);
  const demo = sopDemoById.get(demoId);

  if (!demo) {
    throw httpError("Unknown SOP demo.", 404);
  }

  const { pack, path: packPath } = await loadSopPack(demo.packId);
  const { workflowPath, cleanupPath } = await workflowPathForSopDemo(demo, mode, pack, appRoot);

  try {
    const check = await checkSopWorkflow(pack, workflowPath);

    return {
      schemaVersion: "clawguard.webSopCheck.v1",
      demo,
      mode,
      packPath,
      workflowPath,
      check,
      command: `npx --package @denial-web/clawguard clawguard sop check --industry ${demo.industry} ${mode === "template" ? createSopFilename(demo) : demo[`${mode}Path`]}`
    };
  } finally {
    if (cleanupPath) {
      await fs.rm(cleanupPath, { recursive: true, force: true });
    }
  }
}

export function createWebHtmlReport(body) {
  if (!body?.scan || typeof body.scan !== "object") {
    throw httpError("Scan result is required to create an HTML report.", 400);
  }

  return createHtmlReport(body.scan);
}

async function workflowPathForSopDemo(demo, mode, pack, appRoot) {
  if (mode === "template") {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clawguard-sop-template-"));
    const workflowPath = path.join(tempDir, createSopFilename(demo));
    await fs.writeFile(workflowPath, JSON.stringify(createSopWorkflowTemplate(pack), null, 2), "utf8");
    return { workflowPath, cleanupPath: tempDir };
  }

  const workflowPath = path.resolve(appRoot, demo[`${mode}Path`]);
  const examplesRoot = path.resolve(appRoot, "examples", "sop-workflows");

  if (!isInsidePath(examplesRoot, workflowPath)) {
    throw httpError("SOP workflow path is outside the examples directory.", 400);
  }

  return { workflowPath, cleanupPath: null };
}

function createSopFilename(demo) {
  return `${demo.id}-workflow.json`;
}

export function createWebRunPlan(body) {
  if (!body?.scan || typeof body.scan !== "object") {
    throw httpError("Scan result is required to create a run plan.", 400);
  }

  const profile = normalizeTemplateProfile(body?.profile);
  const template = getConfigTemplate(profile);
  const config = template.config;
  const scan = body.scan;
  const modelRecommendation = recommendModel({
    task: normalizeTask(body?.task),
    privacy: normalizePrivacy(body?.privacy),
    toolRisk: normalizeToolRisk(body?.toolRisk),
    inputTokens: normalizeNonNegativeInteger(body?.inputTokens ?? 12000, "inputTokens"),
    outputTokens: normalizeNonNegativeInteger(body?.outputTokens ?? 2000, "outputTokens"),
    budgets: config.budgets,
    models: config.models,
    modelRouting: config.modelRouting
  });
  const skill = createGateResult(scan);
  const decision = maxGovernanceDecision(skill.decision, modelRecommendation.decision);
  const requiredActions = [...new Set([
    ...(skill.policy.requiredActions ?? []),
    ...(modelRecommendation.requiredActions ?? [])
  ])];

  const plan = {
    schemaVersion: "clawguard.runPlan.v1",
    createdAt: new Date().toISOString(),
    source: normalizeText(body?.source, "web-demo").slice(0, 80),
    displayTarget: normalizeText(body?.displayTarget, skill.target ?? "Scan result").slice(0, 160),
    framework: normalizeFramework(body?.framework),
    configProfile: profile,
    configDescription: template.description,
    decision,
    exitCode: gateExitCode(decision),
    skill,
    modelRecommendation,
    requiredActions
  };

  return plan;
}

async function serveStatic(request, response, appPublic) {
  const url = new URL(request.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(appPublic, `.${safePath}`);

  if (!isInsidePath(path.resolve(appPublic), filePath)) {
    await sendJson(response, { error: "Not found" }, 404);
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw httpError("Not found", 404);
    }

    response.writeHead(200, {
      "content-type": contentTypeFor(filePath),
      "cache-control": "no-store"
    });
    response.end(await fs.readFile(filePath));
  } catch (error) {
    if (error.code === "ENOENT" || error.statusCode === 404) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    throw error;
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 700 * 1024) {
        reject(httpError("Request body is too large.", 413));
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(httpError("Request body must be valid JSON.", 400));
      }
    });
    request.on("error", reject);
  });
}

async function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function sendHtml(response, html, statusCode = 200) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(html);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function sanitizeFilename(value) {
  const filename = path.basename(String(value || "SKILL.md")).replace(/[^A-Za-z0-9_.-]/g, "-");
  return filename || "SKILL.md";
}

function safeRelativeUploadPath(value) {
  const normalized = String(value ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[^A-Za-z0-9_. -]/g, "-"))
    .join("/");

  if (!normalized) {
    throw httpError("Uploaded file has an invalid path.", 400);
  }

  return normalized;
}

function normalizePolicy(value) {
  return ["personal", "governed", "enterprise"].includes(value) ? value : "personal";
}

function normalizeTemplateProfile(value) {
  const profile = String(value ?? "local-first").trim();
  return ["local-first", "cloud-balanced", "enterprise-strict"].includes(profile) ? profile : "local-first";
}

function normalizePrivacy(value) {
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function normalizeToolRisk(value) {
  return ["none", "low", "medium", "high"].includes(value) ? value : "high";
}

function normalizeFramework(value) {
  return ["openclaw", "hermes", "picoclaw", "generic"].includes(value) ? value : "openclaw";
}

function normalizeSopDemoMode(value) {
  return ["incomplete", "complete", "template"].includes(value) ? value : "incomplete";
}

function normalizeTask(value) {
  const task = String(value ?? "").trim();
  return task || "Install and run this OpenClaw skill through a governed approval gate.";
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeNonNegativeInteger(value, name) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw httpError(`${name} must be a non-negative integer.`, 400);
  }

  return number;
}

function createGateResult(result) {
  const policy = result.policy ?? {};

  return {
    target: result.target,
    decision: policy.decision ?? "allow",
    exitCode: gateExitCode(policy.decision ?? "allow"),
    risk: {
      level: result.level ?? "info",
      score: result.score ?? 0
    },
    policy: {
      preset: policy.preset,
      reason: policy.reason,
      requiredActions: policy.requiredActions ?? []
    },
    summary: result.summary ?? {},
    findings: (result.findings ?? []).map((finding) => ({
      ruleId: finding.ruleId,
      severity: finding.severity,
      title: finding.title,
      file: finding.file,
      line: finding.line,
      recommendation: finding.recommendation
    }))
  };
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

function maxGovernanceDecision(left, right) {
  const order = {
    allow: 0,
    warn: 1,
    manual_review: 2,
    sandbox_required: 3,
    dual_approval: 4,
    block: 5
  };

  return order[right] > order[left] ? right : left;
}

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isInsidePath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = startWebServer(parseCliArgs(process.argv.slice(2)));
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port is already in use. Try: npm run web -- --port ${defaultPort + 1}`);
      process.exit(1);
    }

    throw error;
  });
}

function parseCliArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--port") {
      options.port = Number(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--host") {
      options.host = args[index + 1];
      index += 1;
      continue;
    }
  }

  return options;
}
