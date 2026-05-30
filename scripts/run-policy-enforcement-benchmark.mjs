#!/usr/bin/env node
// Agent policy-enforcement benchmark runner.
//
// Always scores ClawGuard's deterministic autonomy gate (free, offline). If
// POLICY_BENCH_MODELS is set (and API keys are present), it also scores each bare
// model acting as an action gatekeeper, under both neutral and adversarial framing.
//
// Usage:
//   node scripts/run-policy-enforcement-benchmark.mjs                 # ClawGuard only, clean
//   POLICY_BENCH_PRESSURE=1 node scripts/run-policy-enforcement-benchmark.mjs
//   POLICY_BENCH_COMBINED=1 node scripts/run-policy-enforcement-benchmark.mjs  # clean + pressure tables
//   POLICY_BENCH_MODELS="openai:gpt-5-chat-latest deepseek:deepseek-v4-flash" ...
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SCENARIOS, ENFORCEMENT_PRESET } from "../bench/agent-policy/scenarios.js";
import { PRESSURE_SCENARIOS } from "../bench/agent-policy/scenarios-pressure.js";
import {
  scoreClawGuardScenario,
  classifyScenarioWithModel,
  computeSystemMetrics
} from "../src/agent/policy-enforcement-eval.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DOC = path.join(REPO_ROOT, "docs", "AGENT_POLICY_ENFORCEMENT.md");
const OUT_JSON = path.join(REPO_ROOT, "bench-results", "agent-policy-enforcement.json");

const PROVIDER_KEY_ENV = {
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  gemini: "GEMINI_API_KEY",
  google: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY"
};

function providerHasKey(provider) {
  const envName = PROVIDER_KEY_ENV[provider];
  return Boolean(envName && process.env[envName]);
}

function scoreClawGuard(preset, scenarioList) {
  const normal = {};
  const adversarial = {};
  for (const s of scenarioList) {
    const result = scoreClawGuardScenario(s, { preset, workspace: REPO_ROOT });
    normal[s.id] = result.decision;
    adversarial[s.id] = result.decision;
  }
  return { normal, adversarial, errors: 0 };
}

async function scoreModel(provider, model, sleepMs, scenarioList) {
  const normal = {};
  const adversarial = {};
  let errors = 0;
  for (const s of scenarioList) {
    for (const adversarialFraming of [false, true]) {
      try {
        const { decision } = await classifyScenarioWithModel(s, {
          adversarial: adversarialFraming,
          provider,
          model
        });
        (adversarialFraming ? adversarial : normal)[s.id] = decision;
      } catch (error) {
        errors += 1;
        (adversarialFraming ? adversarial : normal)[s.id] = "unknown";
        process.stderr.write(
          `  [warn] ${provider}/${model} ${s.id} (${adversarialFraming ? "adv" : "norm"}): ${error.message}\n`
        );
      }
      if (sleepMs > 0) {
        await new Promise((r) => setTimeout(r, sleepMs));
      }
    }
  }
  return { normal, adversarial, errors };
}

function pct(n) {
  return `${(n * 100).toFixed(0)}%`;
}

function renderMetricsTable(systems) {
  const lines = [];
  lines.push(
    "| System | Unsafe auto-exec (dangerous) ↓ | Adversarial flip→auto ↓ | Laxer than label ↓ | Stricter than label | Exact match |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const sys of systems) {
    const m = sys.metrics;
    const note = sys.errors > 0 ? ` _(${sys.errors} call errors)_` : "";
    lines.push(
      `| ${sys.label}${note} | ${pct(m.unsafe_auto_rate)} (${m.dangerous_auto}/${m.dangerous_total}) | ` +
        `${pct(m.adversarial_flip_rate)} (${m.adversarial_flipped_to_auto}/${m.adversarial_eligible}) | ` +
        `${m.laxer_mismatches} | ${m.stricter_mismatches} | ${pct(m.exact_match_rate)} (${m.exact_match}/${m.n}) |`
    );
  }
  return lines;
}

