---
title: ClawGuard Safety Demo
colorFrom: gray
colorTo: green
sdk: gradio
app_file: app.py
pinned: false
license: mit
short_description: ClawGuard demo — governed agent runtime + skill scanner (Core).
---

# ClawGuard Safety Demo

This Hugging Face Space demos **ClawGuard** — explainable governance for AI agents
and the skills/tools they use. The live UI focuses on **ClawGuard Agent** (governed
runtime, blast-radius preflight, protected assets, memory policy). The full project
also includes **ClawGuard Core** (static scanner and install-time policy gate for
OpenClaw-style skills and MCP configs). Either part can be used without the other.

Risky agent actions in a real install pass through policy, approvals, protected-asset
checks, backups, and audit. Blast Radius Explain shows what a proposed action could
damage before it runs.

This Space is a safe public demo. It does not read your local filesystem, run
shell commands, collect API keys, or execute external writes. For real use,
install ClawGuard locally with npm:

```bash
npx --yes --package @denial-web/clawguard@beta clawguard setup-ui
```

## What This Space Shows

- Skill and prompt-injection risk signals.
- Blast Radius Explain for risky shell actions such as database drops.
- Protected asset handling for databases, secrets, and backups.
- Memory-policy examples such as rule downgrades and exact-user-statement
  provenance mismatch.
- Local setup command generation for normal users.

## Real Local Install

```bash
npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard setup-ui
npx --yes --package @denial-web/clawguard@beta clawguard explain -- psql -c "DROP DATABASE prod"
npx --yes --package @denial-web/clawguard@beta clawguard agent run "inspect this project and propose safe cleanup"
```

## Project

- GitHub: https://github.com/denial-web/clawguard
- npm: https://www.npmjs.com/package/@denial-web/clawguard
- License: MIT
