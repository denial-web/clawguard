const state = {
  lastResult: null,
  lastRunPlan: null,
  examples: [],
  sopDemos: [],
  lastSopResult: null,
  dashboard: null,
  setupState: null,
  setupPreview: null,
  setupAssets: [],
  setupAutonomy: {
    preset: "developer",
    overrides: {}
  }
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
  setupMode: document.querySelector("#setup-mode"),
  setupStatus: document.querySelector("#setup-status"),
  setupGoal: document.querySelector("#setup-goal"),
  setupProfile: document.querySelector("#setup-profile"),
  setupDefaultProtected: document.querySelector("#setup-default-protected"),
  setupAssetPath: document.querySelector("#setup-asset-path"),
  setupAssetType: document.querySelector("#setup-asset-type"),
  setupAssetDecision: document.querySelector("#setup-asset-decision"),
  setupAddAsset: document.querySelector("#setup-add-asset"),
  setupPreview: document.querySelector("#setup-preview"),
  setupApply: document.querySelector("#setup-apply"),
  setupAssets: document.querySelector("#setup-assets"),
  setupAutonomyTools: document.querySelector("#setup-autonomy-tools"),
  setupDbCheck: document.querySelector("#setup-db-check"),
  setupOutput: document.querySelector("#setup-output"),
  input: document.querySelector("#skill-input"),
  loadSample: document.querySelector("#load-sample"),
  scanPaste: document.querySelector("#scan-paste"),
  clearInput: document.querySelector("#clear-input"),
  folderInput: document.querySelector("#folder-input"),
  scanFolder: document.querySelector("#scan-folder"),
  folderStatus: document.querySelector("#folder-status"),
  generateRunPlan: document.querySelector("#generate-run-plan"),
  taskInput: document.querySelector("#task-input"),
  templateProfile: document.querySelector("#template-profile"),
  privacy: document.querySelector("#privacy"),
  toolRisk: document.querySelector("#tool-risk"),
  inputTokens: document.querySelector("#input-tokens"),
  outputTokens: document.querySelector("#output-tokens"),
  examples: document.querySelector("#examples"),
  sopMode: document.querySelector("#sop-mode"),
  sopDemos: document.querySelector("#sop-demos"),
  targetName: document.querySelector("#target-name"),
  sourcePill: document.querySelector("#source-pill"),
  score: document.querySelector("#score"),
  level: document.querySelector("#level"),
  decision: document.querySelector("#decision"),
  reason: document.querySelector("#reason"),
  installVerdict: document.querySelector("#install-verdict"),
  installMessage: document.querySelector("#install-message"),
  installCommand: document.querySelector("#install-command"),
  runPlanVerdict: document.querySelector("#run-plan-verdict"),
  runPlanSummary: document.querySelector("#run-plan-summary"),
  planSkillDecision: document.querySelector("#plan-skill-decision"),
  planModelProfile: document.querySelector("#plan-model-profile"),
  planBudget: document.querySelector("#plan-budget"),
  runPlanCommand: document.querySelector("#run-plan-command"),
  routingSignals: document.querySelector("#routing-signals"),
  approvalTitle: document.querySelector("#approval-title"),
  approvalSummary: document.querySelector("#approval-summary"),
  approvalCommand: document.querySelector("#approval-command"),
  demoCommand: document.querySelector("#demo-command"),
  refreshDashboard: document.querySelector("#refresh-dashboard"),
  dashboardTitle: document.querySelector("#dashboard-title"),
  dashboardSummary: document.querySelector("#dashboard-summary"),
  dashPending: document.querySelector("#dash-pending"),
  dashAudit: document.querySelector("#dash-audit"),
  dashMemory: document.querySelector("#dash-memory"),
  dashBridge: document.querySelector("#dash-bridge"),
  dashApprovals: document.querySelector("#dash-approvals"),
  dashAuditEvents: document.querySelector("#dash-audit-events"),
  dashMemoryList: document.querySelector("#dash-memory-list"),
  dashBridgeList: document.querySelector("#dash-bridge-list"),
  sopVerdict: document.querySelector("#sop-verdict"),
  sopSummary: document.querySelector("#sop-summary"),
  sopMissing: document.querySelector("#sop-missing-count"),
  sopApprovals: document.querySelector("#sop-approval-count"),
  sopThresholds: document.querySelector("#sop-threshold-count"),
  sopBlocked: document.querySelector("#sop-blocked-count"),
  sopCommand: document.querySelector("#sop-command"),
  sopFindings: document.querySelector("#sop-findings"),
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
  await loadSetupState();
  await loadExamples();
  await loadSopDemos();
  await refreshDashboard();
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

  elements.generateRunPlan.addEventListener("click", async () => {
    await generateRunPlan();
  });

  elements.refreshDashboard.addEventListener("click", async () => {
    await refreshDashboard();
  });

  elements.setupAddAsset.addEventListener("click", () => {
    addSetupAsset();
  });

  elements.setupPreview.addEventListener("click", async () => {
    await previewSetup();
  });

  elements.setupApply.addEventListener("click", async () => {
    await applySetup();
  });

  for (const button of document.querySelectorAll("[data-autonomy-preset]")) {
    button.addEventListener("click", () => {
      state.setupAutonomy.preset = button.dataset.autonomyPreset;
      state.setupPreview = null;
      elements.setupApply.disabled = true;
      renderAutonomyTools();
    });
  }

  for (const input of [elements.setupGoal, elements.setupProfile, elements.setupDefaultProtected]) {
    input.addEventListener("change", () => {
      if (input === elements.setupProfile) {
        state.setupAutonomy.preset = elements.setupProfile.value;
      }
      state.setupPreview = null;
      elements.setupApply.disabled = true;
      renderSetupAssets();
      renderAutonomyTools();
    });
  }

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

async function refreshDashboard() {
  setDashboardBusy(true);
  try {
    const dashboard = await fetchJson("/api/agent-dashboard");
    state.dashboard = dashboard;
    renderDashboard(dashboard);
  } catch (error) {
    renderDashboardError(error);
  } finally {
    setDashboardBusy(false);
  }
}

async function loadSetupState() {
  try {
    const setupState = await fetchJson("/api/setup-state");
    state.setupState = setupState;
    renderSetupState(setupState);
  } catch (error) {
    elements.setupMode.textContent = "error";
    elements.setupStatus.textContent = error.message;
  }
}

function renderSetupState(setupState) {
  elements.setupMode.textContent = setupState.setupWritesEnabled ? "guided apply" : "preview only";
  elements.setupStatus.textContent = `${setupState.version} · ${setupState.configExists ? "config found" : "no config yet"} · ${setupState.workspace}`;
  elements.setupApply.disabled = !setupState.setupWritesEnabled || !state.setupPreview;
  state.setupAutonomy = {
    preset: setupState.toolAutonomy?.preset ?? "developer",
    overrides: { ...(setupState.toolAutonomy?.overrides ?? {}) }
  };
  renderAutonomyTools();
}

function setupPayload() {
  return {
    goal: elements.setupGoal.value,
    profile: elements.setupProfile.value,
    toolAutonomy: state.setupAutonomy,
    protectedAssets: {
      enabled: true,
      defaultPatterns: elements.setupDefaultProtected.checked,
      assets: state.setupAssets
    }
  };
}

function renderAutonomyTools() {
  if (!elements.setupAutonomyTools) return;
  const tools = state.setupState?.autonomyTools ?? [];
  const safeTools = tools.filter((tool) => tool.eligible && !tool.locked).slice(0, 10);
  if (safeTools.length === 0) {
    elements.setupAutonomyTools.className = "setup-list empty-state";
    elements.setupAutonomyTools.textContent = "No eligible autonomy tools found.";
    return;
  }

  elements.setupAutonomyTools.className = "setup-list";
  elements.setupAutonomyTools.innerHTML = [
    `<article class="setup-item autonomy-presets"><strong>Preset</strong><span>${escapeHtml(displayLabel(state.setupAutonomy.preset))}</span></article>`,
    ...safeTools.map((tool) => {
      const mode = state.setupAutonomy.overrides[tool.tool] ?? presetModeForFamily(state.setupAutonomy.preset, tool.family, tool.mode);
      return `
        <article class="setup-item autonomy-row">
          <div>
            <strong>${escapeHtml(tool.tool)}</strong>
            <p>${escapeHtml(tool.description ?? tool.reason ?? "")}</p>
          </div>
          <select data-tool-autonomy="${escapeHtml(tool.tool)}" aria-label="${escapeHtml(tool.tool)} autonomy">
            <option value="auto"${mode === "auto" ? " selected" : ""}>Auto</option>
            <option value="approval"${mode === "approval" ? " selected" : ""}>Approval</option>
            <option value="block"${mode === "block" ? " selected" : ""}>Block</option>
          </select>
        </article>
      `;
    }),
    ...tools.filter((tool) => tool.locked).slice(0, 6).map((tool) => `
      <article class="setup-item autonomy-row locked">
        <div>
          <strong>${escapeHtml(tool.tool)}</strong>
          <p>${escapeHtml(tool.reason)}</p>
        </div>
        <span class="pill">${tool.mode === "block" ? "Block locked" : "Approval locked"}</span>
      </article>
    `)
  ].join("");

  for (const select of elements.setupAutonomyTools.querySelectorAll("[data-tool-autonomy]")) {
    select.addEventListener("change", () => {
      state.setupAutonomy.overrides[select.dataset.toolAutonomy] = select.value;
      state.setupPreview = null;
      elements.setupApply.disabled = true;
    });
  }
}

function presetModeForFamily(preset, family, fallback) {
  const modes = {
    personal: {
      "local-read": "auto",
      "git-read": "auto",
      "memory-read": "auto",
      "web-read": "auto",
      "github-read": "auto",
      "github-draft": "auto",
      "bridge-dry-run": "auto",
      "dry-run": "auto",
      delegate: "approval"
    },
    developer: {
      "local-read": "auto",
      "git-read": "auto",
      "memory-read": "auto",
      "web-read": "auto",
      "github-read": "auto",
      "github-draft": "auto",
      "bridge-dry-run": "auto",
      "dry-run": "auto",
      delegate: "auto"
    },
    business: {
      "local-read": "auto",
      "git-read": "auto",
      "memory-read": "auto",
      "web-read": "approval",
      "github-read": "approval",
      "github-draft": "approval",
      "bridge-dry-run": "approval",
      "dry-run": "auto",
      delegate: "approval"
    },
    strict: {}
  };
  if (preset === "strict") {
    return "approval";
  }
  return modes[preset]?.[family] ?? fallback ?? "approval";
}

function addSetupAsset() {
  const assetPath = elements.setupAssetPath.value.trim();
  if (!assetPath) {
    elements.setupOutput.textContent = "Add a relative protected path first.";
    elements.setupOutput.classList.add("empty-state");
    return;
  }

  const id = assetPath
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `asset-${state.setupAssets.length + 1}`;

  state.setupAssets.push({
    id,
    type: elements.setupAssetType.value,
    path: assetPath,
    operations: ["read", "write", "execute", "cleanup"],
    decision: elements.setupAssetDecision.value,
    reason: `Protected by setup UI: ${assetPath}`
  });
  elements.setupAssetPath.value = "";
  state.setupPreview = null;
  elements.setupApply.disabled = true;
  renderSetupAssets();
}

function renderSetupAssets() {
  if (state.setupAssets.length === 0) {
    elements.setupAssets.className = "setup-list empty-state";
    elements.setupAssets.textContent = "No custom protected assets.";
    return;
  }

  elements.setupAssets.className = "setup-list";
  elements.setupAssets.innerHTML = state.setupAssets.map((asset, index) => `
    <article class="setup-item">
      <div>
        <strong>${escapeHtml(asset.path)}</strong>
        <p>${escapeHtml(displayLabel(asset.type))} · ${escapeHtml(displayLabel(asset.decision))}</p>
      </div>
      <button class="ghost" type="button" data-remove-asset="${index}">Remove</button>
    </article>
  `).join("");

  for (const button of elements.setupAssets.querySelectorAll("[data-remove-asset]")) {
    button.addEventListener("click", () => {
      state.setupAssets.splice(Number(button.dataset.removeAsset), 1);
      state.setupPreview = null;
      elements.setupApply.disabled = true;
      renderSetupAssets();
    });
  }
}

async function previewSetup() {
  setSetupBusy(true);
  try {
    const preview = await fetchJson("/api/setup-preview", {
      method: "POST",
      body: JSON.stringify(setupPayload())
    });
    const protectedCheck = await fetchJson("/api/setup-protected-check", {
      method: "POST",
      body: JSON.stringify({
        ...setupPayload(),
        argv: ["psql", "-c", "DROP DATABASE prod"]
      })
    });
    state.setupPreview = preview;
    renderSetupPreview(preview, protectedCheck);
    elements.setupApply.disabled = !state.setupState?.setupWritesEnabled;
  } catch (error) {
    renderSetupError(error);
  } finally {
    setSetupBusy(false);
  }
}

async function applySetup() {
  if (!state.setupPreview) {
    await previewSetup();
    if (!state.setupPreview) return;
  }

  setSetupBusy(true);
  try {
    const result = await fetchJson("/api/setup-apply", {
      method: "POST",
      body: JSON.stringify({
        ...setupPayload(),
        confirm: "APPLY"
      })
    });
    renderSetupApply(result);
    await loadSetupState();
    await refreshDashboard();
  } catch (error) {
    renderSetupError(error);
  } finally {
    setSetupBusy(false);
  }
}

function renderSetupPreview(preview, protectedCheck) {
  const fileRows = preview.files.map((file) => `${file.action}: ${file.path}`).join("\n");
  const commandRows = preview.commands.map((command) => `> ${command}`).join("\n");
  elements.setupOutput.className = "setup-output";
  elements.setupOutput.textContent = [
    `Workspace: ${preview.workspace}`,
    `Goal: ${displayLabel(preview.goal)} / ${displayLabel(preview.profile)}`,
    `Protected DB check: ${displayLabel(protectedCheck.decision)} (${protectedCheck.risk})`,
    "",
    "Files:",
    fileRows,
    "",
    "Next commands:",
    commandRows
  ].join("\n");
}

function renderSetupApply(result) {
  elements.setupOutput.className = "setup-output";
  elements.setupOutput.textContent = [
    "Setup applied.",
    `Config: ${result.configPath}`,
    `Workspace: ${result.workspace}`,
    "",
    "Next commands:",
    ...result.commands.map((command) => `> ${command}`)
  ].join("\n");
}

function renderSetupError(error) {
  elements.setupOutput.className = "setup-output empty-state";
  elements.setupOutput.textContent = error.message;
}

function setSetupBusy(isBusy) {
  elements.setupPreview.disabled = isBusy;
  elements.setupAddAsset.disabled = isBusy;
  elements.setupApply.disabled = isBusy || !state.setupState?.setupWritesEnabled || !state.setupPreview;
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

async function loadSopDemos() {
  try {
    const data = await fetchJson("/api/sop-packs");
    state.sopDemos = data.demos ?? [];
    renderSopDemos();
  } catch (error) {
    elements.sopDemos.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
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

function renderSopDemos() {
  elements.sopDemos.innerHTML = state.sopDemos.map((demo) => `
    <article class="sop-demo-card">
      <div>
        <strong>${escapeHtml(demo.label)}</strong>
        <p>${escapeHtml(demo.description)}</p>
      </div>
      <button type="button" data-sop-demo="${escapeHtml(demo.id)}">Run</button>
    </article>
  `).join("");

  for (const button of elements.sopDemos.querySelectorAll("[data-sop-demo]")) {
    button.addEventListener("click", async () => {
      await runSopDemo(button.dataset.sopDemo);
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

async function runSopDemo(demo) {
  setBusy(true);
  try {
    const result = await fetchJson("/api/sop-check", {
      method: "POST",
      body: JSON.stringify({
        demo,
        mode: elements.sopMode.value
      })
    });
    renderSopResult(result);
  } catch (error) {
    renderSopError(error);
  } finally {
    setBusy(false);
  }
}

function renderResult(result) {
  state.lastResult = result;
  state.lastRunPlan = null;
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
  elements.generateRunPlan.disabled = false;

  renderInstallGate(result);
  renderRunPlanPlaceholder(result);
  renderApprovalFlow(result);
  renderFindings(scan.findings ?? []);
}

function renderSopResult(result) {
  state.lastSopResult = result;
  const check = result.check ?? {};
  const decision = check.decision ?? "manual_review";
  const missing = check.missingEvidence ?? [];
  const approvals = check.approvalFindings ?? [];
  const thresholds = check.thresholdFindings ?? [];
  const blocked = check.blockedActions ?? [];
  const requiredActions = check.requiredActions ?? [];
  const totalProblems = missing.length + approvals.length + thresholds.length + blocked.length;

  elements.sopVerdict.textContent = `${result.demo?.label ?? "SOP"}: ${displayLabel(decision)}`;
  elements.sopSummary.textContent = totalProblems === 0
    ? "All required evidence, thresholds, and approvals are present. ClawGuard would allow the agent to mark this workflow complete."
    : `ClawGuard found ${totalProblems} issue${totalProblems === 1 ? "" : "s"} before this workflow can be completed. Required actions: ${requiredActions.map(displayLabel).join(", ") || "review"}.`;
  elements.sopMissing.textContent = missing.length;
  elements.sopApprovals.textContent = approvals.length;
  elements.sopThresholds.textContent = thresholds.length;
  elements.sopBlocked.textContent = blocked.length;
  elements.sopCommand.textContent = result.command ?? "npx --package @denial-web/clawguard clawguard sop list";
  renderSopFindings({ missing, approvals, thresholds, blocked });
}

function renderSopFindings(result) {
  const sections = [
    ["Missing Evidence", result.missing],
    ["Approval Findings", result.approvals],
    ["Threshold Findings", result.thresholds],
    ["Blocked Actions", result.blocked]
  ].filter(([, items]) => items.length > 0);

  if (sections.length === 0) {
    elements.sopFindings.className = "sop-findings empty-state";
    elements.sopFindings.textContent = "No SOP problems detected.";
    return;
  }

  elements.sopFindings.className = "sop-findings";
  elements.sopFindings.innerHTML = sections.map(([title, items]) => `
    <section class="sop-finding-section">
      <h3>${escapeHtml(title)}</h3>
      ${items.map((item) => `
        <article class="sop-finding-card">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.reason ?? item.recommendation ?? "Review before completing this workflow.")}</p>
          </div>
          <span class="severity ${escapeHtml(item.severity ?? "medium")}">${escapeHtml(item.severity ?? "medium")}</span>
        </article>
      `).join("")}
    </section>
  `).join("");
}

async function generateRunPlan() {
  if (!state.lastResult) {
    renderError(new Error("Run a scan before generating a run plan."));
    return;
  }

  setBusy(true);
  try {
    const result = state.lastResult;
    const plan = await fetchJson("/api/run-plan", {
      method: "POST",
      body: JSON.stringify({
        scan: result.scan,
        displayTarget: result.displayTarget,
        source: result.source,
        framework: "openclaw",
        profile: elements.templateProfile.value,
        task: elements.taskInput.value,
        privacy: elements.privacy.value,
        toolRisk: elements.toolRisk.value,
        inputTokens: elements.inputTokens.value,
        outputTokens: elements.outputTokens.value
      })
    });

    state.lastRunPlan = plan;
    renderRunPlan(plan);
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false);
  }
}

function renderInstallGate(result) {
  const scan = result.scan;
  const policy = scan.policy ?? {};
  const decision = policy.decision ?? "allow";
  const target = installTargetFor(result);
  const installName = safeInstallName(result.displayTarget ?? "skill");
  const command = `npx --package @denial-web/clawguard clawguard install ${target} --to ./.agents/skills --name ${installName} --policy ${policy.preset ?? elements.policy.value}`;

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

function renderRunPlanPlaceholder(result) {
  const target = installTargetFor(result);
  const task = safeCommandText(elements.taskInput.value || "Install and run this skill");

  elements.runPlanVerdict.textContent = "Ready to plan";
  elements.runPlanSummary.textContent = "Generate the run plan to combine the skill gate with model and budget routing.";
  elements.planSkillDecision.textContent = displayLabel(result.scan.policy?.decision ?? "allow");
  elements.planModelProfile.textContent = "pending";
  elements.planBudget.textContent = "pending";
  elements.runPlanCommand.textContent = [
    "npx --package @denial-web/clawguard clawguard run-plan",
    `--skill ${target}`,
    `--task "${task}"`,
    `--privacy ${elements.privacy.value}`,
    `--tool-risk ${elements.toolRisk.value}`,
    `--input-tokens ${numberOrFallback(elements.inputTokens.value, 12000)}`,
    `--output-tokens ${numberOrFallback(elements.outputTokens.value, 2000)}`
  ].join(" ");
  elements.routingSignals.innerHTML = "";
}

function renderRunPlan(plan) {
  const model = plan.modelRecommendation ?? {};
  const budget = model.budget;
  const target = installTargetFor(state.lastResult);
  const task = safeCommandText(model.task?.text || elements.taskInput.value || "Install and run this skill");

  elements.runPlanVerdict.textContent = `Decision: ${displayLabel(plan.decision)}`;
  elements.runPlanSummary.textContent = plan.requiredActions?.length
    ? `Required actions: ${plan.requiredActions.map(displayLabel).join(", ")}.`
    : model.reason ?? "Run plan is within configured policy.";
  elements.planSkillDecision.textContent = displayLabel(plan.skill?.decision ?? "allow");
  elements.planModelProfile.textContent = `${displayLabel(model.recommendedProfile ?? "none")} / ${model.recommendedModel ?? "not configured"}`;
  elements.planBudget.textContent = budget
    ? `${displayLabel(budget.decision)} $${formatUsd(budget.cost?.estimatedUsd ?? 0)}`
    : "not priced";
  elements.runPlanCommand.textContent = [
    "npx --package @denial-web/clawguard clawguard run-plan",
    `--config .clawguard.json`,
    `--skill ${target}`,
    `--task "${task}"`,
    `--privacy ${model.task?.privacy ?? elements.privacy.value}`,
    `--tool-risk ${model.task?.toolRisk ?? elements.toolRisk.value}`,
    `--input-tokens ${model.task?.inputTokens ?? numberOrFallback(elements.inputTokens.value, 12000)}`,
    `--output-tokens ${model.task?.outputTokens ?? numberOrFallback(elements.outputTokens.value, 2000)}`
  ].join(" ");

  elements.routingSignals.innerHTML = (model.signals ?? []).slice(0, 5).map((signal) => `
    <span>${escapeHtml(displayLabel(signal.profile))} +${escapeHtml(signal.weight)} · ${escapeHtml(signal.reason)}</span>
  `).join("");
}

function renderApprovalFlow(result) {
  const scan = result.scan;
  const policy = scan.policy ?? {};
  const decision = policy.decision ?? "allow";
  const target = installTargetFor(result);
  const installName = safeInstallName(result.displayTarget ?? "skill");
  const preset = policy.preset ?? elements.policy.value;
  const framework = "openclaw";

  elements.demoCommand.textContent = "npx --package @denial-web/clawguard clawguard approvals demo-flow --keep";
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

function renderDashboard(dashboard) {
  const summary = dashboard.summary ?? {};
  const bridge = dashboard.agent?.bridge ?? {};

  elements.dashboardTitle.textContent = dashboard.configPath ? "Configured Agent Workspace" : "Default Agent Workspace";
  elements.dashboardSummary.textContent = `Workspace: ${dashboard.workspace}`;
  elements.dashPending.textContent = summary.pendingApprovals ?? 0;
  elements.dashAudit.textContent = summary.auditEvents ?? 0;
  elements.dashMemory.textContent = summary.memory ?? 0;
  elements.dashBridge.textContent = bridge.enabled ? "on" : "off";
  renderDashboardList(elements.dashApprovals, dashboard.approvals ?? [], renderApprovalItem, "No approval records yet.");
  renderDashboardList(elements.dashAuditEvents, dashboard.audit?.events ?? [], renderAuditItem, "No audit events yet.");
  renderDashboardList(elements.dashMemoryList, dashboard.memory ?? [], renderMemoryItem, "No memory records yet.");
  renderDashboardList(elements.dashBridgeList, bridgeRows(dashboard), renderBridgeItem, "No bridge state yet.");
}

function renderDashboardList(container, items, renderer, emptyText) {
  if (items.length === 0) {
    container.className = "dashboard-list empty-state";
    container.textContent = emptyText;
    return;
  }

  container.className = "dashboard-list";
  container.innerHTML = items.map(renderer).join("");
}

function renderApprovalItem(approval) {
  return `
    <article class="dashboard-item">
      <div>
        <strong>${escapeHtml(approval.tool ?? "approval")}</strong>
        <p>${escapeHtml(approval.reason ?? approval.target ?? approval.id)}</p>
      </div>
      <span class="status-badge">${escapeHtml(displayLabel(approval.status ?? approval.decision ?? "pending"))}</span>
    </article>
  `;
}

function renderAuditItem(event) {
  return `
    <article class="dashboard-item">
      <div>
        <strong>${escapeHtml(event.type ?? "audit")}</strong>
        <p>${escapeHtml(event.createdAt ?? event.id ?? "")}</p>
      </div>
      <span class="status-badge">${escapeHtml(event.hash ? "chained" : "event")}</span>
    </article>
  `;
}

function renderMemoryItem(memory) {
  return `
    <article class="dashboard-item">
      <div>
        <strong>${escapeHtml(displayLabel(memory.type ?? "memory"))}</strong>
        <p>${escapeHtml(memory.content ?? "")}</p>
      </div>
      <span class="status-badge">${memory.sensitive ? "sensitive" : escapeHtml(memory.scope ?? "workspace")}</span>
    </article>
  `;
}

function renderBridgeItem(item) {
  return `
    <article class="dashboard-item">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      <span class="status-badge">${escapeHtml(item.status)}</span>
    </article>
  `;
}

function bridgeRows(dashboard) {
  const bridge = dashboard.agent?.bridge ?? {};
  const spec = dashboard.bridge?.spec ?? {};
  return [
    {
      title: "Bridge Execution",
      detail: bridge.enabled ? "Read-only bridge execution is enabled for supported proposal tools." : "Bridge execution is disabled by default.",
      status: bridge.enabled ? "enabled" : "disabled"
    },
    {
      title: "Driver",
      detail: `Configured driver: ${bridge.driver ?? "fetch"}`,
      status: bridge.mode ?? "dry-run"
    },
    {
      title: "Supported Tools",
      detail: (spec.executionContract?.supportedInternalExecutionTools ?? ["browser.open", "browser.extract"]).join(", "),
      status: "read-only"
    }
  ];
}

function renderDashboardError(error) {
  elements.dashboardTitle.textContent = "Dashboard unavailable";
  elements.dashboardSummary.textContent = error.message;
  for (const element of [elements.dashApprovals, elements.dashAuditEvents, elements.dashMemoryList, elements.dashBridgeList]) {
    element.className = "dashboard-list empty-state";
    element.textContent = error.message;
  }
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

function renderSopError(error) {
  elements.sopFindings.className = "sop-findings empty-state";
  elements.sopFindings.textContent = error.message;
}

function setBusy(isBusy) {
  elements.scanPaste.disabled = isBusy;
  elements.scanFolder.disabled = isBusy || elements.folderInput.files.length === 0;
  elements.downloadHtml.disabled = isBusy || !state.lastResult;
  elements.generateRunPlan.disabled = isBusy || !state.lastResult;
  for (const button of elements.examples.querySelectorAll("button")) {
    button.disabled = isBusy;
  }
  for (const button of elements.sopDemos.querySelectorAll("button")) {
    button.disabled = isBusy;
  }
}

function setDashboardBusy(isBusy) {
  elements.refreshDashboard.disabled = isBusy;
  elements.refreshDashboard.textContent = isBusy ? "Refreshing" : "Refresh";
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

function numberOrFallback(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function safeCommandText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replace(/\s+/g, " ")
    .trim();
}

function formatUsd(value) {
  return Number(value).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
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
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bSop\b/g, "SOP")
    .replace(/\bMcp\b/g, "MCP");
}
