# OpenClaw and ClawHub Research

Checked: 2026-05-07

This document captures the current public OpenClaw and ClawHub shape that ClawGuard should build around. It uses official OpenClaw and ClawHub sources only.

## Official Sources

- [OpenClaw GitHub repository](https://github.com/openclaw/openclaw)
- [OpenClaw architecture docs](https://docs.openclaw.ai/concepts/architecture)
- [OpenClaw skills docs](https://docs.openclaw.ai/tools/skills)
- [ClawHub docs](https://docs.openclaw.ai/tools/clawhub)
- [ClawHub GitHub repository](https://github.com/openclaw/clawhub)
- [ClawHub skill format](https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md)
- [OpenClaw skills archive](https://github.com/openclaw/skills)

## Current OpenClaw Shape

OpenClaw is a personal AI assistant with a long-lived Gateway as the control plane. The Gateway owns messaging surfaces, exposes a WebSocket API, validates inbound frames against JSON Schema, and coordinates clients, nodes, tools, sessions, and events.

Security-relevant facts:

- The main session can run tools on the host, which means skills and tools should be treated as meaningful trust decisions.
- Non-main sessions can be sandboxed with Docker, SSH, or OpenShell backends.
- Typical sandbox policy allows core file/process/session tools and denies broader tools such as browser, canvas, nodes, cron, Discord, and gateway.
- OpenClaw treats inbound direct messages as untrusted input and uses pairing/allowlist controls for remote surfaces.
- Skills are loaded into the agent prompt and can influence how tools are used.
- Plugins can ship skills, so plugin review and skill review are connected.

## Current Skill Model

OpenClaw uses AgentSkills-compatible folders. A skill is a directory containing `SKILL.md` with YAML frontmatter and instructions.

Current skill locations and precedence:

- Extra skill folders from `skills.load.extraDirs`
- Bundled skills shipped with OpenClaw
- Managed/local skills in `~/.openclaw/skills`
- Personal agent skills in `~/.agents/skills`
- Project agent skills in `<workspace>/.agents/skills`
- Workspace skills in `<workspace>/skills`

If names conflict, workspace skills take precedence over project, personal, managed/local, bundled, and extra-dir skills.

Important implication: ClawGuard should scan the skill that actually wins by precedence, not only every folder it can see. A later phase should add `clawguard openclaw scan-workspace` to resolve and report effective skills.

## Current ClawHub Shape

ClawHub is the public registry for OpenClaw skills and plugins.

Current registry roles:

- Public browsing of skill content and metadata.
- Versioned skill bundles with semver, changelogs, tags, and `latest`.
- Downloads as zip bundles.
- Search and discovery.
- Stars, comments, moderation, reporting, hiding, deletion, and ban flows.
- Plugin/package browsing with family, trust, and capability metadata.
- Publish flows for skills and plugins.

Native OpenClaw flows install ClawHub skills into the active workspace `skills/` directory. Native plugin installs validate advertised compatibility before archive installation, and ClawHub source metadata is persisted for future updates.

The separate `clawhub` CLI can install skills into `./skills` under the current working directory and stores local state in `.clawhub/lock.json`.

## Current Skill Format Signals

The ClawHub skill format makes `SKILL.md` central:

- `SKILL.md` or `skill.md` is required.
- YAML frontmatter is optional but important for metadata extraction.
- `description` is used for UI and search summary.
- Runtime metadata is declared under `metadata.openclaw` with aliases for older names.
- Important fields include `requires.env`, `requires.bins`, `requires.anyBins`, `requires.config`, `primaryEnv`, `envVars`, `install`, `os`, `homepage`, and related metadata.
- Install kinds currently include `brew`, `node`, `go`, and `uv`.
- Published skills accept text-based files only.
- Server-side bundle size is capped at 50 MB.
- Published ClawHub skills are MIT-0.

ClawHub's own docs say its security analysis checks whether declarations match actual skill behavior. Example: a skill that references an API key but does not declare it should be flagged as a metadata mismatch.

## ClawGuard Product Inference

Inference from the sources: ClawGuard should not try to replace ClawHub security analysis. It should become an independent, explainable, local and CI-friendly enforcement layer that works before install, after install, and during pull requests.

The strongest ClawGuard scope is:

- Skill scanner for `SKILL.md` and supporting files.
- Frontmatter mismatch scanner for declared requirements versus observed behavior.
- MCP and plugin config scanner for tool/capability risk.
- Install/update gate for OpenClaw and ClawHub workflows.
- CI and GitHub Action for community repositories.
- Web demo for quick "upload skill, get risk score" sharing.

The strongest first public message is:

> Run ClawGuard before trusting an OpenClaw skill or plugin.

## Architecture Requirements From Research

ClawGuard needs to support these inputs:

- A single skill folder.
- A workspace `skills/` folder.
- Project agent skills in `.agents/skills`.
- Managed/local skill folders when explicitly passed.
- ClawHub local install metadata in `.clawhub/`.
- OpenClaw plugin config and source metadata.
- MCP configs from `.openclaw`, `.cursor`, and common MCP config paths.
- ClawHub package metadata when supplied by a user or integration.

ClawGuard needs to produce these outputs:

- Human CLI report.
- JSON report for automation.
- Policy decision for install gates.
- SARIF report for GitHub code scanning.
- HTML report for demos and enterprise review.
- JSONL audit events for later SIEM or governance use.

## Research-Driven Priorities

1. Parse `SKILL.md` frontmatter and compare declarations to observed behavior.
2. Scan OpenClaw workspace skill folders and report effective precedence.
3. Scan `.clawhub/lock.json` and origin metadata for source/version context.
4. Scan plugin and MCP config for broad tools, unknown sources, install scripts, and network/system capabilities.
5. Add policy presets for personal, governed, and enterprise use.
6. Add GitHub Action and SARIF output.
7. Add web demo and demo GIF around "Upload skill -> Risk score -> Explanation -> Safer action".
