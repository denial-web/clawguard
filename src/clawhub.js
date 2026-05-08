import path from "node:path";

export function analyzeClawHubMetadata(fileRecords, basePath = process.cwd()) {
  const findings = [];
  const metadataRecords = fileRecords.filter((record) => isClawHubMetadataFile(record.file, basePath));
  const lockRecords = metadataRecords.filter((record) => isLockFile(record.file, basePath));
  const originRecords = metadataRecords.filter((record) => isOriginFile(record.file, basePath));
  const skillRecords = fileRecords.filter((record) => isSkillFile(record.file));
  const skills = skillRecords.map((record) => parseSkill(record, basePath)).filter(Boolean);
  const lock = parseLock(lockRecords[0], basePath, findings);
  const origins = originRecords.map((record) => parseOrigin(record, basePath, findings)).filter(Boolean);

  if (!lock && origins.length > 0) {
    for (const origin of origins) {
      findings.push(createFinding({
        ruleId: "clawhub-missing-lockfile",
        title: "ClawHub origin metadata exists without a lockfile",
        severity: "medium",
        recommendation: "Commit or regenerate .clawhub/lock.json so installed ClawHub skills have auditable source and version state.",
        file: origin.file,
        line: 1,
        evidence: `${origin.skillDir} has origin metadata but no .clawhub/lock.json`
      }));
    }
  }

  if (lock) {
    for (const entry of lock.entries) {
      const origin = findMatchingOrigin(entry, origins);
      const skill = findMatchingSkill(entry, skills);

      if (!origin) {
        findings.push(createFinding({
          ruleId: "clawhub-missing-origin",
          title: "ClawHub lock entry is missing local origin metadata",
          severity: "medium",
          recommendation: "Add per-skill origin metadata or reinstall from ClawHub so source provenance can be reviewed.",
          file: lock.file,
          line: 1,
          evidence: `${entry.name} (${entry.skillDir})`
        }));
      }

      findings.push(...compareVersions(entry, origin, skill, lock.file));
      findings.push(...compareSources(entry, origin, lock.file));
      findings.push(...checkSourceTrust(entry, origin, lock.file));
    }
  }

  for (const origin of origins) {
    findings.push(...checkSourceTrust(null, origin, origin.file));
  }

  return {
    findings: dedupeFindings(findings),
    clawhub: {
      lockfile: lock?.file ?? null,
      entries: lock?.entries.map(publicMetadata) ?? [],
      origins: origins.map(publicMetadata)
    }
  };
}

export function isClawHubMetadataFile(filePath, basePath = process.cwd()) {
  const relative = toPosixPath(relativePath(basePath, filePath));
  return relative === ".clawhub/lock.json" || relative.endsWith("/.clawhub/origin.json") || relative === ".clawhub/origin.json";
}

function parseLock(record, basePath, findings) {
  if (!record) {
    return null;
  }

  const parsed = parseJsonRecord(record, basePath, findings);
  if (!parsed.ok) {
    return null;
  }

  return {
    file: relativePath(basePath, record.file),
    entries: extractLockEntries(parsed.value)
  };
}

function parseOrigin(record, basePath, findings) {
  const parsed = parseJsonRecord(record, basePath, findings);
  if (!parsed.ok) {
    return null;
  }

  const relative = toPosixPath(relativePath(basePath, record.file));
  const skillDir = skillDirForOrigin(relative);
  const metadata = normalizeMetadata(parsed.value, "", skillDir);

  return {
    ...metadata,
    file: relative,
    skillDir
  };
}

function parseJsonRecord(record, basePath, findings) {
  try {
    return {
      ok: true,
      value: JSON.parse(record.text)
    };
  } catch (error) {
    findings.push(createFinding({
      ruleId: "invalid-clawhub-metadata",
      title: "ClawHub metadata is not valid JSON",
      severity: "medium",
      recommendation: "Fix invalid ClawHub metadata so source and version provenance can be reviewed.",
      file: relativePath(basePath, record.file),
      line: 1,
      evidence: error.message
    }));

    return { ok: false };
  }
}

function extractLockEntries(value) {
  const rawEntries = [];

  if (Array.isArray(value?.skills)) {
    rawEntries.push(...value.skills.map((entry) => [entry.name ?? entry.slug ?? "", entry]));
  } else if (value?.skills && typeof value.skills === "object") {
    rawEntries.push(...Object.entries(value.skills));
  }

  if (Array.isArray(value?.packages)) {
    rawEntries.push(...value.packages.map((entry) => [entry.name ?? entry.slug ?? "", entry]));
  } else if (value?.packages && typeof value.packages === "object") {
    rawEntries.push(...Object.entries(value.packages));
  }

  if (rawEntries.length === 0 && value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (entry && typeof entry === "object" && hasMetadataShape(entry)) {
        rawEntries.push([key, entry]);
      }
    }
  }

  return rawEntries.map(([key, entry]) => normalizeMetadata(entry, key)).filter((entry) => entry.name || entry.skillDir);
}

function normalizeMetadata(entry, fallbackName = "", fallbackSkillDir = "") {
  const value = entry && typeof entry === "object" ? entry : {};
  const name = clean(value.name ?? value.slug ?? value.id ?? value.package ?? fallbackName);
  const version = clean(value.version ?? value.ref ?? value.tag ?? "");
  const source = clean(value.source ?? value.repository ?? value.repo ?? value.url ?? value.origin ?? value.homepage ?? "");
  const skillDir = toPosixPath(clean(value.path ?? value.dir ?? value.target ?? fallbackSkillDir ?? (name ? `skills/${name}` : "")));

  return {
    name,
    version,
    source,
    skillDir
  };
}

