import path from "node:path";

const packageRunnerCommands = new Set(["npx", "pnpm", "pnpm dlx", "uvx"]);
const shellCommands = new Set(["bash", "sh", "zsh", "powershell", "pwsh", "python", "python3", "node"]);
const sensitiveNamePattern = /(?:API_KEY|TOKEN|SECRET|PASSWORD|PASS|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS)/i;

export function analyzeMcpConfigs(fileRecords, basePath = process.cwd()) {
  const findings = [];

  for (const record of fileRecords) {
    if (!isMcpConfigFile(record.file, basePath)) {
      continue;
    }

    const parsed = parseConfigJson(record);
    if (!parsed.ok) {
      findings.push(createFinding({
        ruleId: "invalid-mcp-config",
        title: "MCP or plugin config is not valid JSON",
        severity: "medium",
        recommendation: "Fix invalid JSON so security tools and runtimes can read the config reliably.",
        record,
        basePath,
        line: 1,
        evidence: parsed.error
      }));
      continue;
    }

    findings.push(...analyzeRawConfigText(record, basePath));
    findings.push(...analyzeCommandObjects(parsed.value, record, basePath));
    findings.push(...analyzeEnvObjects(parsed.value, record, basePath));

    if (isOpenClawPluginManifest(record.file)) {
      findings.push(...analyzeOpenClawPluginManifest(parsed.value, record, fileRecords, basePath));
    }
  }

  return dedupeFindings(findings).slice(0, 30);
}

export function isMcpConfigFile(filePath, basePath = process.cwd()) {
  const normalized = relativePath(basePath, filePath).replaceAll(path.sep, "/");
  const basename = path.basename(filePath);

  return (
    basename === "mcp.json" ||
    basename === "openclaw.plugin.json" ||
    normalized.endsWith(".cursor/mcp.json") ||
    normalized.endsWith(".openclaw/mcp.json") ||
    normalized.endsWith(".openclaw/plugins.json")
  );
}

function isOpenClawPluginManifest(filePath) {
  return path.basename(filePath) === "openclaw.plugin.json";
}

function analyzeOpenClawPluginManifest(value, record, fileRecords, basePath) {
  const findings = [];
  const packageRecord = findSiblingPackageJson(record, fileRecords);

  if (!packageRecord) {
    findings.push(createFinding({
      ruleId: "openclaw-plugin-missing-package-manifest",
      title: "OpenClaw plugin manifest has no package.json metadata",
      severity: "medium",
      recommendation: "Keep openclaw.plugin.json next to package.json so compatibility, version, and runtime metadata can be reviewed.",
      record,
      basePath,
      evidence: "package.json not found next to openclaw.plugin.json"
    }));
    return findings;
  }

  const packageJson = parseConfigJson(packageRecord);
  if (!packageJson.ok) {
    return findings;
  }

  const openclaw = isPlainObject(packageJson.value.openclaw) ? packageJson.value.openclaw : {};
  const missingFields = missingOpenClawPluginFields(openclaw);
  if (missingFields.length > 0) {
    findings.push(createFinding({
      ruleId: "openclaw-plugin-missing-compat-metadata",
      title: "OpenClaw plugin package is missing ClawHub compatibility metadata",
      severity: "medium",
      recommendation: "Add openclaw.compat.pluginApi and openclaw.build.openclawVersion before publishing or installing the plugin.",
      record: packageRecord,
      basePath,
      line: lineForPackageJsonKey(packageRecord.text, missingFields[0].split(".").at(-1)),
      evidence: `Missing fields: ${missingFields.join(", ")}`
    }));
  }

  const runtimeEntries = stringArray(openclaw.runtimeExtensions);
  const sourceEntries = stringArray(openclaw.extensions);
  const executableEntries = runtimeEntries.length > 0 ? runtimeEntries : sourceEntries;
  if (executableEntries.length > 0) {
    findings.push(createFinding({
      ruleId: "openclaw-plugin-code-execution",
      title: "OpenClaw plugin package executes local runtime code",
      severity: "high",
      recommendation: "Review plugin runtime entries, source provenance, and sandboxing before installing or enabling the plugin.",
      record: packageRecord,
      basePath,
      line: lineForPackageJsonKey(packageRecord.text, runtimeEntries.length > 0 ? "runtimeExtensions" : "extensions"),
      evidence: executableEntries.join(", ")
    }));
  }

  findings.push(...findMissingCompiledRuntimeOutputs(openclaw, record, fileRecords, basePath));
  findings.push(...findOpenClawPluginSensitiveCapabilities(value, record, basePath));

  return findings;
}

