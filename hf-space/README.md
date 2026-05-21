---
title: ClawGuard Safety Demo
colorFrom: gray
colorTo: green
sdk: gradio
app_file: app.py
pinned: false
license: mit
short_description: Demo for a governed local AI agent runtime.
---

# ClawGuard Safety Demo

ClawGuard is a local governed AI agent runtime for developers and small teams.
It can act through tools, skills, memory, and workflows, but risky actions pass
through policy, approvals, protected asset checks, backups, and audit.
Beta.6 adds Blast Radius Explain: a deterministic preflight that shows what a
proposed action could damage before it runs.

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
