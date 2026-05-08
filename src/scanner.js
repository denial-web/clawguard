import { promises as fs } from "node:fs";
import path from "node:path";
import { analyzeClawHubMetadata, isClawHubMetadataFile } from "./clawhub.js";
import { analyzeDependencyManifests, isDependencyFile } from "./dependencies.js";
import { analyzeMcpConfigs } from "./mcp-config.js";
import { evaluatePolicy } from "./policy.js";
import { rules, severityWeights } from "./rules.js";
import { analyzeSkillMetadata } from "./skill-metadata.js";
import { analyzeWorkspaceSkills } from "./workspace.js";

export const reportSchemaVersion = "1.0.0";

export const defaultScanOptions = {
  maxFileSizeBytes: 1024 * 1024,
  maxFindingsPerRulePerFile: 5,
  policy: "personal",
  suppressions: []
};

const defaultIncludeFiles = new Set([
  "SKILL.md",
  "skill.md",
  "README.md",
  "readme.md",
  "package.json",
  "package-lock.json",
  "requirements.txt",
  "yarn.lock",
  "manifest.json",
  "mcp.json",
  "server.json",
  "config.json"
]);

const sourceExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".json",
  ".md",
  ".yaml",
  ".yml",
  ".toml"
]);

const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__"
]);

export async function scanTarget(targetPath, options = {}) {
  const scanOptions = normalizeOptions(options);
  const resolvedPath = path.resolve(targetPath);
  const { files, skippedFiles } = await collectFiles(resolvedPath, scanOptions);
  const fileRecords = [];
  const findings = [];

  for (const file of files) {
    let text;

    try {
      text = await fs.readFile(file, "utf8");
    } catch (error) {
      skippedFiles.push(skippedFile(file, resolvedPath, "unreadable-file", error.message));
      continue;
    }

    fileRecords.push({ file, text });
    if (!isClawHubMetadataFile(file, resolvedPath) && !isDependencyFile(file)) {
      findings.push(...scanText(text, file, resolvedPath, scanOptions));
    }
  }

  findings.push(...analyzeSkillMetadata(fileRecords, resolvedPath));
  findings.push(...analyzeMcpConfigs(fileRecords, resolvedPath));
  const clawhubAnalysis = analyzeClawHubMetadata(fileRecords, resolvedPath);
  findings.push(...clawhubAnalysis.findings);
  const dependencyAnalysis = analyzeDependencyManifests(fileRecords, resolvedPath);
  findings.push(...dependencyAnalysis.findings);
  const workspaceAnalysis = analyzeWorkspaceSkills(fileRecords, findings, resolvedPath);
  findings.push(...workspaceAnalysis.findings);

  const { activeFindings, suppressedFindings } = applySuppressions(dedupeFindings(findings), scanOptions.suppressions);
  const score = calculateScore(activeFindings);
  const result = {
    schemaVersion: reportSchemaVersion,
    target: resolvedPath,
    score,
    level: scoreToLevel(score),
    filesScanned: files.length,
    filesSkipped: skippedFiles.length,
    skippedFiles,
    findings: groupFindings(activeFindings),
    suppressedFindings: groupFindings(suppressedFindings),
    summary: summarizeFindings(activeFindings),
    clawhub: clawhubAnalysis.clawhub,
    dependencies: dependencyAnalysis.dependencies,
    workspace: workspaceAnalysis.workspace,
    options: scanOptions
  };

  result.policy = evaluatePolicy(result, scanOptions.policy);
  return result;
}

export function scanText(text, filePath = "input", basePath = process.cwd(), options = {}) {
  const scanOptions = normalizeOptions(options);
  const findings = [];

  for (const rule of rules) {
    const seen = new Set();
    const seenSpans = [];
    let ruleFindings = 0;

    for (const pattern of rule.patterns) {
      const matcher = toGlobalRegex(pattern);
      let match;

      while ((match = matcher.exec(text)) && ruleFindings < scanOptions.maxFindingsPerRulePerFile) {
        if (match[0] === "") {
          matcher.lastIndex += 1;
          continue;
        }

        const index = match.index ?? 0;
        const end = index + match[0].length;
        const evidence = cleanEvidence(match[0]);
        const dedupeKey = `${index}:${evidence}`;

        if (seen.has(dedupeKey) || overlapsSeenSpan(index, end, seenSpans)) {
          continue;
        }

        seen.add(dedupeKey);
        seenSpans.push([index, end]);
        ruleFindings += 1;

        findings.push({
          ruleId: rule.id,
          title: rule.title,
          severity: rule.severity,
          recommendation: rule.recommendation,
          file: relativePath(basePath, filePath),
          line: lineNumberForIndex(text, index),
          evidence
        });
      }

      if (ruleFindings >= scanOptions.maxFindingsPerRulePerFile) {
        break;
      }
    }
  }

  return findings;
}

