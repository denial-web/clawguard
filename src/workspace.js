import path from "node:path";
import { severityWeights } from "./rules.js";

const locations = {
  "skills": {
    kind: "workspace-skills",
    label: "workspace skills",
    precedence: 20
  },
  ".agents/skills": {
    kind: "project-agent-skills",
    label: "project agent skills",
    precedence: 10
  }
};

export function analyzeWorkspaceSkills(fileRecords, existingFindings, basePath = process.cwd()) {
  const skills = discoverWorkspaceSkills(fileRecords, existingFindings, basePath);
  const findings = [];
  const duplicates = [];

  for (const [name, groupedSkills] of groupByName(skills)) {
    if (groupedSkills.length < 2) {
      continue;
    }

    const sorted = groupedSkills.sort((a, b) => b.precedence - a.precedence || a.skillFile.localeCompare(b.skillFile));
    const winner = sorted[0];
    const overridden = sorted.slice(1);
    const evidence = `${name}: ${sorted.map((skill) => skill.skillFile).join(", ")}`;

    duplicates.push({
      name,
      winner: winner.skillFile,
      overridden: overridden.map((skill) => skill.skillFile)
    });

    findings.push(createFinding({
      ruleId: "workspace-duplicate-skill-name",
      title: "Workspace contains duplicate skill names",
      severity: "medium",
      recommendation: "Review duplicate skill names so users know which skill OpenClaw will load.",
      file: winner.skillFile,
      line: winner.nameLine,
      evidence
    }));

    findings.push(createFinding({
      ruleId: "workspace-skill-override",
      title: "Higher-precedence workspace skill overrides another skill",
      severity: "medium",
      recommendation: "Confirm the effective skill is the intended one before trusting this workspace.",
      file: winner.skillFile,
      line: winner.nameLine,
      evidence: `${winner.skillFile} overrides ${overridden.map((skill) => skill.skillFile).join(", ")}`
    }));

    const riskiestOverridden = overridden.reduce((riskiest, skill) => {
      return skill.score > riskiest.score ? skill : riskiest;
    }, { score: 0 });

    if (winner.score > riskiestOverridden.score && winner.score >= severityWeights.medium) {
      findings.push(createFinding({
        ruleId: "workspace-risky-skill-override",
        title: "Winning workspace skill is riskier than the skill it overrides",
        severity: "high",
        recommendation: "Review the higher-precedence skill carefully because it changes the effective trusted behavior.",
        file: winner.skillFile,
        line: winner.nameLine,
        evidence: `${winner.skillFile} score ${winner.score} overrides lower-precedence score ${riskiestOverridden.score}`
      }));
    }
  }

  return {
    findings,
    workspace: {
      skills: skills.map(publicSkillInfo),
      duplicates
    }
  };
}

export function discoverWorkspaceSkills(fileRecords, existingFindings = [], basePath = process.cwd()) {
  return fileRecords
    .filter((record) => isSkillFile(record.file))
    .map((record) => toWorkspaceSkill(record, existingFindings, basePath))
    .filter(Boolean);
}

function toWorkspaceSkill(record, existingFindings, basePath) {
  const relative = toPosixPath(relativePath(basePath, record.file));
  const location = locationFor(relative);

  if (!location) {
    return null;
  }

  const identity = parseSkillIdentity(record.text, path.basename(path.dirname(record.file)));
  const skillDir = path.dirname(relative);

  return {
    name: identity.name,
    nameLine: identity.line,
    locationKind: location.kind,
    locationLabel: location.label,
    precedence: location.precedence,
    skillDir,
    skillFile: relative,
    score: scoreForSkill(skillDir, existingFindings)
  };
}

function parseSkillIdentity(text, fallbackName) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  if (lines[0]?.trim() === "---") {
    const endIndex = lines.findIndex((line, index) => index > 0 && ["---", "..."].includes(line.trim()));
    const frontmatterEnd = endIndex === -1 ? lines.length : endIndex;

    for (let index = 1; index < frontmatterEnd; index += 1) {
      const match = /^name\s*:\s*(.+)\s*$/i.exec(lines[index].trim());
      if (match) {
        return {
          name: cleanName(match[1]),
          line: index + 1
        };
      }
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^#\s+(.+)\s*$/.exec(lines[index]);
    if (match) {
      return {
        name: slugifyName(match[1]),
        line: index + 1
      };
    }
  }

  return {
    name: slugifyName(fallbackName),
    line: 1
  };
}

function locationFor(relativePathValue) {
  if (relativePathValue.startsWith("skills/")) {
    return locations.skills;
  }

  if (relativePathValue.startsWith(".agents/skills/")) {
    return locations[".agents/skills"];
  }

  return null;
}

function scoreForSkill(skillDir, findings) {
  const rawScore = findings.reduce((sum, finding) => {
    if (finding.file === skillDir || finding.file.startsWith(`${skillDir}/`)) {
      return sum + severityWeights[finding.severity];
    }

    return sum;
  }, 0);

  return Math.min(100, rawScore);
}

function groupByName(skills) {
  const groups = new Map();

  for (const skill of skills) {
    const key = skill.name.toLowerCase();
    const current = groups.get(key) ?? [];
    current.push(skill);
    groups.set(key, current);
  }

  return groups;
}

function publicSkillInfo(skill) {
  return {
    name: skill.name,
    locationKind: skill.locationKind,
    precedence: skill.precedence,
    skillDir: skill.skillDir,
    skillFile: skill.skillFile,
    score: skill.score
  };
}

function createFinding({ ruleId, title, severity, recommendation, file, line, evidence }) {
  return {
    ruleId,
    title,
    severity,
    recommendation,
    file,
    line,
    evidence
  };
}

function isSkillFile(file) {
  return ["skill.md", "SKILL.md"].includes(path.basename(file));
}

function cleanName(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function slugifyName(value) {
  return cleanName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed-skill";
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function relativePath(basePath, filePath) {
  const relative = path.relative(basePath, filePath);
  return relative || path.basename(filePath);
}
