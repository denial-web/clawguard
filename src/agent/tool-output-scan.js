import { wrapToolOutputMessage } from "./inter-component.js";
import { resolveInjectionCriticConfig, reviewToolObservationWithCritic } from "./injection-critic.js";

export const toolOutputScanSchemaVersion = "clawguard.toolOutputScan.v1";

const UNTRUSTED_OUTPUT_TOOLS = new Set([
  "file.read",
  "web.fetch",
  "github.repo_read",
  "github.issue_read",
  "shell.dry_run",
  "shell.execute_approved",
  "skill.install_guarded"
]);

const SCAN_RULES = [
  {
    id: "prompt-injection",
    severity: "high",
    patterns: [
      /ignore (?:all )?(?:previous|prior|above) instructions/i,
      /disregard (?:all )?(?:previous|prior|above) (?:instructions|rules)/i,
      /do not (?:tell|reveal|mention|disclose) (?:the user|anyone)/i,
      /hide (?:this|these) instructions/i,
      /\b(?:system prompt|developer message)\b/i,
      /\b(?:reveal secrets?|exfiltrate)\b/i,
      /\b(?:disable|bypass) (?:safety|approval|clawguard|policy)\b/i
    ],
    reason: "Tool output contains instruction-like text that could hijack the agent."
  },
  {
    id: "forged-provenance",
    severity: "critical",
    patterns: [
      /"trust"\s*:\s*"(?:policy_decision|verified|approved)"/i,
      /\bverifiedby\b/i,
      /"verifiedBy"\s*:/i,
      /\bpolicy_engine\b[\s\S]{0,80}?\bverified\b/i,
      /\bclawguard (?:approved|verified|authorized) this\b/i,
      /\bthis (?:action|request) (?:is|was) (?:pre-)?approved\b/i
    ],
    reason: "Tool output claims forged policy or runtime provenance."
  },
  {
    id: "indirect-tool-call",
    severity: "high",
    patterns: [
      /\baction:\s*[a-z][a-z0-9_]*\b/i,
      /\byou must (?:now )?(?:call|invoke|run|execute|use)\b/i,
      /\b(?:call|invoke|run|execute) (?:the )?(?:tool|function)\b/i,
      /\bimmediately (?:send|post|email|upload|delete|transfer)\b/i,
      /\bnew (?:high-)?priority (?:task|instruction)\b/i
    ],
    reason: "Tool output attempts to steer the agent toward a new tool action."
  },
  {
    id: "approval-bypass",
    severity: "critical",
    patterns: [
      /\bno (?:longer )?requires? approval\b/i,
      /\bskip (?:human )?approval\b/i,
      /\bauto[- ]?approve\b/i,
      /\bignore (?:clawguard|policy|safety) (?:and|then)\b/i
    ],
    reason: "Tool output attempts to bypass ClawGuard approval or policy gates."
  }
];

export function extractObservableText(output) {
  if (output == null) {
    return "";
  }

  if (typeof output === "string") {
    return output.slice(0, 256 * 1024);
  }

  const parts = [];

  const visit = (value, depth = 0) => {
    if (depth > 5 || value == null) {
      return;
    }

    if (typeof value === "string") {
      parts.push(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
      }
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    for (const key of ["content", "stdout", "stderr", "text", "body", "html", "message", "title"]) {
      if (typeof value[key] === "string") {
        parts.push(value[key]);
      }
    }

    if (parts.length === 0) {
      try {
        parts.push(JSON.stringify(value));
      } catch {
        // Ignore non-serializable values.
      }
    }
  };

  visit(output);
  return parts.join("\n").slice(0, 256 * 1024);
}

export function scanToolObservation(text, options = {}) {
  const haystack = String(text ?? "");
  const findings = [];

  for (const rule of SCAN_RULES) {
    for (const pattern of rule.patterns) {
      const match = haystack.match(pattern);
      if (!match) {
        continue;
      }

      findings.push({
        id: rule.id,
        severity: rule.severity,
        reason: rule.reason,
        match: match[0].slice(0, 160)
      });
      break;
    }
  }

  const decision = resolveScanDecision(findings, options);
  return {
    schemaVersion: toolOutputScanSchemaVersion,
    decision,
    poisoned: decision !== "allow",
    findings,
    summary: findings.length === 0
      ? null
      : findings.map((finding) => finding.reason).join(" ")
  };
}

export function shouldScanToolOutput(toolName, config = {}) {
  if (config.enabled === false) {
    return false;
  }

  const normalized = String(toolName ?? "").trim();
  if (!normalized) {
    return false;
  }

  if (Array.isArray(config.tools) && config.tools.length > 0) {
    return config.tools.includes(normalized);
  }

  return UNTRUSTED_OUTPUT_TOOLS.has(normalized);
}

export async function applyToolOutputScan(result, step, context) {
  const config = context.agent?.toolOutputScan ?? {};
  if (!result?.ok || !shouldScanToolOutput(step.tool, config)) {
    return result;
  }

  const observable = extractObservableText(result.output);
  if (!observable.trim()) {
    return result;
  }

  let scan = scanToolObservation(observable, { tool: step.tool });
  const criticConfig = resolveInjectionCriticConfig(context.agent);
  if (scan.decision !== "block" && criticConfig.enabled) {
    const critic = await reviewToolObservationWithCritic(observable, { ...context, step });
    scan = {
      ...scan,
      injectionCritic: critic
    };
    if (critic.decision === "block") {
      scan = {
        ...scan,
        decision: "block",
        poisoned: true,
        summary: critic.reason ?? critic.error ?? "Injection critic blocked untrusted tool observation."
      };
    }
  }

  if (scan.findings.length === 0 && scan.decision !== "block") {
    return result;
  }

  const wrapped = wrapToolOutputMessage({
    payload: {
      tool: step.tool,
      content: observable,
      scan
    }
  });

  const baseOutput = typeof result.output === "object" && result.output && !Array.isArray(result.output)
    ? result.output
    : { content: result.output };

  const enrichedOutput = {
    ...baseOutput,
    interComponentMessage: wrapped,
    poisonedObservation: scan.poisoned
  };

  if (scan.decision === "block") {
    return {
      ok: false,
      status: "blocked",
      output: enrichedOutput,
      error: scan.summary ?? "Poisoned tool observation blocked by deterministic scan.",
      artifacts: [
        ...(result.artifacts ?? []),
        { type: "tool-output-scan", scan }
      ],
      toolOutputScan: scan
    };
  }

  return {
    ...result,
    output: enrichedOutput,
    artifacts: [
      ...(result.artifacts ?? []),
      { type: "tool-output-scan", scan }
    ],
    toolOutputScan: scan
  };
}

function resolveScanDecision(findings, options = {}) {
  if (findings.length === 0) {
    return "allow";
  }

  const blockSeverities = new Set(options.blockSeverities ?? ["critical", "high"]);
  const hasBlockSeverity = findings.some((finding) => blockSeverities.has(finding.severity));
  if (hasBlockSeverity) {
    return "block";
  }

  return "flag";
}
