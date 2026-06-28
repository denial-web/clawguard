import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendAgentApprovalRequest, createAgentApprovalRequest, hasApprovedDecisionForTarget, readApprovalRequests, readLatestDecision } from "./approvals.js";
import { relativeToWorkspace, resolveWorkspacePath, safeArtifactName } from "./paths.js";
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

export async function validateAgentSkillDirectory(context, sourcePath) {
  const source = await resolveWorkspacePath(context.paths.workspace, requireText(sourcePath, "agent skills validate requires a skill path."), {
    optional: true
  });
  const skillPath = path.join(source, "SKILL.md");
  const text = await fs.readFile(skillPath, "utf8");
  const metadata = parseSkillMarkdown(text);
  const errors = [];
  const warnings = [];

  if (!metadata.name) {
    errors.push("SKILL.md frontmatter requires name.");
  }
  if (!metadata.description) {
    errors.push("SKILL.md frontmatter requires description.");
  }
  if (!metadata.risk) {
    warnings.push("SKILL.md frontmatter should include risk.");
  }
  for (const key of ["toolAutonomy", "protectedAssets", "autoWriteMemory", "autonomy", "permissions"]) {
    if (metadata[key] !== undefined) {
      errors.push(`Skill metadata cannot include ${key}.`);
    }
  }

  const requiredTools = normalizeSkillList(metadata.required_tools);
  const unsafeRequested = requiredTools.filter((tool) => [
    "shell.execute",
    "browser.click",
    "browser.type",
    "payment.send",
    "file.delete"
  ].includes(tool));
  for (const tool of unsafeRequested) {
    errors.push(`Skill requested unsupported unsafe tool ${tool}.`);
  }

  const scan = await scanTarget(source, {
    policy: context.policy,
    suppressions: context.config.suppressions,
    maxFileSizeBytes: context.config.maxFileSizeBytes,
    maxFindingsPerRulePerFile: context.config.maxFindingsPerRulePerFile
  });

  return {
    ok: errors.length === 0,
    source,
    relativePath: skillRelativePath(context.paths.workspace, source),
    metadata,
    requiredTools,
    errors,
    warnings,
    scan: {
      decision: scan.policy.decision,
      level: scan.level,
      score: scan.score,
      findings: scan.findings.length
    }
  };
}

export async function installAgentSkill(context, sourcePath, options = {}) {
  const validation = await validateAgentSkillDirectory(context, sourcePath);
  if (!validation.ok) {
    return {
      ok: false,
      status: "blocked",
      validation,
      error: `Skill validation failed: ${validation.errors.join("; ")}`
    };
  }

  const source = validation.source;
  await assertDirectoryHasNoSymlinks(source);
  const name = safeArtifactName(options.name ?? validation.metadata.name ?? path.basename(source));
  const destination = path.join(context.paths.trustedSkillsDir, name);
  const approved = await hasApprovedDecisionForTarget(context.paths.approvalPath, context.paths.decisionsPath, source);

  if (validation.scan.decision !== "allow" && !approved) {
    if (options.approvalId) {
      const decision = await readLatestDecision(context.paths.decisionsPath, options.approvalId);
      if (!decision || decision.decision !== "approve") {
        return {
          ok: false,
          status: "pending_approval",
          validation,
          approvalRequest: {
            id: options.approvalId,
            path: context.paths.approvalPath,
            status: "pending"
          }
        };
      }
      const scopeError = await validateSkillInstallApprovalScope(context, options.approvalId, source, destination);
      if (scopeError) {
        return {
          ok: false,
          status: "blocked",
          validation,
          error: scopeError
        };
      }
    } else {
      const request = createAgentApprovalRequest({
        tool: "skill.install_guarded",
        args: {
          source: validation.relativePath,
          name
        },
        target: source,
        destination,
        risk: "high",
        reason: `Install skill only after scan decision ${validation.scan.decision}.`,
        requiredActions: ["review-scan", "approve-skill-install"],
        artifacts: [{
          type: "scan-summary",
          ...validation.scan
        }, {
          type: "skill-validation",
          validation
        }]
      });
      const approvalRequest = await appendAgentApprovalRequest(context.paths.approvalPath, request);
      return {
        ok: false,
        status: "pending_approval",
        validation,
        approvalRequest,
        error: null
      };
    }
  }

  await assertDestinationAvailable(destination);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: false
  });

  return {
    ok: true,
    status: "completed",
    source: validation.relativePath,
    destination: skillRelativePath(context.paths.workspace, destination),
    validation
  };
}

async function validateSkillInstallApprovalScope(context, approvalId, source, destination) {
  const approvals = await readApprovalRequests(context.paths.approvalPath);
  const approval = approvals.find((item) => item.id === approvalId);
  if (!approval) {
    return `Approval ${approvalId} does not match a recorded skill install approval request.`;
  }

  const tool = String(approval.agentAction?.tool ?? approval.tool ?? "");
  if (tool !== "skill.install_guarded") {
    return `Approval ${approvalId} is for ${tool || "unknown"}, not skill.install_guarded.`;
  }

  if (approval.target && path.resolve(approval.target) !== path.resolve(source)) {
    return `Approval ${approvalId} target does not match this skill source.`;
  }
  if (approval.destination && path.resolve(approval.destination) !== path.resolve(destination)) {
    return `Approval ${approvalId} destination does not match this trusted skill destination.`;
  }

  return null;
}

