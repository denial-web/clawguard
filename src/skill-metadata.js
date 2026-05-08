import path from "node:path";
import { isClawHubMetadataFile } from "./clawhub.js";
import { isDependencyFile } from "./dependencies.js";

const requiredSkillFields = ["name", "description", "version", "author", "category"];
const sensitiveEnvNames = new Set(["HOME", "PATH", "PWD", "SHELL", "USER", "USERNAME", "NODE_ENV"]);
const binaryNames = [
  "brew",
  "curl",
  "docker",
  "gh",
  "git",
  "go",
  "node",
  "npm",
  "npx",
  "openssl",
  "pip",
  "pip3",
  "pnpm",
  "powershell",
  "python",
  "python3",
  "rsync",
  "scp",
  "ssh",
  "uv",
  "wget",
  "yarn"
];

const configPathPatterns = [
  /\.env\b/i,
  /\.npmrc\b/i,
  /\.pypirc\b/i,
  /\.aws\/credentials\b/i,
  /\.ssh\/config\b/i,
  /\.cursor\/mcp\.json\b/i,
  /\.openclaw\/[a-z0-9_.\/-]+/i,
  /\bconfig\.json\b/i
];

export function analyzeSkillMetadata(fileRecords, basePath = process.cwd()) {
  const findings = [];
  const skillFiles = fileRecords.filter((record) => isSkillFile(record.file));

  for (const skillFile of skillFiles) {
    const parsed = parseSkillFrontmatter(skillFile.text);

    if (!parsed.frontmatter) {
      continue;
    }

    findings.push(...findMissingMetadataFields(parsed, skillFile, basePath));

    const skillDir = path.dirname(skillFile.file);
    const relatedRecords = fileRecords.filter((record) => {
      return isInsideDir(record.file, skillDir) && !isClawHubMetadataFile(record.file, basePath) && !isDependencyFile(record.file);
    });
    const observed = collectObservedBehavior(relatedRecords);

    findings.push(...findUndeclaredEnv(parsed, observed.envVars, basePath));
    findings.push(...findUndeclaredBinaries(parsed, observed.binaries, basePath));
    findings.push(...findUndeclaredConfig(parsed, observed.configPaths, basePath));
    findings.push(...findUndeclaredNetwork(parsed, observed.network, basePath));
    findings.push(...findUndeclaredInstall(parsed, observed.install, basePath));
  }

  return findings;
}

export function parseSkillFrontmatter(text) {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const lines = normalizedText.split(/\r?\n/);

  if (lines[0]?.trim() !== "---") {
    return {
      frontmatter: null,
      body: normalizedText,
      declarations: emptyDeclarations()
    };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && ["---", "..."].includes(line.trim()));

  if (endIndex === -1) {
    return {
      frontmatter: null,
      body: normalizedText,
      declarations: emptyDeclarations(),
      error: "unterminated-frontmatter"
    };
  }

  const frontmatter = lines.slice(1, endIndex).join("\n");
  const body = lines.slice(endIndex + 1).join("\n");

  return {
    frontmatter,
    body,
    declarations: normalizeFrontmatter(frontmatter)
  };
}

export function normalizeFrontmatter(frontmatter) {
  const declarations = emptyDeclarations();
  const contexts = [];
  const lines = frontmatter.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine);

    if (!line.trim()) {
      continue;
    }

    const indent = countIndent(line);
    const trimmed = line.trim();

    while (contexts.length > 0 && indent <= contexts.at(-1).indent) {
      contexts.pop();
    }

    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim();
      const key = contexts.at(-1)?.key ?? "";
      collectDeclaredValue(declarations, key, value);
      continue;
    }

    const keyValue = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(trimmed);
    if (!keyValue) {
      continue;
    }

    const key = keyValue[1];
    const value = keyValue[2].trim();
    const keyLower = key.toLowerCase();
    const parentKey = contexts.at(-1)?.key ?? "";

    declarations.fields.add(keyLower);
    collectContextDeclaredValue(declarations, parentKey, key, value);
    collectDeclaredValue(declarations, keyLower, value);

    if (value === "") {
      contexts.push({ indent, key: keyLower });
    }
  }

  return freezeDeclarations(declarations);
}

function findMissingMetadataFields(parsed, skillFile, basePath) {
  const missing = requiredSkillFields.filter((field) => !parsed.declarations.fields.has(field));

  if (missing.length === 0) {
    return [];
  }

  return [
    {
      ruleId: "missing-skill-metadata",
      title: "Missing recommended OpenClaw skill metadata",
      severity: "low",
      recommendation: "Add complete SKILL.md frontmatter so users and registries can understand requirements.",
      file: relativePath(basePath, skillFile.file),
      line: 1,
      evidence: `Missing fields: ${missing.join(", ")}`
    }
  ];
}