async function collectFiles(targetPath, options) {
  const stats = await fs.lstat(targetPath);
  const basePath = stats.isDirectory() ? targetPath : path.dirname(targetPath);
  const files = [];
  const skippedFiles = [];

  if (stats.isSymbolicLink()) {
    skippedFiles.push(skippedFile(targetPath, basePath, "symbolic-link"));
    return { files, skippedFiles };
  }

  if (stats.isFile()) {
    await addFileIfSafe(targetPath, basePath, files, skippedFiles, options);
    return { files, skippedFiles };
  }

  if (!stats.isDirectory()) {
    return { files, skippedFiles };
  }

  await walk(targetPath, basePath, files, skippedFiles, options);
  return {
    files: files.sort(),
    skippedFiles: skippedFiles.sort((a, b) => a.file.localeCompare(b.file))
  };
}

async function walk(dir, basePath, files, skippedFiles, options) {
  let entries;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    skippedFiles.push(skippedFile(dir, basePath, "unreadable-directory", error.message));
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      skippedFiles.push(skippedFile(fullPath, basePath, "symbolic-link"));
      continue;
    }

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        await walk(fullPath, basePath, files, skippedFiles, options);
      }
      continue;
    }

    if (entry.isFile()) {
      await addFileIfSafe(fullPath, basePath, files, skippedFiles, options);
    }
  }
}

async function addFileIfSafe(filePath, basePath, files, skippedFiles, options) {
  if (!shouldScanFile(filePath)) {
    return;
  }

  const stats = await fs.lstat(filePath);

  if (stats.size > options.maxFileSizeBytes) {
    skippedFiles.push(skippedFile(filePath, basePath, "file-too-large", `${stats.size} bytes`));
    return;
  }

  files.push(filePath);
}

function shouldScanFile(filePath) {
  const name = path.basename(filePath);
  const ext = path.extname(filePath);
  return defaultIncludeFiles.has(name) || sourceExtensions.has(ext);
}

function calculateScore(findings) {
  const rawScore = findings.reduce((sum, finding) => {
    return sum + severityWeights[finding.severity];
  }, 0);
  return Math.min(100, rawScore);
}

function scoreToLevel(score) {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  if (score > 0) return "low";
  return "info";
}

function groupFindings(findings) {
  return findings.sort((a, b) => {
    return (
      severityWeights[b.severity] - severityWeights[a.severity] ||
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.ruleId.localeCompare(b.ruleId)
    );
  });
}

function summarizeFindings(findings) {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  for (const finding of findings) {
    counts[finding.severity] += 1;
  }

  return counts;
}

function applySuppressions(findings, suppressions) {
  const activeFindings = [];
  const suppressedFindings = [];

  for (const finding of findings) {
    const suppression = suppressions.find((candidate) => matchesSuppression(candidate, finding));

    if (!suppression) {
      activeFindings.push(finding);
      continue;
    }

    suppressedFindings.push({
      ...finding,
      suppressed: true,
      suppressionReason: suppression.reason
    });
  }

  return { activeFindings, suppressedFindings };
}

function dedupeFindings(findings) {
  const seen = new Set();
  const unique = [];

  for (const finding of findings) {
    const key = `${finding.ruleId}:${finding.file}:${finding.line}:${finding.evidence}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(finding);
  }

  return unique;
}

function matchesSuppression(suppression, finding) {
  if (suppression.ruleId !== finding.ruleId) {
    return false;
  }

  if (finding.severity === "critical" && !suppression.allowCritical) {
    return false;
  }

  if (suppression.expires && Date.parse(suppression.expires) < Date.now()) {
    return false;
  }

  if (!suppression.path) {
    return true;
  }

  return finding.file === suppression.path || finding.file.endsWith(`/${suppression.path}`);
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

function cleanEvidence(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function normalizeOptions(options) {
  return {
    ...defaultScanOptions,
    ...options
  };
}

function toGlobalRegex(pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function skippedFile(filePath, basePath, reason, detail = "") {
  return {
    file: relativePath(basePath, filePath),
    reason,
    detail
  };
}

function relativePath(basePath, filePath) {
  return path.relative(basePath, filePath) || path.basename(filePath);
}

function overlapsSeenSpan(start, end, spans) {
  return spans.some(([seenStart, seenEnd]) => start < seenEnd && end > seenStart);
}