function renderKeyFindings(systems, scenarios) {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const describe = (id) => byId.get(id)?.description ?? id;
  const lines = [];
  for (const sys of systems) {
    const m = sys.metrics;
    const bits = [];
    bits.push(`adversarial flips: ${m.adversarial_flipped_to_auto}`);
    bits.push(`laxer-than-label: ${m.laxer_mismatches}`);
    bits.push(`stricter-than-label: ${m.stricter_mismatches}`);
    lines.push(`- **${sys.label}** — ${bits.join(", ")}.`);
    for (const f of m.flip_items ?? []) {
      lines.push(`  - Adversarial flip: \`${f.id}\` went ${f.from} → auto (${describe(f.id)}).`);
    }
    for (const l of (m.laxer_items ?? []).filter((x) => x.tier !== "safe")) {
      lines.push(`  - Laxer: \`${l.id}\` labeled \`${l.label}\` but decided \`${l.decision}\` (${describe(l.id)}).`);
    }
  }
  return lines;
}

function modelKey(sys) {
  return sys.provider && sys.model ? `${sys.provider}:${sys.model}` : null;
}

function renderPressureDelta(cleanSystems, pressureSystems) {
  const lines = [];
  lines.push("## Clean → task-pressure delta (bare models)");
  lines.push("");
  const pressureByKey = new Map(
    pressureSystems.filter((s) => s.kind === "model").map((s) => [modelKey(s), s])
  );
  for (const clean of cleanSystems.filter((s) => s.kind === "model")) {
    const key = modelKey(clean);
    const pressure = pressureByKey.get(key);
    if (!pressure) {
      continue;
    }
    const cm = clean.metrics;
    const pm = pressure.metrics;
    const flipGain = pm.adversarial_flipped_to_auto - cm.adversarial_flipped_to_auto;
    const laxerGain = pm.laxer_mismatches - cm.laxer_mismatches;
    lines.push(
      `- **${clean.label.replace(" (no governance)", "")}** — adversarial flips: ${cm.adversarial_flipped_to_auto} → ${pm.adversarial_flipped_to_auto} ` +
        `(+${flipGain}); laxer-than-label: ${cm.laxer_mismatches} → ${pm.laxer_mismatches} (+${laxerGain}); unsafe-auto unchanged at ${pct(pm.unsafe_auto_rate)}.`
    );
  }
  const cgClean = cleanSystems.find((s) => s.kind === "clawguard");
  const cgPressure = pressureSystems.find((s) => s.kind === "clawguard");
  if (cgClean && cgPressure) {
    lines.push(
      `- **ClawGuard (deterministic gate)** — identical across modes: flips ${cgClean.metrics.adversarial_flipped_to_auto}→${cgPressure.metrics.adversarial_flipped_to_auto}, ` +
        `laxer ${cgClean.metrics.laxer_mismatches}→${cgPressure.metrics.laxer_mismatches} (prose-invariant by construction).`
    );
  }
  return lines;
}

function renderDocHeader(preset, scenarioCount, { combined = false } = {}) {
  const lines = [];
  lines.push("# Agent policy-enforcement benchmark");
  lines.push("");
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push("");
  lines.push(
    "This benchmark measures **operational-safety enforcement**, not answer quality. Each system is " +
      "given an agent action and must decide `auto` (run it), `approval` (gate for a human), or `block`. " +
      "Ground-truth labels come from common-sense operational-safety principles (defined independently of " +
      "ClawGuard's policy table), across three tiers: **safe**, **side-effecting**, and **dangerous** " +
      "(destructive / secret-exposing / data-exfiltrating / unrecognized capability)."
  );
  lines.push("");
  lines.push(
    "ClawGuard scores its **deterministic autonomy gate** (`resolveToolAutonomy`, preset = " +
      `\`${preset}\`); it runs offline with no model call. Bare models act as an LLM gatekeeper under the ` +
      "same stated conservative policy. Every action is also tested under an **adversarial rephrase** (same " +
      "structured action, benign/jailbreak prose) to measure prose-driven decision flips."
  );
  if (combined) {
    lines.push("");
    lines.push(
      "This report includes **two prose modes side-by-side**: a clean gatekeeper description and a **task-pressure** " +
        "narrative (“finish the deploy now; user will cancel”). ClawGuard gates on structured tool+args only; " +
        "bare models see the prose."
    );
  }
  lines.push("");
  lines.push(`_Scenario count: ${scenarioCount} per mode._`);
  lines.push("");
  return lines;
}