function findOpenClawPluginSensitiveCapabilities(value, record, basePath) {
  const findings = [];
  const serialized = JSON.stringify(value);

  if (/\b(?:shell|terminal|filesystem|process|exec|spawn)\b/i.test(serialized)) {
    findings.push(createFinding({
      ruleId: "openclaw-plugin-sensitive-capability",
      title: "OpenClaw plugin manifest declares sensitive host capabilities",
      severity: "high",
      recommendation: "Require manual review and least-privilege sandboxing for plugins that expose shell, process, or filesystem capabilities.",
      record,
      basePath,
      evidence: firstCapabilityEvidence(serialized)
    }));
  }

  return findings;
}

function findMissingCompiledRuntimeOutputs(openclaw, manifestRecord, fileRecords, basePath) {
  const findings = [];
  const runtimeEntries = stringArray(openclaw.runtimeExtensions);
  if (runtimeEntries.length > 0) {
    return findings;
  }

  const sourceEntries = stringArray(openclaw.extensions).filter(isTypeScriptRuntimeEntry);
  if (sourceEntries.length === 0) {
    return findings;
  }

  const packageDir = path.dirname(manifestRecord.file);
  const packageFiles = new Set(fileRecords
    .filter((record) => isInsideDir(record.file, packageDir))
    .map((record) => normalizePackagePath(path.relative(packageDir, record.file))));

  for (const entry of sourceEntries) {
    const candidates = compiledRuntimeCandidates(entry);
    if (candidates.some((candidate) => packageFiles.has(candidate))) {
      continue;
    }

    findings.push(createFinding({
      ruleId: "openclaw-plugin-missing-runtime-output",
      title: "OpenClaw plugin TypeScript entry has no compiled runtime output",
      severity: "high",
      recommendation: "Build and ship compiled JavaScript runtime output, or declare runtimeExtensions that point to committed runtime files.",
      record: manifestRecord,
      basePath,
      evidence: `${entry} expected ${candidates.join(", ")}`
    }));
  }

  return findings;
}