function findUndeclaredEnv(parsed, envVars, basePath) {
  return firstUndeclared(envVars, (item) => {
    return !parsed.declarations.env.has(item.value);
  }).map((item) => ({
    ruleId: "undeclared-env-access",
    title: "Uses environment secrets not declared in skill metadata",
    severity: "high",
    recommendation: "Declare required environment variables under metadata.openclaw before users install the skill.",
    file: relativePath(basePath, item.file),
    line: item.line,
    evidence: item.value
  }));
}

function findUndeclaredBinaries(parsed, binaries, basePath) {
  return firstUndeclared(binaries, (item) => {
    return !parsed.declarations.bins.has(item.value.toLowerCase());
  }).map((item) => ({
    ruleId: "undeclared-binary-requirement",
    title: "Uses a command-line tool not declared in skill metadata",
    severity: "medium",
    recommendation: "Declare required binaries under metadata.openclaw.requires.bins or anyBins.",
    file: relativePath(basePath, item.file),
    line: item.line,
    evidence: item.value
  }));
}

function findUndeclaredConfig(parsed, configPaths, basePath) {
  return firstUndeclared(configPaths, (item) => {
    return !hasDeclaredConfig(parsed.declarations.config, item.value);
  }).map((item) => ({
    ruleId: "undeclared-config-access",
    title: "Reads config paths not declared in skill metadata",
    severity: "medium",
    recommendation: "Declare required config paths under metadata.openclaw.requires.config.",
    file: relativePath(basePath, item.file),
    line: item.line,
    evidence: item.value
  }));
}

function findUndeclaredNetwork(parsed, networkAccess, basePath) {
  if (parsed.declarations.network || networkAccess.length === 0) {
    return [];
  }

  return firstUndeclared(networkAccess, () => true).map((item) => ({
    ruleId: "undeclared-network-access",
    title: "Uses network access not declared in skill metadata",
    severity: "medium",
    recommendation: "Declare network requirements or permissions so users can make an informed trust decision.",
    file: relativePath(basePath, item.file),
    line: item.line,
    evidence: item.value
  }));
}

function findUndeclaredInstall(parsed, installBehavior, basePath) {
  if (parsed.declarations.install || installBehavior.length === 0) {
    return [];
  }

  return firstUndeclared(installBehavior, () => true).slice(0, 1).map((item) => ({
    ruleId: "undeclared-install-requirement",
    title: "Mentions install behavior not declared in skill metadata",
    severity: "high",
    recommendation: "Declare install requirements explicitly and avoid hidden setup steps.",
    file: relativePath(basePath, item.file),
    line: item.line,
    evidence: item.value
  }));
}

function collectObservedBehavior(records) {
  const observed = {
    envVars: [],
    binaries: [],
    configPaths: [],
    network: [],
    install: []
  };

  for (const record of records) {
    collectMatches(record, observed.envVars, [
      /\bprocess\.env\.([A-Z][A-Z0-9_]{2,})\b/g,
      /\$([A-Z][A-Z0-9_]{2,})\b/g,
      /\b([A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PASS|PRIVATE_KEY|ACCESS_KEY|CREDENTIALS)[A-Z0-9_]*)\b/g
    ], (match) => normalizeEnvName(match[1]));

    collectMatches(record, observed.binaries, [
      new RegExp(`(?:^|\\n|\\bRun\\s+|\\bUse\\s+|\\brequires?\\s+|\\bneeds?\\s+|[\\\`'"])(${binaryNames.join("|")})\\b`, "gi")
    ], (match) => match[1].toLowerCase());

    collectMatches(record, observed.network, [
      /https?:\/\/[^\s)]+/gi,
      /\b(?:fetch|axios|request)\s*\(/gi,
      /\b(?:webhook|api endpoint|callback url)\b/gi
    ]);

    collectMatches(record, observed.install, [
      /\b(?:npm|pnpm|yarn|uv|pip|pip3|brew|go)\s+(?:install|add|get)\b/gi,
      /\b(?:setup command|install command)\b/gi,
      /\b(?:preinstall|postinstall|prepare)\b/gi
    ]);

    for (const pattern of configPathPatterns) {
      collectMatches(record, observed.configPaths, [pattern]);
    }
  }

  observed.envVars = uniqueObservations(observed.envVars.filter((item) => item.value));
  observed.binaries = uniqueObservations(observed.binaries);
  observed.configPaths = uniqueObservations(observed.configPaths);
  observed.network = uniqueObservations(observed.network);
  observed.install = uniqueObservations(observed.install);

  return observed;
}