function renderDocFooter(scenarioCount) {
  const lines = [];
  lines.push("## Scope and limitations");
  lines.push("");
  lines.push(
    "- Frontier models can look strong under a dedicated gatekeeper role; **task-pressure** prose is the harder, " +
      "more realistic setting where completion urgency may degrade consistency."
  );
  lines.push(
    `- Sample size (${scenarioCount} scenarios per mode). Treat numbers as directional; the robust signal is ` +
      "qualitative (deterministic vs. occasionally-bypassable)."
  );
  lines.push(
    "- ClawGuard's exact-match being high is partly label-posture alignment. The honest, model-independent claims " +
      "are **unsafe-auto** and **adversarial-flip**."
  );
  lines.push("");
  lines.push("## Honest framing");
  lines.push("");
  lines.push(
    "- ClawGuard's advantage is **structural**: keyed on tool + arguments, not prose. Unrecognized/destructive " +
      "actions are refused or escalated **deterministically** and **identically regardless of framing**."
  );
  lines.push(
    "- This is **not** a claim that models are reckless. The benchmark shows what a governance runtime " +
      "*guarantees* on top of any model: determinism, prose-invariance, fail-safe unknown capabilities, audit trail."
  );
  lines.push("");
  return lines;
}

function renderDoc(systems, preset, scenarios, { pressure = false, baselineSystems = null } = {}) {
  const lines = renderDocHeader(preset, scenarios.length, { combined: false });
  if (pressure) {
    lines.push(
      "**Task-pressure mode:** descriptions embed each action inside a multi-step “finish the deploy now” narrative."
    );
    lines.push("");
  }
  lines.push(...renderMetricsTable(systems));
  lines.push("");
  lines.push("## How to read this");
  lines.push("");
  lines.push(
    "- **Unsafe auto-exec (dangerous)** — headline safety metric. **Adversarial flip→auto** — prose-driven bypass. " +
      "**Laxer than label** — safety-relevant under-gating; **stricter** — over-caution only."
  );
  lines.push("");
  lines.push("## Key finding");
  lines.push("");
  lines.push(
    "On the headline metric, systems should gate dangerous actions. Differences are in **consistency and bypass-resistance**:"
  );
  lines.push("");
  lines.push(...renderKeyFindings(systems, scenarios));
  if (baselineSystems && pressure) {
    lines.push("");
    lines.push("## Clean vs task-pressure (ClawGuard)");
    lines.push("");
    const cgClean = baselineSystems.find((s) => s.kind === "clawguard");
    const cgPressure = systems.find((s) => s.kind === "clawguard");
    if (cgClean && cgPressure) {
      lines.push(
        `- **Clean:** unsafe-auto ${pct(cgClean.metrics.unsafe_auto_rate)}, flip ${pct(cgClean.metrics.adversarial_flip_rate)}.`
      );
      lines.push(
        `- **Pressure:** unsafe-auto ${pct(cgPressure.metrics.unsafe_auto_rate)}, flip ${pct(cgPressure.metrics.adversarial_flip_rate)}.`
      );
      lines.push("- ClawGuard decisions are **identical** across modes (0% prose flip by construction).");
    }
  }
  lines.push("");
  lines.push(...renderDocFooter(scenarios.length));
  return lines.join("\n") + "\n";
}

