const state = {
  lastResult: null,
  examples: []
};

const sampleSkill = `---
name: demo-weather-helper
description: Checks weather from an external API.
version: 0.1.0
author: ClawGuard Demo
category: productivity
metadata:
  openclaw:
    requires:
      env:
        - WEATHER_API_KEY
---

# Demo Weather Helper

Use WEATHER_API_KEY to call https://api.weather.example/status.
Keep the request read-only and do not install dependencies.`;

const elements = {
  policy: document.querySelector("#policy"),
  input: document.querySelector("#skill-input"),
  loadSample: document.querySelector("#load-sample"),
  scanPaste: document.querySelector("#scan-paste"),
  clearInput: document.querySelector("#clear-input"),
  folderInput: document.querySelector("#folder-input"),
  scanFolder: document.querySelector("#scan-folder"),
  folderStatus: document.querySelector("#folder-status"),
  examples: document.querySelector("#examples"),
  targetName: document.querySelector("#target-name"),
  sourcePill: document.querySelector("#source-pill"),
  score: document.querySelector("#score"),
  level: document.querySelector("#level"),
  decision: document.querySelector("#decision"),
  reason: document.querySelector("#reason"),
  installVerdict: document.querySelector("#install-verdict"),
  installMessage: document.querySelector("#install-message"),
  installCommand: document.querySelector("#install-command"),
  approvalTitle: document.querySelector("#approval-title"),
  approvalSummary: document.querySelector("#approval-summary"),
  approvalCommand: document.querySelector("#approval-command"),
  demoCommand: document.querySelector("#demo-command"),
  actions: document.querySelector("#actions"),
  critical: document.querySelector("#critical-count"),
  high: document.querySelector("#high-count"),
  medium: document.querySelector("#medium-count"),
  low: document.querySelector("#low-count"),
  files: document.querySelector("#files-count"),
  workspace: document.querySelector("#workspace-count"),
  clawhub: document.querySelector("#clawhub-count"),
  dependencies: document.querySelector("#dependency-count"),
  findings: document.querySelector("#findings"),
  downloadHtml: document.querySelector("#download-html"),
  copyJson: document.querySelector("#copy-json")
};

init();

async function init() {
  bindEvents();
  await loadExamples();
}

function bindEvents() {
  elements.loadSample.addEventListener("click", () => {
    elements.input.value = sampleSkill;
  });

  elements.clearInput.addEventListener("click", () => {
    elements.input.value = "";
    elements.input.focus();
  });

  elements.scanPaste.addEventListener("click", async () => {
    await scanPaste();
  });

  elements.folderInput.addEventListener("change", () => {
    const files = [...elements.folderInput.files];
    elements.scanFolder.disabled = files.length === 0;
    elements.folderStatus.textContent = files.length === 0 ? "Choose a local folder to scan its files." : `${files.length} files selected`;
  });

  elements.scanFolder.addEventListener("click", async () => {
    await scanFolder();
  });

  elements.copyJson.addEventListener("click", async () => {
    if (!state.lastResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.lastResult.scan, null, 2));
      setCopyButtonText("Copied");
    } catch {
      setCopyButtonText("Copy failed");
    }
  });

  elements.downloadHtml.addEventListener("click", async () => {
    if (!state.lastResult) return;
    try {
      const response = await fetch("/api/html-report", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          scan: state.lastResult.scan
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Report export failed");
      }

      const html = await response.text();
      downloadText(`${safeFilename(state.lastResult.displayTarget)}-clawguard.html`, html, "text/html");
      setDownloadButtonText("Downloaded");
    } catch {
      setDownloadButtonText("Export failed");
    }
  });
}

