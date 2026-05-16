# Web Demo

ClawGuard includes a local web demo for quick skill review.

## Run It

```bash
npm run web
```

Then open:

```text
http://127.0.0.1:4173
```

If that port is busy:

```bash
npm run web -- --port 4174
```

## What It Does

- Paste a `SKILL.md` file and scan it.
- Choose a local skill folder and scan the readable files.
- Choose built-in examples for safe, risky, workspace, ClawHub, dependency, and MCP scenarios.
- Switch policy preset between `personal`, `governed`, and `enterprise`.
- Show risk score, policy decision, required actions, finding counts, findings, and metadata summaries.
- Generate a run plan that combines the skill gate, model routing, and budget decision.
- Show the approval loop for guarded installs: install hook, policy gate, owner approval, and apply.
- Show the repeatable `approvals demo-flow --keep` command for demos and onboarding.
- Show a local Agent Dashboard with pending approvals, recent audit events, memory records, and browser bridge state.
- Run SOP demos for cafe, milk tea, mart, and toy shop workflows.
- Show the Business SOP Gate with missing evidence, approvals, thresholds, blocked actions, and a matching CLI command.
- Copy the underlying JSON scan report.
- Download a self-contained HTML report from the current scan.

## Recommended Demo

Use [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the click path and talk track.

## Safety Model

The demo runs locally and reuses the same scanner as the CLI. Pasted content and selected folder files are written to a temporary directory, scanned, and removed. The Agent Dashboard only reads local `.clawguard/` state. The demo does not install dependencies, execute skill code, contact registries, fetch OpenClaw/ClawHub data, or execute browser/app bridge actions.