export async function createAgentSkillTemplate(context, name, options = {}) {
  const skillName = safeSkillName(name);
  const type = normalizeSkillType(options.type);
  const skillDir = await resolveWorkspacePath(context.paths.workspace, path.join("skills", skillName), {
    forWrite: true,
    optional: true
  });
  const skillPath = path.join(skillDir, "SKILL.md");
  try {
    await fs.lstat(skillPath);
    throw new Error(`Skill already exists: ${skillRelativePath(context.paths.workspace, skillDir)}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(skillPath, renderSkillTemplate(skillName, type));
  return {
    ok: true,
    status: "created",
    name: skillName,
    type,
    path: skillRelativePath(context.paths.workspace, skillDir),
    skillFile: skillRelativePath(context.paths.workspace, skillPath)
  };
}

export async function trustWorkspaceAgentSkill(context, name) {
  const normalized = String(name ?? "").trim();
  if (!normalized) {
    throw new Error("agent skills trust requires <name>.");
  }

  const skills = await listAgentSkills(context);
  const skill = skills.find((candidate) => candidate.name === normalized && candidate.source === "workspace");
  if (!skill) {
    throw new Error(`Workspace skill not found: ${normalized}`);
  }

  const result = await installAgentSkill(context, skill.relativePath, {
    name: skill.name
  });
  return {
    ...result,
    trustedName: skill.name
  };
}

export async function removeTrustedAgentSkill(context, name) {
  const normalized = String(name ?? "").trim();
  if (!normalized) {
    throw new Error("agent skills remove requires <name>.");
  }

  const target = path.join(context.paths.trustedSkillsDir, safeArtifactName(normalized));
  const relative = skillRelativePath(context.paths.workspace, target);
  try {
    await fs.lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        ok: true,
        status: "skipped",
        name: normalized,
        path: relative,
        reason: "Trusted skill was not installed."
      };
    }
    throw error;
  }

  await fs.rm(target, { recursive: true, force: false });
  return {
    ok: true,
    status: "removed",
    name: normalized,
    path: relative
  };
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

async function assertDirectoryHasNoSymlinks(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Skill install blocks symlinks: ${target}`);
    }
    if (entry.isDirectory()) {
      await assertDirectoryHasNoSymlinks(target);
    }
  }
}

async function assertDestinationAvailable(destination) {
  try {
    await fs.lstat(destination);
    throw new Error(`Trusted skill destination already exists: ${destination}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
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

function normalizeSkillList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeSkillType(value) {
  const type = String(value ?? "developer").trim().toLowerCase();
  if (!["developer", "business", "safety"].includes(type)) {
    throw new Error("agent skills create --type must be developer, business, or safety.");
  }
  return type;
}

function safeSkillName(value) {
  const name = safeArtifactName(String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-"));
  if (!name) {
    throw new Error("agent skills create requires <name>.");
  }
  return name;
}

function renderSkillTemplate(name, type) {
  const presets = {
    developer: {
      risk: "medium",
      tools: ["file.list", "file.read", "git.status", "memory.search"],
      subagent: "project-inspector",
      domain: "software-development",
      cadence: "task"
    },
    business: {
      risk: "medium",
      tools: ["file.list", "file.read", "memory.search", "memory.propose"],
      subagent: "business-operator",
      domain: "business-operations",
      cadence: "daily, weekly, monthly"
    },
    safety: {
      risk: "high",
      tools: ["file.list", "file.read", "git.diff", "memory.search", "shell.dry_run"],
      subagent: "security-reviewer",
      domain: "safety-governance",
      cadence: "task, incident"
    }
  };
  const preset = presets[type];
  return [
    "---",
    `name: ${name}`,
    `description: ${titleCase(name)} governed procedural skill.`,
    `risk: ${preset.risk}`,
    "required_tools:",
    ...preset.tools.map((tool) => `  - ${tool}`),
    `suggested_subagent: ${preset.subagent}`,
    `business_domain: ${preset.domain}`,
    `cadence: ${preset.cadence}`,
    "approval_required_for:",
    "  - file.write_safe",
    "  - shell.execute_approved",
    "  - memory.propose",
    "---",
    "",
    `# ${titleCase(name)}`,
    "",
    "Use this skill when the user asks for work in this domain.",
    "",
    "Rules:",
    "- Treat this skill as procedural guidance, not executable code.",
    "- Never change ClawGuard autonomy settings, protected assets, or approval policy.",
    "- Use approved tools only, and surface uncertainty before irreversible action.",
    "- Keep writes, shell execution, durable memory, external actions, and protected assets approval-gated.",
    ""
  ].join("\n");
}

function titleCase(value) {
  return String(value)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function requireText(value, message) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(message);
  }
  return text;
}

function cleanScalar(value) {
  const trimmed = String(value).trim();
  const quoted = /^["'](.*)["']$/.exec(trimmed);
  return quoted ? quoted[1] : trimmed;
}
