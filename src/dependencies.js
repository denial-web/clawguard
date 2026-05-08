import path from "node:path";

const npmLockNames = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const installLifecycleScripts = new Set(["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly"]);
const suspiciousNameTerms = ["backdoor", "credential", "exfil", "keylogger", "malware", "password", "secret", "stealer", "token"];

export function analyzeDependencyManifests(fileRecords, basePath = process.cwd()) {
  const findings = [];
  const records = fileRecords.filter((record) => isDependencyFile(record.file));
  const manifests = [];
  const lockfiles = records.filter((record) => isDependencyLockfile(record.file)).map((record) => ({
    file: relativePath(basePath, record.file),
    ecosystem: lockfileEcosystem(record.file),
    directory: toPosixPath(path.dirname(relativePath(basePath, record.file)))
  }));

  for (const record of records) {
    const name = path.basename(record.file);

    if (name === "package.json") {
      const manifest = parsePackageJson(record, basePath, findings);
      if (manifest) {
        manifests.push(manifest);
        findings.push(...analyzePackageManifest(manifest, lockfiles));
      }
      continue;
    }

    if (name === "requirements.txt") {
      const manifest = parseRequirements(record, basePath);
      manifests.push(manifest);
      findings.push(...analyzeDependencyEntries(manifest));
      continue;
    }

    if (name === "pyproject.toml") {
      const manifest = parsePyproject(record, basePath);
      manifests.push(manifest);
      findings.push(...analyzeDependencyEntries(manifest));
    }
  }

  return {
    findings: dedupeFindings(findings),
    dependencies: {
      manifests: manifests.map(publicManifest),
      lockfiles
    }
  };
}

export function isDependencyFile(filePath) {
  const name = path.basename(filePath);
  return ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "requirements.txt", "pyproject.toml"].includes(name);
}

function parsePackageJson(record, basePath, findings) {
  let parsed;

  try {
    parsed = JSON.parse(record.text);
  } catch (error) {
    findings.push(createFinding({
      ruleId: "invalid-dependency-manifest",
      title: "Dependency manifest is not valid JSON",
      severity: "medium",
      recommendation: "Fix invalid package.json before trusting dependency and install-script metadata.",
      file: relativePath(basePath, record.file),
      line: 1,
      evidence: error.message
    }));
    return null;
  }

  const file = relativePath(basePath, record.file);
  const directory = toPosixPath(path.dirname(file));
  const dependencies = [];

  for (const field of dependencyFields) {
    const values = parsed[field];
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      continue;
    }

    for (const [name, spec] of Object.entries(values)) {
      dependencies.push({
        name,
        spec: String(spec ?? ""),
        group: field,
        file,
        line: lineForPackageJsonKey(record.text, name)
      });
    }
  }

  const scripts = [];
  if (parsed.scripts && typeof parsed.scripts === "object" && !Array.isArray(parsed.scripts)) {
    for (const [name, command] of Object.entries(parsed.scripts)) {
      scripts.push({
        name,
        command: String(command ?? ""),
        file,
        line: lineForPackageJsonKey(record.text, name)
      });
    }
  }

  return {
    ecosystem: "npm",
    file,
    directory,
    name: String(parsed.name ?? ""),
    dependencyCount: dependencies.length,
    dependencies,
    scripts
  };
}

function parseRequirements(record, basePath) {
  const file = relativePath(basePath, record.file);
  const dependencies = [];
  const lines = record.text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("-")) {
      continue;
    }

    const value = raw.split(/\s+#/)[0].trim();
    const directMatch = /^(.+?)\s@\s(.+)$/.exec(value);
    const direct = /^(?:git\+|https?:\/\/|file:)/i.test(value) || Boolean(directMatch);
    const [namePart, specPart = ""] = value.split(/===|==|~=|!=|<=|>=|<|>/);
    const operator = /===|==|~=|!=|<=|>=|<|>/.exec(value)?.[0] ?? "";

    dependencies.push({
      name: cleanPackageName(directMatch?.[1] ?? namePart),
      spec: direct ? cleanTomlString(directMatch?.[2] ?? value) : `${operator}${specPart}`.trim(),
      group: "requirements",
      file,
      line: index + 1
    });
  }

  return {
    ecosystem: "python",
    file,
    directory: toPosixPath(path.dirname(file)),
    name: "",
    dependencyCount: dependencies.length,
    dependencies,
    scripts: []
  };
}

function parsePyproject(record, basePath) {
  const file = relativePath(basePath, record.file);
  const dependencies = [];
  const lines = record.text.split(/\r?\n/);
  let currentSection = "";
  let inProjectDependencies = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      inProjectDependencies = false;
      continue;
    }

    if (currentSection === "project" && /^dependencies\s*=\s*\[$/.test(line)) {
      inProjectDependencies = true;
      continue;
    }

    if (inProjectDependencies) {
      if (line.startsWith("]")) {
        inProjectDependencies = false;
        continue;
      }
      addPythonDependency(dependencies, cleanTomlString(line.replace(/,$/, "")), file, index + 1);
      continue;
    }

    if (currentSection === "tool.poetry.dependencies") {
      const dependencyMatch = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(line);
      if (dependencyMatch && dependencyMatch[1].toLowerCase() !== "python") {
        dependencies.push({
          name: dependencyMatch[1],
          spec: cleanTomlString(dependencyMatch[2]),
          group: "tool.poetry.dependencies",
          file,
          line: index + 1
        });
      }
    }
  }

  return {
    ecosystem: "python",
    file,
    directory: toPosixPath(path.dirname(file)),
    name: "",
    dependencyCount: dependencies.length,
    dependencies,
    scripts: []
  };
}