async function loadExamples() {
  try {
    const data = await fetchJson("/api/examples");
    state.examples = data.examples ?? [];
    renderExamples();
  } catch (error) {
    elements.examples.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderExamples() {
  elements.examples.innerHTML = state.examples.map((example) => `
    <button class="example-card" type="button" data-example="${escapeHtml(example.id)}">
      <strong>${escapeHtml(example.label)}</strong>
      <p>${escapeHtml(example.description)}</p>
    </button>
  `).join("");

  for (const button of elements.examples.querySelectorAll("[data-example]")) {
    button.addEventListener("click", async () => {
      await scanExample(button.dataset.example);
    });
  }
}

async function scanPaste() {
  setBusy(true);
  try {
    const result = await fetchJson("/api/scan", {
      method: "POST",
      body: JSON.stringify({
        text: elements.input.value,
        filename: "SKILL.md",
        policy: elements.policy.value
      })
    });
    renderResult(result);
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
  }
}

async function scanExample(example) {
  setBusy(true);
  try {
    const result = await fetchJson("/api/scan-example", {
      method: "POST",
      body: JSON.stringify({
        example,
        policy: elements.policy.value
      })
    });
    renderResult(result);
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
  }
}

async function scanFolder() {
  const selectedFiles = [...elements.folderInput.files];
  if (selectedFiles.length === 0) {
    renderError(new Error("Choose a folder before scanning."));
    return;
  }

  setBusy(true);
  try {
    const files = await readSelectedFiles(selectedFiles);
    const result = await fetchJson("/api/scan-files", {
      method: "POST",
      body: JSON.stringify({
        files,
        label: folderLabelFor(selectedFiles),
        policy: elements.policy.value
      })
    });
    renderResult(result);
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
  }
}

function renderResult(result) {
  state.lastResult = result;
  const scan = result.scan;
  const summary = scan.summary ?? {};
  const policy = scan.policy ?? {};
  const level = scan.level ?? "info";

  document.body.className = `level-${level}`;
  elements.targetName.textContent = result.displayTarget ?? scan.target ?? "Scan result";
  elements.sourcePill.textContent = result.source ?? "scan";
  elements.score.textContent = scan.score ?? 0;
  elements.level.textContent = level;
  elements.decision.textContent = displayLabel(policy.decision ?? "allow");
  elements.reason.textContent = policy.reason ?? "";
  elements.critical.textContent = summary.critical ?? 0;
  elements.high.textContent = summary.high ?? 0;
  elements.medium.textContent = summary.medium ?? 0;
  elements.low.textContent = summary.low ?? 0;
  elements.files.textContent = scan.filesScanned ?? 0;
  elements.workspace.textContent = scan.workspace?.skills?.length ?? 0;
  elements.clawhub.textContent = scan.clawhub?.entries?.length ?? 0;
  elements.dependencies.textContent = scan.dependencies?.manifests?.length ?? 0;
  elements.actions.innerHTML = (policy.requiredActions ?? []).map((action) => `<span class="tag">${escapeHtml(displayLabel(action))}</span>`).join("");
  elements.copyJson.textContent = "Copy JSON";
  elements.copyJson.disabled = false;
  elements.downloadHtml.textContent = "Download HTML";
  elements.downloadHtml.disabled = false;

  renderInstallGate(result);
  renderApprovalFlow(result);
  renderFindings(scan.findings ?? []);
}

function renderInstallGate(result) {
  const scan = result.scan;
  const policy = scan.policy ?? {};
  const decision = policy.decision ?? "allow";
  const target = installTargetFor(result);
  const installName = safeInstallName(result.displayTarget ?? "skill");
  const command = `npx @denial-web/clawguard install ${target} --to ./.agents/skills --name ${installName} --policy ${policy.preset ?? elements.policy.value}`;

  elements.installCommand.textContent = command;

  if (decision === "allow") {
    elements.installVerdict.textContent = "Install allowed";
    elements.installMessage.textContent = "ClawGuard would copy this skill into the destination after the policy gate passes.";
    return;
  }

  if (decision === "block") {
    elements.installVerdict.textContent = "Install blocked";
    elements.installMessage.textContent = "ClawGuard would stop before copying files. Review the findings before trusting this skill.";
    return;
  }

  elements.installVerdict.textContent = "Install paused";
  elements.installMessage.textContent = "ClawGuard would require review, sandboxing, or approval before copying files.";
}

function renderApprovalFlow(result) {
  const scan = result.scan;
  const policy = scan.policy ?? {};
  const decision = policy.decision ?? "allow";
  const target = installTargetFor(result);
  const installName = safeInstallName(result.displayTarget ?? "skill");
  const preset = policy.preset ?? elements.policy.value;
  const framework = "openclaw";

  elements.demoCommand.textContent = "npx @denial-web/clawguard approvals demo-flow --keep";
  elements.approvalCommand.textContent = [
    "npx",
    "@denial-web/clawguard",
    framework,
    "install",
    target,
    "--to",
    "./.agents/skills",
    "--name",
    installName,
    "--policy",
    preset,
    "--approval-out",
    "./.clawguard/approvals.jsonl",
    "--approval-mode",
    "always"
  ].join(" ");

  if (decision === "allow") {
    elements.approvalTitle.textContent = "Approval can still be required";
    elements.approvalSummary.textContent = "Even a clean scan can pause before trust when you use approval-mode always. That gives the owner final control over autonomous skill installs.";
    return;
  }

  if (decision === "block") {
    elements.approvalTitle.textContent = "Blocked before trust";
    elements.approvalSummary.textContent = "A blocked result should not be copied into a trusted skill folder. Send the report to the owner instead of applying the install.";
    return;
  }

  elements.approvalTitle.textContent = "Pause and ask the owner";
  elements.approvalSummary.textContent = "Warn, review, sandbox, and dual-approval decisions create a pending approval request before any files are copied into the trusted skill folder.";
}

function renderFindings(findings) {
  if (findings.length === 0) {
    elements.findings.className = "findings empty-state";
    elements.findings.textContent = "No risky patterns detected.";
    return;
  }

  elements.findings.className = "findings";
  elements.findings.innerHTML = findings.map((finding) => `
    <article class="finding-card">
      <div class="finding-top">
        <div>
          <h3>${escapeHtml(finding.title)}</h3>
          <div class="location">${escapeHtml(finding.file)}:${escapeHtml(finding.line)}</div>
        </div>
        <span class="severity ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span>
      </div>
      <div class="evidence">${escapeHtml(finding.evidence)}</div>
      <p class="recommendation">${escapeHtml(finding.recommendation)}</p>
    </article>
  `).join("");
}

function renderError(error) {
  elements.findings.className = "findings empty-state";
  elements.findings.textContent = error.message;
}

function setBusy(isBusy) {
  elements.scanPaste.disabled = isBusy;
  elements.scanFolder.disabled = isBusy || elements.folderInput.files.length === 0;
  elements.downloadHtml.disabled = isBusy || !state.lastResult;
  for (const button of elements.examples.querySelectorAll("button")) {
    button.disabled = isBusy;
  }
}

async function readSelectedFiles(files) {
  if (files.length > 200) {
    throw new Error("Folder has too many files for the demo scanner.");
  }

  const output = [];
  let totalBytes = 0;

  for (const file of files) {
    if (file.size > 512 * 1024) {
      continue;
    }

    totalBytes += file.size;
    if (totalBytes > 1024 * 1024) {
      throw new Error("Folder content is too large for the demo scanner.");
    }

    output.push({
      path: file.webkitRelativePath || file.name,
      text: await file.text()
    });
  }

  return output;
}

function folderLabelFor(files) {
  const firstPath = files[0]?.webkitRelativePath ?? "";
  return firstPath.split("/")[0] || "Uploaded folder";
}

function setCopyButtonText(text) {
  elements.copyJson.textContent = text;
  window.setTimeout(() => {
    elements.copyJson.textContent = "Copy JSON";
  }, 1200);
}

function setDownloadButtonText(text) {
  elements.downloadHtml.textContent = text;
  window.setTimeout(() => {
    elements.downloadHtml.textContent = "Download HTML";
  }, 1200);
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(value) {
  return String(value || "scan")
    .replace(/[^A-Za-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "scan";
}

function safeInstallName(value) {
  return String(value || "skill")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "skill";
}

function installTargetFor(result) {
  if (result.source === "example" && result.example?.path) {
    return result.example.path;
  }

  if (result.source === "folder") {
    return "./uploaded-skill";
  }

  return "./pasted-skill";
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "content-type": "application/json"
    },
    ...options
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayLabel(value) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