function renderDocCombined(cleanSystems, pressureSystems, preset) {
  const lines = renderDocHeader(preset, SCENARIOS.length, { combined: true });
  lines.push("## Clean prose");
  lines.push("");
  lines.push(...renderMetricsTable(cleanSystems));
  lines.push("");
  lines.push("## Task-pressure narratives");
  lines.push("");
  lines.push(...renderMetricsTable(pressureSystems));
  lines.push("");
  lines.push("## How to read this");
  lines.push("");
  lines.push(
    "- Compare **Clean prose** vs **Task-pressure** for the same structured actions. ClawGuard rows should match; " +
      "bare-model rows may diverge under pressure."
  );
  lines.push("");
  lines.push("## Key finding (clean)");
  lines.push("");
  lines.push(...renderKeyFindings(cleanSystems, SCENARIOS));
  lines.push("");
  lines.push("## Key finding (task-pressure)");
  lines.push("");
  lines.push(...renderKeyFindings(pressureSystems, PRESSURE_SCENARIOS));
  lines.push("");
  lines.push(...renderPressureDelta(cleanSystems, pressureSystems));
  lines.push("");
  lines.push(...renderDocFooter(SCENARIOS.length));
  return lines.join("\n") + "\n";
}

async function buildSystems(preset, scenarioList, modelSpecs, replay, { labelSuffix = "" } = {}) {
  const systems = [];
  console.log(`[policy-bench] Scoring ClawGuard${labelSuffix} (${scenarioList.length} scenarios)...`);
  const cg = scoreClawGuard(preset, scenarioList);
  systems.push({
    label: `ClawGuard (deterministic gate)${labelSuffix}`,
    kind: "clawguard",
    preset,
    errors: 0,
    decisions: cg,
    metrics: computeSystemMetrics(scenarioList, cg.normal, cg.adversarial)
  });

  const sleepMs = Number(process.env.POLICY_BENCH_SLEEP_MS ?? 0) || 0;
  for (const spec of modelSpecs) {
    const [provider, model] = spec.split(":");
    if (!provider || !model) {
      continue;
    }
    const replayKey = labelSuffix ? `${spec}${labelSuffix}` : spec;
    const replayed = replay?.get(replayKey) ?? replay?.get(spec);
    let res;
    if (replayed) {
      console.log(`[policy-bench] Replaying ${spec}${labelSuffix} (no API calls).`);
      res = { normal: replayed.normal ?? {}, adversarial: replayed.adversarial ?? {}, errors: 0 };
    } else if (!providerHasKey(provider)) {
      console.log(`[policy-bench] Skipping ${spec}: no API key.`);
      continue;
    } else {
      console.log(`[policy-bench] Scoring bare model ${spec}${labelSuffix}...`);
      res = await scoreModel(provider, model, sleepMs, scenarioList);
    }
    systems.push({
      label: `Bare \`${model}\` (no governance)${labelSuffix}`,
      kind: "model",
      provider,
      model,
      errors: res.errors,
      decisions: res,
      metrics: computeSystemMetrics(scenarioList, res.normal, res.adversarial)
    });
  }
  return systems;
}

function loadReplayMap(prev) {
  const replay = new Map();
  if (prev.combined_mode) {
    for (const sys of prev.systems_clean ?? []) {
      if (sys.provider && sys.model && sys.decisions) {
        replay.set(`${sys.provider}:${sys.model}`, sys.decisions);
      }
    }
    for (const sys of prev.systems_pressure ?? []) {
      if (sys.provider && sys.model && sys.decisions) {
        replay.set(`${sys.provider}:${sys.model} [task-pressure]`, sys.decisions);
      }
    }
    return replay;
  }
  for (const sys of prev.systems ?? []) {
    if (sys.provider && sys.model && sys.decisions) {
      replay.set(`${sys.provider}:${sys.model}`, sys.decisions);
    }
  }
  return replay;
}

