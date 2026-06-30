# AGENTS.md — ClawGuard

## What This Project Is

**ClawGuard** is a USB-ready / CLI **agent safety kit**: policy engine, approval workflow, audit chain, injection scanner, and `safety_eval/` smoke tests. It is a **runtime**, not the training factory.

**Sister factory:** [Doctrine Lab](../thinking-DT/doctrine-lab/) ingests traces, runs holdout gates, trains LoRA adapters, and decides what ships. ClawGuard exports blocked traces **to** Doctrine Lab; it does **not** train models itself.

## Doctrine Lab integration (read first when upgrading safety)

| Doc | When to open |
|-----|----------------|
| [docs/DOCTRINE_LAB_UPGRADE.md](docs/DOCTRINE_LAB_UPGRADE.md) | **Any safety/export/gate work** — AI agent handoff checklist |
| [docs/CLOSED_LOOP_RUNBOOK.md](docs/CLOSED_LOOP_RUNBOOK.md) | Export one-liner + link to factory |
| [doctrine-lab/docs/SISTER_REPO_UPGRADE.md](../thinking-DT/doctrine-lab/docs/SISTER_REPO_UPGRADE.md) | Cross-repo decisions, champions, do-not-retrain |

**Adopted factory champion (2026-06-30):** `local-lora:injection-mixed-safety-v8-3b` — compare via Doctrine eval; **not** bundled inside this npm package.

**Standing verification:**

```bash
npm run safety:eval
node --test test/agent-doctrine-lab.test.js
make -C ../thinking-DT/doctrine-lab integration-smoke
```

## Key paths

| Path | Role |
|------|------|
| `src/agent/doctrine-lab.js` | Audit → Doctrine Lab import payload |
| `src/cli.js` | `clawguard agent doctrine export` |
| `test/agent-doctrine-lab.test.js` | Export contract tests |
| `safety_eval/` | Fast 51-case agent safety bar |

## Export provenance

- **Live runtime** → `origin: organic` (default)
- **Harness / benchmark** → `--origin synthetic`

Corpus at factory is **frozen** — export for monitoring; do not auto-retrain without human go.

## Tech stack

Node.js (ESM), `node --test`, npm package `@denial-web/clawguard` (beta.10).

## Do not

- Fork Doctrine Lab holdout scoring in ClawGuard
- Bulk-approve factory imports from this repo without HITL
- Start RunPod / retrain loops from ClawGuard alone (factory owns training)