function collectMatches(record, bucket, patterns, valueFromMatch = (match) => match[0]) {
  for (const pattern of patterns) {
    const matcher = toGlobalRegex(pattern);
    let match;

    while ((match = matcher.exec(record.text))) {
      if (match[0] === "") {
        matcher.lastIndex += 1;
        continue;
      }

      const value = cleanScalar(valueFromMatch(match));
      if (!value) {
        continue;
      }

      bucket.push({
        value,
        file: record.file,
        line: lineNumberForIndex(record.text, match.index ?? 0)
      });
    }
  }
}

function collectDeclaredValue(declarations, key, rawValue) {
  const values = parseYamlScalarList(rawValue);

  if (["env", "envvars", "primaryenv", "requiredenv", "environment_variables"].includes(key)) {
    addValues(declarations.env, values.map(normalizeEnvName));
    return;
  }

  if (["bins", "anybins", "bin", "commands"].includes(key)) {
    addValues(declarations.bins, values.map((value) => value.toLowerCase()));
    return;
  }

  if (["config", "configs"].includes(key)) {
    addValues(declarations.config, values.map((value) => value.toLowerCase()));
    return;
  }

  if (key === "install") {
    declarations.install = true;
    return;
  }

  if (["permissions", "permission"].includes(key)) {
    addValues(declarations.permissions, values.map((value) => value.toLowerCase()));
  }

  if (["network", "network_access"].includes(key) && isTruthy(rawValue)) {
    declarations.network = true;
  }

  if (key === "safety_level" && rawValue.toLowerCase().includes("network")) {
    declarations.network = true;
  }

  if (values.some((value) => value.toLowerCase().includes("network_access"))) {
    declarations.network = true;
  }
}

function collectContextDeclaredValue(declarations, parentKey, key, rawValue) {
  if (!["envvars", "environment_variables"].includes(parentKey)) {
    return;
  }

  const envName = normalizeEnvName(key);
  if (envName) {
    declarations.env.add(envName);
  }

  addValues(declarations.env, parseYamlScalarList(rawValue).map(normalizeEnvName));
}

function parseYamlScalarList(rawValue) {
  const value = cleanScalar(rawValue);

  if (!value || value === "{}" || value === "[]") {
    return [];
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map(cleanScalar)
      .filter(Boolean);
  }

  const inlineKeyValue = /^[A-Za-z0-9_.-]+\s*:\s*(.+)$/.exec(value);
  if (inlineKeyValue) {
    return parseYamlScalarList(inlineKeyValue[1]);
  }

  return [value];
}

function firstUndeclared(items, predicate) {
  const findings = [];
  const seen = new Set();

  for (const item of items) {
    const key = item.value.toLowerCase();
    if (seen.has(key) || !predicate(item)) {
      continue;
    }
    seen.add(key);
    findings.push(item);
  }

  return findings.slice(0, 5);
}

function hasDeclaredConfig(declaredConfig, observedValue) {
  const observed = observedValue.toLowerCase();

  for (const declared of declaredConfig) {
    if (observed.includes(declared) || declared.includes(observed)) {
      return true;
    }
  }

  return false;
}

function isSkillFile(file) {
  return ["skill.md", "SKILL.md"].includes(path.basename(file));
}

function isInsideDir(file, dir) {
  const relative = path.relative(dir, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function emptyDeclarations() {
  return {
    env: new Set(),
    bins: new Set(),
    config: new Set(),
    permissions: new Set(),
    fields: new Set(),
    install: false,
    network: false
  };
}

function freezeDeclarations(declarations) {
  return {
    env: declarations.env,
    bins: declarations.bins,
    config: declarations.config,
    permissions: declarations.permissions,
    fields: declarations.fields,
    install: declarations.install,
    network: declarations.network
  };
}

function addValues(target, values) {
  for (const value of values) {
    if (value) {
      target.add(value);
    }
  }
}

function stripInlineComment(line) {
  return line.replace(/\s+#.*$/, "");
}

function countIndent(line) {
  return /^ */.exec(line)?.[0].length ?? 0;
}

function cleanScalar(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[),.;:]+$/g, "")
    .trim();
}

function normalizeEnvName(value) {
  const envName = cleanScalar(value).toUpperCase();
  return sensitiveEnvNames.has(envName) ? "" : envName;
}

function uniqueObservations(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = `${item.file}:${item.line}:${item.value.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

function toGlobalRegex(pattern) {
  const flags = new Set(pattern.flags.split(""));
  flags.add("g");
  return new RegExp(pattern.source, [...flags].join(""));
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

function relativePath(basePath, filePath) {
  const relative = path.relative(basePath, filePath);
  return relative || path.basename(filePath);
}

function isTruthy(value) {
  return ["true", "yes", "on", "1"].includes(cleanScalar(value).toLowerCase());
}
