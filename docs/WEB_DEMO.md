# Web Demo

ClawShield includes a local web demo for quick skill review.

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
- Copy the underlying JSON scan report.
- Download a self-contained HTML report from the current scan.

## Recommended Demo

Use [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the click path and talk track.

## Safety Model

The demo runs locally and reuses the same scanner as the CLI. Pasted content and selected folder files are written to a temporary directory, scanned, and removed. The demo does not install dependencies, execute skill code, contact registries, or fetch OpenClaw/ClawHub data.