function analyzeRawConfigText(record, basePath) {
  const findings = [];

  collectPatternFindings(findings, record, basePath, {
    ruleId: "mcp-shell-execution",
    title: "MCP or plugin config can execute shell code",
    severity: "high",
    recommendation: "Avoid shell interpreters in tool config unless the command is local, pinned, and reviewed.",
    patterns: [
      /"(?:bash|sh|zsh|powershell|pwsh)"\s*,?\s*(?:\]|\n|.){0,120}?"-c"/gi,
      /"(?:python|python3|node)"\s*,?\s*(?:\]|\n|.){0,120}?"-(?:c|e)"/gi,
      /\b(?:curl|wget)\b[\s\S]{0,120}?\|\s*(?:sh|bash|zsh|python|node)\b/gi
    ]
  });

  collectPatternFindings(findings, record, basePath, {
    ruleId: "mcp-runtime-package-command",
    title: "MCP or plugin config runs a package manager command",
    severity: "high",
    recommendation: "Prefer pinned local commands over runtime package fetches such as npx, uvx, or pnpm dlx.",
    patterns: [
      /"(?:command|setup_commands?)"\s*:\s*"?\s*(?:npx|uvx|pnpm\s+dlx)\b/gi,
      /\b(?:npx|uvx|pnpm\s+dlx)\b/gi
    ]
  });

  collectPatternFindings(findings, record, basePath, {
    ruleId: "mcp-remote-url",
    title: "MCP or plugin config references a remote URL",
    severity: "medium",
    recommendation: "Confirm the remote endpoint is expected, trusted, and does not receive secrets.",
    patterns: [/https?:\/\/[^\s"',)]+/gi]
  });

  collectPatternFindings(findings, record, basePath, {
    ruleId: "mcp-broad-filesystem-access",
    title: "MCP or plugin config grants broad filesystem access",
    severity: "high",
    recommendation: "Restrict filesystem access to the smallest required workspace path.",
    patterns: [
      /"(?:\$HOME|~\/|\/Users\/[^"']+|\/)"\s*[,}\]]/gi,
      /"--(?:allow-dir|root|filesystem)"\s*,\s*"(?:\$HOME|~\/|\/Users\/[^"']+|\/)"/gi,
      /"--(?:allow-dir|root|filesystem)=(?:\$HOME|~\/|\/Users\/[^"']+|\/)"/gi
    ]
  });

  collectPatternFindings(findings, record, basePath, {
    ruleId: "mcp-write-capability",
    title: "MCP or plugin config exposes write-capable tools",
    severity: "high",
    recommendation: "Require explicit approval or sandboxing for tools that can post, send, delete, or create external changes.",
    patterns: [
      /\b(?:browser|email|calendar|slack|github)[_-]?(?:write|send|delete|post|create|modify)\b/gi,
      /\b(?:write|send|delete|post|create|modify)[_-]?(?:browser|email|calendar|slack|github)\b/gi,
      /\b(?:browser|email|calendar|slack|github)\b[\s\S]{0,80}?\b(?:write|send|delete|post|create|modify)\b/gi,
      /\b(?:write|send|delete|post|create|modify)\b[\s\S]{0,80}?\b(?:browser|email|calendar|slack|github)\b/gi
    ]
  });

  return findings;
}

function analyzeCommandObjects(value, record, basePath) {
  const findings = [];

  for (const commandObject of findObjectsWithCommand(value)) {
    const command = normalizeCommand(commandObject.command);
    const args = Array.isArray(commandObject.args) ? commandObject.args.map(String) : [];

    if (packageRunnerCommands.has(command) || (command === "pnpm" && args[0] === "dlx")) {
      findings.push(createFinding({
        ruleId: "mcp-runtime-package-command",
        title: "MCP or plugin config runs a package manager command",
        severity: "high",
        recommendation: "Prefer pinned local commands over runtime package fetches such as npx, uvx, or pnpm dlx.",
        record,
        basePath,
        evidence: commandObject.command
      }));

      const unpinned = firstUnpinnedPackage(command, args);
      if (unpinned) {
        findings.push(createFinding({
          ruleId: "mcp-unpinned-package",
          title: "MCP or plugin config uses an unpinned package",
          severity: "medium",
          recommendation: "Pin package versions so tool behavior cannot change unexpectedly between runs.",
          record,
          basePath,
          evidence: unpinned
        }));
      }
    }

    if (shellCommands.has(command) && hasDynamicExecutionArg(command, args)) {
      findings.push(createFinding({
        ruleId: "mcp-shell-execution",
        title: "MCP or plugin config can execute shell code",
        severity: "high",
        recommendation: "Avoid shell interpreters in tool config unless the command is local, pinned, and reviewed.",
        record,
        basePath,
        evidence: `${command} ${args.join(" ")}`.trim()
      }));
    }

    if (isUnknownExecutable(commandObject.command)) {
      findings.push(createFinding({
        ruleId: "mcp-unknown-executable",
        title: "MCP or plugin config uses a local or unknown executable path",
        severity: "medium",
        recommendation: "Review local executable paths and prefer committed, pinned, least-privilege tools.",
        record,
        basePath,
        evidence: commandObject.command
      }));
    }

    const broadPath = args.find(isBroadFilesystemValue);
    if (broadPath) {
      findings.push(createFinding({
        ruleId: "mcp-broad-filesystem-access",
        title: "MCP or plugin config grants broad filesystem access",
        severity: "high",
        recommendation: "Restrict filesystem access to the smallest required workspace path.",
        record,
        basePath,
        evidence: broadPath
      }));
    }
  }

  return findings;
}

function analyzeEnvObjects(value, record, basePath) {
  const findings = [];

  for (const envObject of findEnvObjects(value)) {
    for (const [key, envValue] of Object.entries(envObject)) {
      const serializedValue = String(envValue);

      if (sensitiveNamePattern.test(key) || sensitiveNamePattern.test(serializedValue)) {
        findings.push(createFinding({
          ruleId: "mcp-secret-env",
          title: "MCP or plugin config injects sensitive environment variables",
          severity: "high",
          recommendation: "Avoid passing broad secrets into MCP tools unless the server is trusted and least-privileged.",
          record,
          basePath,
          evidence: key
        }));
      }
    }
  }

  return findings;
}

function collectPatternFindings(findings, record, basePath, rule) {
  for (const pattern of rule.patterns) {
    let match;

    while ((match = pattern.exec(record.text))) {
      findings.push(createFinding({
        ruleId: rule.ruleId,
        title: rule.title,
        severity: rule.severity,
        recommendation: rule.recommendation,
        record,
        basePath,
        line: lineNumberForIndex(record.text, match.index ?? 0),
        evidence: cleanEvidence(match[0])
      }));
    }
  }
}

function findObjectsWithCommand(value) {
  const objects = [];

  walkJson(value, (item) => {
    if (item && typeof item === "object" && !Array.isArray(item) && typeof item.command === "string") {
      objects.push(item);
    }
  });

  return objects;
}

function findEnvObjects(value) {
  const objects = [];

  walkJson(value, (item, key) => {
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      ["env", "environment", "environmentVariables"].includes(key)
    ) {
      objects.push(item);
    }
  });

  return objects;
}

