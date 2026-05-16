import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasApprovedDecisionForTarget } from "./approvals.js";
import { relativeToWorkspace } from "./paths.js";
import { scanTarget } from "../scanner.js";

const bundledSkillsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "bundled-skills");

export async function listAgentSkills(context) {
  const dirs = trustedSkillDirs(context);
  const skills = [];
  const seenNames = new Set();

  for (const root of dirs) {
    const { dir, source } = root;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const skillDir = path.join(dir, entry.name);
      const skillPath = path.join(skillDir, "SKILL.md");
      try {
        const text = await fs.readFile(skillPath, "utf8");
        const metadata = parseSkillMarkdown(text);
        const name = metadata.name ?? entry.name;
        if (seenNames.has(name)) {
          continue;
        }
        seenNames.add(name);
        const scan = await scanTarget(skillDir, {
          policy: context.policy,
          suppressions: context.config.suppressions,
          maxFileSizeBytes: context.config.maxFileSizeBytes,
          maxFindingsPerRulePerFile: context.config.maxFindingsPerRulePerFile
        });
        const approved = await hasApprovedDecisionForTarget(context.paths.approvalPath, context.paths.decisionsPath, skillDir);
        const loadable = scan.policy.decision === "allow" || approved;

        skills.push({
          name,
          description: metadata.description ?? "",
          risk: metadata.risk ?? scan.level,
          path: skillDir,
          relativePath: skillRelativePath(context.paths.workspace, skillDir),
          source,
          skillFile: skillPath,
          metadata,
          scan: {
            decision: scan.policy.decision,
            level: scan.level,
            score: scan.score,
            findings: scan.findings.length
          },
          approved,
          loadable
        });
      } catch (error) {
        if (seenNames.has(entry.name)) {
          continue;
        }
        seenNames.add(entry.name);
        skills.push({
          name: entry.name,
          description: "",
          risk: "unknown",
          path: skillDir,
          relativePath: skillRelativePath(context.paths.workspace, skillDir),
          source,
          skillFile: skillPath,
          metadata: {},
          scan: null,
          approved: false,
          loadable: false,
          error: error.message
        });
      }
    }
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadTrustedAgentSkills(context) {
  const skills = await listAgentSkills(context);
  return skills.filter((skill) => skill.loadable);
}

export async function showAgentSkill(context, name) {
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) {
    throw new Error("agent skills show requires a skill name.");
  }
  const skills = await listAgentSkills(context);
  const skill = skills.find((candidate) => candidate.name === normalizedName);
  if (!skill) {
    throw new Error(`Agent skill not found: ${normalizedName}`);
  }
  let instructions = "";
  try {
    instructions = await fs.readFile(skill.skillFile, "utf8");
  } catch {
    instructions = "";
  }
  return {
    ...skill,
    instructions
  };
}

export function parseSkillMarkdown(text) {
  const markdown = String(text ?? "");
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?/.exec(markdown);

  if (!match) {
    return {};
  }

  return parseSimpleYaml(match[1]);
}

function trustedSkillDirs(context) {
  const configured = Array.isArray(context.agent.trustedSkillDirs)
    ? context.agent.trustedSkillDirs
    : ["skills"];
  const dirs = [
    ...configured.map((dir) => ({ dir, source: "workspace" })),
    { dir: context.paths.trustedSkillsDir, source: "trusted" },
    { dir: bundledSkillsDir, source: "bundled" }
  ];
  const unique = new Set();
  const roots = [];

  for (const root of dirs) {
    const resolved = root.source === "bundled"
      ? path.resolve(root.dir)
      : path.resolve(context.paths.workspace, String(root.dir));
    const relative = path.relative(context.paths.workspace, resolved);
    if (root.source === "bundled" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      const key = `${root.source}:${resolved}`;
      if (!unique.has(key)) {
        unique.add(key);
        roots.push({ dir: resolved, source: root.source });
      }
    }
  }

  return roots;
}

function skillRelativePath(workspace, skillDir) {
  const relative = path.relative(path.resolve(workspace), path.resolve(skillDir));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return skillDir;
  }
  return relativeToWorkspace(workspace, skillDir);
}

function parseSimpleYaml(text) {
  const result = {};
  const lines = text.split(/\r?\n/);
  let currentListKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    const listItem = /^\s*-\s+(.+)$/.exec(line);
    if (listItem && currentListKey) {
      result[currentListKey].push(cleanScalar(listItem[1]));
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);
    if (!pair) {
      currentListKey = null;
      continue;
    }

    const key = pair[1];
    const value = pair[2] ?? "";
    if (value === "") {
      result[key] = [];
      currentListKey = key;
    } else {
      result[key] = cleanScalar(value);
      currentListKey = null;
    }
  }

  return result;
}

function cleanScalar(value) {
  const trimmed = String(value).trim();
  const quoted = /^["'](.*)["']$/.exec(trimmed);
  return quoted ? quoted[1] : trimmed;
}