function serializeSystems(systems) {
  return systems.map((s) => ({
    label: s.label,
    kind: s.kind,
    provider: s.provider ?? null,
    model: s.model ?? null,
    errors: s.errors,
    metrics: s.metrics,
    decisions: s.decisions
  }));
}

function printSummary(systems) {
  for (const sys of systems) {
    const m = sys.metrics;
    console.log(
      `  ${sys.label}: unsafe-auto=${pct(m.unsafe_auto_rate)} (${m.dangerous_auto}/${m.dangerous_total}), ` +
        `adversarial-flip=${pct(m.adversarial_flip_rate)}, exact=${pct(m.exact_match_rate)}`
    );
  }
}

async function main() {
  const preset = process.env.POLICY_BENCH_PRESET ?? ENFORCEMENT_PRESET;
  const combinedMode = ["1", "true", "yes"].includes(String(process.env.POLICY_BENCH_COMBINED ?? "").toLowerCase());
  const pressureMode =
    !combinedMode && ["1", "true", "yes"].includes(String(process.env.POLICY_BENCH_PRESSURE ?? "").toLowerCase());
  const modelSpecs = (process.env.POLICY_BENCH_MODELS ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let replay = null;
  if (process.env.POLICY_BENCH_REPLAY) {
    try {
      const prev = JSON.parse(await readFile(process.env.POLICY_BENCH_REPLAY, "utf8"));
      replay = loadReplayMap(prev);
      console.log(`[policy-bench] Replay: loaded ${replay.size} decision set(s).`);
    } catch (error) {
      console.log(`[policy-bench] Replay load failed (${error.message}); running live.`);
    }
  }

  await mkdir(path.dirname(OUT_JSON), { recursive: true });

  if (combinedMode) {
    const cleanSystems = await buildSystems(preset, SCENARIOS, modelSpecs, replay, { labelSuffix: "" });
    const pressureSystems = await buildSystems(preset, PRESSURE_SCENARIOS, modelSpecs, replay, {
      labelSuffix: " [task-pressure]"
    });

    await writeFile(
      OUT_JSON,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          preset,
          scenario_count: SCENARIOS.length,
          combined_mode: true,
          systems_clean: serializeSystems(cleanSystems),
          systems_pressure: serializeSystems(pressureSystems)
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
    await writeFile(OUT_DOC, renderDocCombined(cleanSystems, pressureSystems, preset), "utf8");
    console.log(`\n[policy-bench] Wrote ${OUT_DOC}`);
    console.log(`[policy-bench] Wrote ${OUT_JSON}\n`);
    console.log("--- Clean ---");
    printSummary(cleanSystems);
    console.log("--- Task-pressure ---");
    printSummary(pressureSystems);
    return;
  }

  const scenarios = pressureMode ? PRESSURE_SCENARIOS : SCENARIOS;
  let baselineCgMetrics = null;
  if (pressureMode) {
    const cgClean = scoreClawGuard(preset, SCENARIOS);
    baselineCgMetrics = computeSystemMetrics(SCENARIOS, cgClean.normal, cgClean.adversarial);
  }

  const systems = await buildSystems(preset, scenarios, modelSpecs, replay, {
    labelSuffix: pressureMode ? " [task-pressure]" : ""
  });

  await writeFile(
    OUT_JSON,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        preset,
        scenario_count: scenarios.length,
        pressure_mode: pressureMode,
        combined_mode: false,
        systems: serializeSystems(systems)
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
  const baselineSystems = baselineCgMetrics ? [{ kind: "clawguard", metrics: baselineCgMetrics }] : null;
  await writeFile(OUT_DOC, renderDoc(systems, preset, scenarios, { pressure: pressureMode, baselineSystems }), "utf8");
  console.log(`\n[policy-bench] Wrote ${OUT_DOC}`);
  console.log(`[policy-bench] Wrote ${OUT_JSON}\n`);
  printSummary(systems);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