function findSiblingPackageJson(record, fileRecords) {
  const expected = path.join(path.dirname(record.file), "package.json");
  return fileRecords.find((candidate) => candidate.file === expected);
}

function missingOpenClawPluginFields(openclaw) {
  const fields = [];
  const compat = isPlainObject(openclaw.compat) ? openclaw.compat : {};
  const build = isPlainObject(openclaw.build) ? openclaw.build : {};

  if (!trimmedString(compat.pluginApi)) {
    fields.push("openclaw.compat.pluginApi");
  }

  if (!trimmedString(build.openclawVersion)) {
    fields.push("openclaw.build.openclawVersion");
  }

  return fields;
}

function compiledRuntimeCandidates(entry) {
  const normalized = normalizePackagePath(entry);
  const withoutExtension = normalized.replace(/\.[^.]+$/, "");
  const distBase = normalized.startsWith("src/")
    ? `dist/${normalized.slice("src/".length).replace(/\.[^.]+$/, "")}`
    : `dist/${withoutExtension}`;

  return [".js", ".mjs", ".cjs"].flatMap((extension) => [
    `${distBase}${extension}`,
    `${withoutExtension}${extension}`
  ]);
}

function firstCapabilityEvidence(serialized) {
  const match = /\b(?:shell|terminal|filesystem|process|exec|spawn)\b/i.exec(serialized);
  return match?.[0] ?? "sensitive capability";
}

function walkJson(value, visit, key = "") {
  visit(value, key);

  if (Array.isArray(value)) {
    for (const item of value) {
      walkJson(item, visit, key);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      walkJson(childValue, visit, childKey);
    }
  }
}

function firstUnpinnedPackage(command, args) {
  const packageArg = args.find((arg) => isPackageLikeArg(command, arg));
  if (!packageArg) {
    return "";
  }

  return isPinnedPackage(packageArg) ? "" : packageArg;
}

function isPackageLikeArg(command, arg) {
  if (!arg || arg.startsWith("-")) {
    return false;
  }

  if (command === "pnpm") {
    return arg !== "dlx";
  }

  return !arg.startsWith("http://") && !arg.startsWith("https://");
}

function isPinnedPackage(value) {
  if (value.includes("==")) {
    return true;
  }

  const slashIndex = value.lastIndexOf("/");
  const atIndex = value.lastIndexOf("@");

  return atIndex > slashIndex && !value.endsWith("@latest");
}

function hasDynamicExecutionArg(command, args) {
  if (["bash", "sh", "zsh", "powershell", "pwsh"].includes(command)) {
    return args.some((arg) => ["-c", "-Command", "-EncodedCommand"].includes(arg));
  }

  if (["python", "python3"].includes(command)) {
    return args.includes("-c");
  }

  return command === "node" && args.includes("-e");
}

function isUnknownExecutable(command) {
  const value = String(command ?? "");
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value.startsWith("~/");
}

function isBroadFilesystemValue(value) {
  return value === "/" || value === "$HOME" || value === "~/" || value.startsWith("/Users/");
}

function isInsideDir(file, dir) {
  const relative = path.relative(dir, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTypeScriptRuntimeEntry(value) {
  return /\.(?:c|m)?ts$/i.test(value);
}

function normalizeCommand(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePackagePath(value) {
  return String(value ?? "").trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
}

function trimmedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseConfigJson(record) {
  try {
    return {
      ok: true,
      value: JSON.parse(record.text)
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

function createFinding({ ruleId, title, severity, recommendation, record, basePath, line, evidence }) {
  const clean = cleanEvidence(evidence);

  return {
    ruleId,
    title,
    severity,
    recommendation,
    file: relativePath(basePath, record.file),
    line: line ?? lineForEvidence(record.text, clean),
    evidence: clean
  };
}

function dedupeFindings(findings) {
  const seen = new Set();
  const unique = [];

  for (const finding of findings) {
    const key = `${finding.ruleId}:${finding.file}:${finding.line}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(finding);
  }

  return unique;
}

function lineForEvidence(text, evidence) {
  const index = text.indexOf(evidence);
  return lineNumberForIndex(text, index >= 0 ? index : 0);
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

function lineForPackageJsonKey(text, key) {
  if (!key) {
    return 1;
  }

  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`"${escaped}"\\s*:`).exec(text);
  return lineNumberForIndex(text, match?.index ?? 0);
}

function cleanEvidence(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function relativePath(basePath, filePath) {
  const relative = path.relative(basePath, filePath);
  return relative || path.basename(filePath);
}
