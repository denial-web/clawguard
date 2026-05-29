# ClawGuard v0.7.0 Release Notes

This release adds **Hybrid Memory** for ClawGuard Agent. The goal is to become more useful like personal agents while keeping ClawGuard's governed-by-default posture.

## Highlights

- Added human-readable memory mirrors:
  - `.clawguard/agent/USER.md`
  - `.clawguard/agent/MEMORY.md`
- Added pre-run recall snapshots under `.clawguard/agent/recall/`.
- Added searchable saved sessions:
  - `clawguard agent memory sessions search <query>`
- Added memory export:
  - `clawguard agent memory export --format markdown`
  - `clawguard agent memory export --format json`
- Added task-outcome memory proposals after successful runs. They create pending approval records instead of silently writing durable memory.
- Added memory record types for project rules, task outcomes, worked/failed outcomes, and decisions.
- Kept ForceMemory as a documented optional advanced backend, not the default runtime dependency.

## Safety Posture

Governed JSONL memory remains the source of truth. Markdown mirrors are generated review artifacts, not bypass paths. Sensitive memory is redacted in exports by default, and durable business/project/decision memory remains approval-gated.

## Example

```bash
clawguard agent init
clawguard agent run --recipe project.inspect
clawguard agent memory sessions search "project inspect"
clawguard agent memory export --format markdown
```

## Verification

Before publishing:

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check src/web-server.js
node --check safety_eval/run_eval.mjs
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```
