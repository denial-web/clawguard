const severityOrder = ["critical", "high", "medium", "low"];

export function createHtmlReport(scanResult) {
  const generatedAt = new Date().toISOString();
  const findingsBySeverity = groupFindingsBySeverity(scanResult.findings ?? []);
  const suppressedFindings = scanResult.suppressedFindings ?? [];
  const skippedFiles = scanResult.skippedFiles ?? [];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ClawShield Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --text: #1c1f24;
      --muted: #626a73;
      --border: #d9ded8;
      --critical: #8f1d1d;
      --high: #b34512;
      --medium: #876200;
      --low: #316a49;
      --info: #365b82;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    main {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: end;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 32px; letter-spacing: 0; }
    h2 { font-size: 18px; margin: 28px 0 12px; }
    h3 { font-size: 15px; margin-bottom: 6px; }
    .target {
      margin-top: 8px;
      color: var(--muted);
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
    }
    .score {
      min-width: 148px;
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .score strong {
      display: block;
      font-size: 40px;
      line-height: 1;
    }
    .score span {
      color: var(--muted);
      text-transform: uppercase;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 20px;
    }
    .metric, .policy, .finding, .empty, .details {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
    }
    .metric { padding: 14px; }
    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 700;
    }
    .metric strong { font-size: 24px; }
    .policy {
      margin-top: 16px;
      padding: 16px;
    }
    .policy-title {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: #fff;
      background: var(--info);
    }
    .badge.critical, .badge.block { background: var(--critical); }
    .badge.high, .badge.sandbox_required, .badge.dual_approval { background: var(--high); }
    .badge.medium, .badge.manual_review { background: var(--medium); }
    .badge.low, .badge.warn { background: var(--low); }
    .badge.info, .badge.allow { background: var(--info); }
    .finding {
      padding: 14px;
      margin-bottom: 10px;
    }
    .finding-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
    }
    .location, .evidence, .recommendation, .muted {
      color: var(--muted);
      font-size: 13px;
    }
    .location {
      margin-top: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      word-break: break-word;
    }
    .evidence {
      margin-top: 10px;
      padding: 10px;
      background: #f1f3f0;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .recommendation { margin-top: 8px; }
    .empty, .details {
      padding: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      text-align: left;
      padding: 8px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th { color: var(--muted); }
    footer {
      margin-top: 32px;
      color: var(--muted);
      font-size: 12px;
    }
    @media (max-width: 720px) {
      header { grid-template-columns: 1fr; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .finding-head { display: block; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>ClawShield Report</h1>
        <p class="target">${escapeHtml(scanResult.target)}</p>
        <p class="muted">Schema ${escapeHtml(scanResult.schemaVersion ?? "unknown")} generated ${escapeHtml(generatedAt)}</p>
      </div>
      <div class="score">
        <strong>${escapeHtml(scanResult.score)}</strong>
        <span>${escapeHtml(scanResult.level)}</span>
      </div>
    </header>

    <section class="grid" aria-label="Finding summary">
      ${metric("Critical", scanResult.summary?.critical ?? 0)}
      ${metric("High", scanResult.summary?.high ?? 0)}
      ${metric("Medium", scanResult.summary?.medium ?? 0)}
      ${metric("Low", scanResult.summary?.low ?? 0)}
    </section>

    <section class="policy">
      <div class="policy-title">
        <h2>Policy Decision</h2>
        <span class="badge ${className(scanResult.policy?.decision)}">${escapeHtml(scanResult.policy?.decision ?? "allow")}</span>
        <span class="badge ${className(scanResult.policy?.preset)}">${escapeHtml(scanResult.policy?.preset ?? "personal")}</span>
      </div>
      <p>${escapeHtml(scanResult.policy?.reason ?? "No policy reason provided.")}</p>
      ${requiredActions(scanResult.policy?.requiredActions ?? [])}
    </section>

    <section>
      <h2>Findings</h2>
      ${findingsHtml(findingsBySeverity)}
    </section>

    ${suppressedHtml(suppressedFindings)}
    ${skippedHtml(skippedFiles)}
    ${clawhubHtml(scanResult.clawhub)}
    ${dependenciesHtml(scanResult.dependencies)}
    ${workspaceHtml(scanResult.workspace)}
    ${optionsHtml(scanResult)}

    <footer>
      ClawShield is a static scanner. Findings are risk signals, not proof of malicious intent or safety.
    </footer>
  </main>
</body>
</html>
`;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function findingsHtml(grouped) {
  const sections = severityOrder
    .filter((severity) => grouped[severity]?.length)
    .map((severity) => `
      <h3>${escapeHtml(titleCase(severity))}</h3>
      ${grouped[severity].map(findingHtml).join("")}
    `)
    .join("");

  return sections || `<div class="empty">No risky patterns detected.</div>`;
}

function findingHtml(finding) {
  return `<article class="finding">
    <div class="finding-head">
      <div>
        <h3>${escapeHtml(finding.title)}</h3>
        <div class="location">${escapeHtml(finding.file)}:${escapeHtml(finding.line)}</div>
      </div>
      <span class="badge ${className(finding.severity)}">${escapeHtml(finding.severity)}</span>
    </div>
    <div class="evidence">${escapeHtml(finding.evidence)}</div>
    <p class="recommendation">${escapeHtml(finding.recommendation)}</p>
  </article>`;
}

function suppressedHtml(findings) {
  if (findings.length === 0) {
    return "";
  }

  return `<section>
    <h2>Suppressed Findings</h2>
    ${findings.map((finding) => `<article class="finding">
      <div class="finding-head">
        <div>
          <h3>${escapeHtml(finding.title)}</h3>
          <div class="location">${escapeHtml(finding.file)}:${escapeHtml(finding.line)}</div>
        </div>
        <span class="badge ${className(finding.severity)}">${escapeHtml(finding.severity)}</span>
      </div>
      <p class="recommendation">Suppression reason: ${escapeHtml(finding.suppressionReason)}</p>
    </article>`).join("")}
  </section>`;
}

function skippedHtml(skippedFiles) {
  if (skippedFiles.length === 0) {
    return "";
  }

  return `<section>
    <h2>Skipped Files</h2>
    <div class="details">
      <table>
        <thead><tr><th>File</th><th>Reason</th><th>Detail</th></tr></thead>
        <tbody>
          ${skippedFiles.map((file) => `<tr><td>${escapeHtml(file.file)}</td><td>${escapeHtml(file.reason)}</td><td>${escapeHtml(file.detail)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  </section>`;
}

function clawhubHtml(clawhub) {
  if (!clawhub?.entries?.length && !clawhub?.origins?.length) {
    return "";
  }

  return `<section>
    <h2>ClawHub Metadata</h2>
    <div class="details">
      <table>
        <tbody>
          <tr><th>Lockfile</th><td>${escapeHtml(clawhub.lockfile ?? "none")}</td></tr>
          <tr><th>Lock entries</th><td>${escapeHtml(clawhub.entries?.length ?? 0)}</td></tr>
          <tr><th>Origin records</th><td>${escapeHtml(clawhub.origins?.length ?? 0)}</td></tr>
        </tbody>
      </table>
    </div>
    ${clawhubTable("Lock Entries", clawhub.entries ?? [])}
    ${clawhubTable("Origin Records", clawhub.origins ?? [])}
  </section>`;
}

function clawhubTable(title, entries) {
  if (entries.length === 0) {
    return "";
  }

  return `<div class="details" style="margin-top: 10px;">
    <h3>${escapeHtml(title)}</h3>
    <table>
      <thead><tr><th>Name</th><th>Version</th><th>Source</th><th>Skill directory</th></tr></thead>
      <tbody>
        ${entries.map((entry) => `<tr><td>${escapeHtml(entry.name)}</td><td>${escapeHtml(entry.version)}</td><td>${escapeHtml(entry.source)}</td><td>${escapeHtml(entry.skillDir)}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function dependenciesHtml(dependencies) {
  if (!dependencies?.manifests?.length && !dependencies?.lockfiles?.length) {
    return "";
  }

  return `<section>
    <h2>Dependencies</h2>
    <div class="details">
      <table>
        <tbody>
          <tr><th>Manifests</th><td>${escapeHtml(dependencies.manifests?.length ?? 0)}</td></tr>
          <tr><th>Lockfiles</th><td>${escapeHtml(dependencies.lockfiles?.length ?? 0)}</td></tr>
        </tbody>
      </table>
    </div>
    ${dependencyManifestTable(dependencies.manifests ?? [])}
    ${dependencyLockfileTable(dependencies.lockfiles ?? [])}
  </section>`;
}

function dependencyManifestTable(manifests) {
  if (manifests.length === 0) {
    return "";
  }

  return `<div class="details" style="margin-top: 10px;">
    <h3>Manifests</h3>
    <table>
      <thead><tr><th>File</th><th>Ecosystem</th><th>Dependencies</th><th>Scripts</th></tr></thead>
      <tbody>
        ${manifests.map((manifest) => `<tr><td>${escapeHtml(manifest.file)}</td><td>${escapeHtml(manifest.ecosystem)}</td><td>${escapeHtml(manifest.dependencyCount)}</td><td>${escapeHtml(manifest.scriptCount)}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function dependencyLockfileTable(lockfiles) {
  if (lockfiles.length === 0) {
    return "";
  }

  return `<div class="details" style="margin-top: 10px;">
    <h3>Lockfiles</h3>
    <table>
      <thead><tr><th>File</th><th>Ecosystem</th><th>Directory</th></tr></thead>
      <tbody>
        ${lockfiles.map((lockfile) => `<tr><td>${escapeHtml(lockfile.file)}</td><td>${escapeHtml(lockfile.ecosystem)}</td><td>${escapeHtml(lockfile.directory)}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function workspaceHtml(workspace) {
  if (!workspace?.skills?.length) {
    return "";
  }

  return `<section>
    <h2>Workspace Skills</h2>
    <div class="details">
      <table>
        <thead><tr><th>Name</th><th>Location</th><th>Precedence</th><th>Score</th><th>File</th></tr></thead>
        <tbody>
          ${workspace.skills.map((skill) => `<tr><td>${escapeHtml(skill.name)}</td><td>${escapeHtml(skill.locationKind)}</td><td>${escapeHtml(skill.precedence)}</td><td>${escapeHtml(skill.score)}</td><td>${escapeHtml(skill.skillFile)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    ${workspaceDuplicatesHtml(workspace.duplicates ?? [])}
  </section>`;
}

function workspaceDuplicatesHtml(duplicates) {
  if (duplicates.length === 0) {
    return "";
  }

  return `<div class="details" style="margin-top: 10px;">
    <table>
      <thead><tr><th>Duplicate name</th><th>Winner</th><th>Overridden</th></tr></thead>
      <tbody>
        ${duplicates.map((entry) => `<tr><td>${escapeHtml(entry.name)}</td><td>${escapeHtml(entry.winner)}</td><td>${escapeHtml(entry.overridden.join(", "))}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function optionsHtml(scanResult) {
  return `<section>
    <h2>Scan Details</h2>
    <div class="details">
      <table>
        <tbody>
          <tr><th>Files scanned</th><td>${escapeHtml(scanResult.filesScanned)}</td></tr>
          <tr><th>Files skipped</th><td>${escapeHtml(scanResult.filesSkipped)}</td></tr>
          <tr><th>Max file size</th><td>${escapeHtml(scanResult.options?.maxFileSizeBytes ?? "")} bytes</td></tr>
          <tr><th>Max findings per rule per file</th><td>${escapeHtml(scanResult.options?.maxFindingsPerRulePerFile ?? "")}</td></tr>
          <tr><th>Config path</th><td>${escapeHtml(scanResult.configPath ?? "none")}</td></tr>
        </tbody>
      </table>
    </div>
  </section>`;
}

function requiredActions(actions) {
  if (actions.length === 0) {
    return "";
  }

  return `<p class="recommendation">Required actions: ${escapeHtml(actions.join(", "))}</p>`;
}

function groupFindingsBySeverity(findings) {
  const grouped = Object.fromEntries(severityOrder.map((severity) => [severity, []]));

  for (const finding of findings) {
    if (!grouped[finding.severity]) {
      grouped[finding.severity] = [];
    }
    grouped[finding.severity].push(finding);
  }

  return grouped;
}

function className(value) {
  return String(value ?? "info").replace(/[^a-z0-9_-]/gi, "_");
}

function titleCase(value) {
  return String(value).slice(0, 1).toUpperCase() + String(value).slice(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
