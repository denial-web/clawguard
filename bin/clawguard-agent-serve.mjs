#!/usr/bin/env node
/**
 * HTTP shim for Doctrine Lab eval runner (_call_nexus contract).
 * POST /api/agent/run { model, prompt, temperature, stream }
 * Returns { response: "<text or JSON string>" }
 */
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateEvalPrompt } from "../src/agent/eval-shim.js";

const port = Number.parseInt(process.env.CLAWGUARD_AGENT_SERVE_PORT ?? "9000", 10);
const host = process.env.CLAWGUARD_AGENT_SERVE_HOST ?? "127.0.0.1";
const mode = process.env.CLAWGUARD_AGENT_SERVE_MODE ?? "eval";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    json(res, 200, { ok: true, mode, service: "clawguard-agent-serve" });
    return;
  }

  if (req.method !== "POST" || !req.url?.startsWith("/api/agent/run")) {
    json(res, 404, { error: "not_found" });
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const prompt = String(payload.prompt ?? "");
      const model = String(payload.model ?? "clawguard:beta9");
      const response = mode === "live" ? await runLive(prompt, payload) : evaluateEvalPrompt(prompt, model);
      json(res, 200, { response, model });
    } catch (error) {
      json(res, 500, { error: error.message });
    }
  });
});

server.listen(port, host, () => {
  console.log(`clawguard-agent-serve listening on http://${host}:${port}/api/agent/run (mode=${mode})`);
});

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function runLive(prompt, payload) {
  const { runAgentTask } = await import(path.join(repoRoot, "src", "agent", "runtime.js"));
  const result = await runAgentTask(prompt, {
    workspace: process.env.CLAWGUARD_WORKSPACE ?? repoRoot,
    json: true,
    provider: payload.provider,
    model: payload.model
  });
  if (typeof result === "string") {
    return result;
  }
  if (result?.text) {
    return result.text;
  }
  return JSON.stringify(result ?? { decision: "defer", reasoning: "empty agent result" });
}