function parseSkill(record, basePath) {
  const relative = toPosixPath(relativePath(basePath, record.file));
  if (!relative.startsWith("skills/") && !relative.startsWith(".agents/skills/")) {
    return null;
  }

  const lines = record.text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let name = path.basename(path.dirname(record.file));
  let version = "";

  if (lines[0]?.trim() === "---") {
    const endIndex = lines.findIndex((line, index) => index > 0 && ["---", "..."].includes(line.trim()));
    const end = endIndex === -1 ? lines.length : endIndex;

    for (let index = 1; index < end; index += 1) {
      const nameMatch = /^name\s*:\s*(.+)\s*$/i.exec(lines[index].trim());
      const versionMatch = /^version\s*:\s*(.+)\s*$/i.exec(lines[index].trim());

      if (nameMatch) {
        name = clean(nameMatch[1]);
      }

      if (versionMatch) {
        version = clean(versionMatch[1]);
      }
    }
  }

  return {
    name,
    version,
    skillDir: toPosixPath(path.dirname(relative)),
    file: relative
  };
}

function compareVersions(lockEntry, origin, skill, lockFile) {
  const findings = [];
  const comparisons = [
    ["lock", lockEntry?.version, "origin", origin?.version],
    ["lock", lockEntry?.version, "skill", skill?.version],
    ["origin", origin?.version, "skill", skill?.version]
  ];

  for (const [leftName, leftVersion, rightName, rightVersion] of comparisons) {
    if (leftVersion && rightVersion && leftVersion !== rightVersion) {
      findings.push(createFinding({
        ruleId: "clawhub-version-drift",
        title: "ClawHub metadata version differs from local skill state",
        severity: "medium",
        recommendation: "Review the installed skill version and refresh ClawHub metadata before trusting or publishing.",
        file: skill?.file ?? origin?.file ?? lockFile,
        line: 1,
        evidence: `${lockEntry.name}: ${leftName}=${leftVersion}, ${rightName}=${rightVersion}`
      }));
    }
  }

  return findings;
}

function compareSources(lockEntry, origin, lockFile) {
  if (!lockEntry?.source || !origin?.source || lockEntry.source === origin.source) {
    return [];
  }

  return [
    createFinding({
      ruleId: "clawhub-source-drift",
      title: "ClawHub lock source differs from origin metadata",
      severity: "high",
      recommendation: "Confirm whether the installed skill was moved, replaced, or modified outside the recorded ClawHub source.",
      file: origin.file ?? lockFile,
      line: 1,
      evidence: `${lockEntry.name}: lock=${lockEntry.source}, origin=${origin.source}`
    })
  ];
}

function checkSourceTrust(lockEntry, origin, fallbackFile) {
  const source = origin?.source || lockEntry?.source || "";

  if (!source || isTrustedSource(source)) {
    return [];
  }

  return [
    createFinding({
      ruleId: "clawhub-untrusted-source",
      title: "ClawHub metadata references an untrusted or unusual source",
      severity: "medium",
      recommendation: "Review the source manually and prefer official ClawHub/OpenClaw or trusted organization repositories.",
      file: origin?.file ?? fallbackFile,
      line: 1,
      evidence: source
    })
  ];
}

function findMatchingOrigin(entry, origins) {
  return origins.find((origin) => metadataMatches(entry, origin));
}

function findMatchingSkill(entry, skills) {
  return skills.find((skill) => metadataMatches(entry, skill));
}

function metadataMatches(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    (left.skillDir && right.skillDir && left.skillDir === right.skillDir) ||
    (left.name && right.name && left.name.toLowerCase() === right.name.toLowerCase())
  );
}

function isTrustedSource(source) {
  if (source.startsWith("clawhub:") || source.startsWith("openclaw:")) {
    return true;
  }

  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();

    return (
      url.protocol === "https:" &&
      (
        host === "docs.openclaw.ai" ||
        (host === "github.com" && (pathname.startsWith("/openclaw/") || pathname.startsWith("/denial-web/")))
      )
    );
  } catch {
    return false;
  }
}

function skillDirForOrigin(relativePathValue) {
  const normalized = toPosixPath(relativePathValue);

  if (normalized === ".clawhub/origin.json") {
    return "";
  }

  return toPosixPath(path.dirname(path.dirname(normalized)));
}

function hasMetadataShape(value) {
  return ["version", "source", "repository", "repo", "url", "origin", "path", "dir", "target"].some((key) => key in value);
}

function isLockFile(filePath, basePath) {
  return toPosixPath(relativePath(basePath, filePath)) === ".clawhub/lock.json";
}

function isOriginFile(filePath, basePath) {
  const relative = toPosixPath(relativePath(basePath, filePath));
  return relative.endsWith("/.clawhub/origin.json") || relative === ".clawhub/origin.json";
}

function isSkillFile(file) {
  return ["skill.md", "SKILL.md"].includes(path.basename(file));
}

function publicMetadata(metadata) {
  return {
    name: metadata.name,
    version: metadata.version,
    source: metadata.source,
    skillDir: metadata.skillDir
  };
}

function dedupeFindings(findings) {
  const seen = new Set();
  const unique = [];

  for (const finding of findings) {
    const key = `${finding.ruleId}:${finding.file}:${finding.evidence}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(finding);
  }

  return unique;
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

function clean(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function toPosixPath(value) {
  return String(value ?? "").split(path.sep).join("/");
}

function relativePath(basePath, filePath) {
  const relative = path.relative(basePath, filePath);
  return relative || path.basename(filePath);
}