function analyzePackageManifest(manifest, lockfiles) {
  const findings = [];

  for (const script of manifest.scripts) {
    if (installLifecycleScripts.has(script.name)) {
      findings.push(createFinding({
        ruleId: "dependency-install-script",
        title: "Dependency manifest defines an install lifecycle script",
        severity: "high",
        recommendation: "Review install-time scripts carefully and prefer dependencies that do not execute code during installation.",
        file: script.file,
        line: script.line,
        evidence: `${script.name}: ${script.command}`
      }));
    }
  }

  if (manifest.dependencyCount > 0 && !hasNpmLockfile(manifest.directory, lockfiles)) {
    findings.push(createFinding({
      ruleId: "dependency-lockfile-missing",
      title: "Dependency manifest has no matching lockfile",
      severity: "medium",
      recommendation: "Commit a package lockfile so dependency resolution is deterministic before publishing or installing the skill.",
      file: manifest.file,
      line: 1,
      evidence: `${manifest.file} declares ${manifest.dependencyCount} dependencies`
    }));
  }

  findings.push(...analyzeDependencyEntries(manifest));
  return findings;
}

function analyzeDependencyEntries(manifest) {
  const findings = [];

  for (const dependency of manifest.dependencies) {
    if (isSuspiciousName(dependency.name)) {
      findings.push(createFinding({
        ruleId: "dependency-suspicious-name",
        title: "Dependency name contains suspicious security-sensitive terms",
        severity: "medium",
        recommendation: "Review the dependency name, source, and maintainers before trusting this skill bundle.",
        file: dependency.file,
        line: dependency.line,
        evidence: `${dependency.name}@${dependency.spec}`
      }));
    }

    if (isDirectSourceSpec(dependency.spec)) {
      findings.push(createFinding({
        ruleId: "dependency-direct-source",
        title: "Dependency is installed from a direct URL or Git source",
        severity: "high",
        recommendation: "Prefer registry packages with pinned versions, or manually verify the referenced source and commit.",
        file: dependency.file,
        line: dependency.line,
        evidence: `${dependency.name}@${dependency.spec}`
      }));
      continue;
    }

    if (!isPinnedSpec(dependency.spec, manifest.ecosystem)) {
      findings.push(createFinding({
        ruleId: "dependency-unpinned-spec",
        title: "Dependency version is not pinned",
        severity: "medium",
        recommendation: "Pin exact dependency versions before publishing, installing, or recommending the skill.",
        file: dependency.file,
        line: dependency.line,
        evidence: `${dependency.name}@${dependency.spec || "unversioned"}`
      }));
    }
  }

  return findings;
}

function hasNpmLockfile(directory, lockfiles) {
  return lockfiles.some((lockfile) => lockfile.directory === directory && lockfile.ecosystem === "npm");
}

export function isDependencyLockfile(filePath) {
  return npmLockNames.has(path.basename(filePath));
}

function lockfileEcosystem(filePath) {
  return npmLockNames.has(path.basename(filePath)) ? "npm" : "unknown";
}

function isPinnedSpec(spec, ecosystem) {
  const value = String(spec ?? "").trim();

  if (!value) {
    return false;
  }

  if (ecosystem === "python") {
    return /^={2,3}\s*[0-9][A-Za-z0-9.+!_-]*$/.test(value);
  }

  return /^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?$/.test(value);
}

function isDirectSourceSpec(spec) {
  const value = String(spec ?? "").trim();
  return /^(?:git\+|git:|github:|https?:\/\/|file:)/i.test(value) || /\s@\s(?:git\+|https?:\/\/|file:)/i.test(value);
}

function isSuspiciousName(name) {
  const normalized = String(name ?? "").toLowerCase();
  return suspiciousNameTerms.some((term) => normalized.includes(term));
}

function addPythonDependency(dependencies, value, file, line) {
  if (!value) {
    return;
  }

  const directMatch = /^(.+?)\s@\s(.+)$/.exec(value);
  const direct = /^(?:git\+|https?:\/\/|file:)/i.test(value) || Boolean(directMatch);
  const [namePart, specPart = ""] = value.split(/===|==|~=|!=|<=|>=|<|>/);
  const operator = /===|==|~=|!=|<=|>=|<|>/.exec(value)?.[0] ?? "";

  dependencies.push({
    name: cleanPackageName(directMatch?.[1] ?? namePart),
    spec: direct ? cleanTomlString(directMatch?.[2] ?? value) : `${operator}${specPart}`.trim(),
    group: "project.dependencies",
    file,
    line
  });
}

function publicManifest(manifest) {
  return {
    ecosystem: manifest.ecosystem,
    file: manifest.file,
    directory: manifest.directory,
    name: manifest.name,
    dependencyCount: manifest.dependencyCount,
    scriptCount: manifest.scripts.length
  };
}

function lineForPackageJsonKey(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`"${escaped}"\\s*:`);
  const match = matcher.exec(text);
  return match ? text.slice(0, match.index).split("\n").length : 1;
}

function cleanPackageName(value) {
  return cleanTomlString(value)
    .replace(/\[[^\]]+\]/g, "")
    .trim();
}

function cleanTomlString(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["']+|["',]+$/g, "")
    .trim();
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

function toPosixPath(value) {
  return String(value ?? "").split(path.sep).join("/");
}

function relativePath(basePath, filePath) {
  const relative = path.relative(basePath, filePath);
  return relative || path.basename(filePath);
}
