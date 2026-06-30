# ClawGuard — Doctrine Lab upgrade guide (AI agent handoff)

**Purpose:** When opening ClawGuard to integrate with Doctrine Lab’s adopted safety stack (2026-06-30), follow this doc. Do **not** start a retrain loop from ClawGuard — export and eval only.

**Sister factory:** [doctrine-lab/docs/SISTER_REPO_UPGRADE.md](../../thinking-DT/doctrine-lab/docs/SISTER_REPO_UPGRADE.md)  
**Full factory runbook:** [doctrine-lab/docs/CLOSED_LOOP_RUNBOOK.md](../../thinking-DT/doctrine-lab/docs/CLOSED_LOOP_RUNBOOK.md)

## Current integration status (2026-06-30)

| Check | Status |
|-------|--------|
| `test/agent-doctrine-lab.test.js` | 6/6 PASS |
| `npm run safety:eval` | 51/51 PASS |
| `clawguard agent doctrine export --send` | HTTP 200 to Doctrine Lab |
| Doctrine champion for comparison | `local-lora:injection-mixed-safety-v8-3b` (in factory, not bundled in npm kit) |

## What ClawGuard owns vs Doctrine Lab

| ClawGuard (this repo) | Doctrine Lab (factory) |
|-----------------------|-------------------------|
| Runtime scanner, approval audit, `safety_eval/` | Holdouts, gates, LoRA training, adoption |
| `src/agent/doctrine-lab.js` export shape | `POST /api/datasets/import` |
| Fast npm smoke (`safety:eval`) | `make injection-gate`, `make integration-smoke` |
| `clawguard:beta.10` runtime label | `clawguard:beta9` etc. for API benchmarks |

**Rule:** ClawGuard `safety_eval/` is a **fast smoke**. Adoption decisions use Doctrine Lab holdouts only.

## Upgrade checklist (agent workflow)

### 1. Baseline before any defense change

```bash
cd /path/to/ClawGuard
npm run safety:eval
node --test test/agent-doctrine-lab.test.js
make -C /path/to/thinking-DT/doctrine-lab cross-project-smoke
```

### 2. Doctrine Lab must be running for live export

```bash
# Terminal A — Doctrine Lab
cd /path/to/thinking-DT/doctrine-lab && source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal B — ClawGuard export
cd /path/to/ClawGuard
clawguard agent doctrine export --out /tmp/clawguard-import.json
# Live send (loopback only unless you explicitly allow remote):
clawguard agent doctrine export --send --url http://127.0.0.1:8000
```

**Provenance (required):**

| Run type | Flag |
|----------|------|
| Live user / runtime audit | default `origin: organic` |
| Harness / benchmark / pilot script | `--origin synthetic` |

Corpus is **frozen** — imports land as `pending`; do **not** bulk-approve for retrain without explicit human go.

### 3. Compare runtime vs factory holdout (optional)

From Doctrine Lab (API or scripts), benchmark ClawGuard pipeline:

```bash
# Example: compare clawguard runtime as a model_id in Doctrine eval
# See doctrine-lab AGENTS.md — ModelAdapter supports clawguard:*
```

### 4. Before release / tag

```bash
npm run safety:eval                    # 51-case agent safety bar
node --test test/agent-doctrine-lab.test.js
make -C ../thinking-DT/doctrine-lab integration-smoke
```

Add to CI (recommended):

```yaml
# .github/workflows — excerpt
- run: npm run safety:eval
- run: node --test test/agent-doctrine-lab.test.js
- run: make -C ../thinking-DT/doctrine-lab cross-project-smoke
```

## Key files (edit map)

| File | What it does |
|------|----------------|
| `src/agent/doctrine-lab.js` | Builds `/api/datasets/import` payload from audit + approvals |
| `src/cli.js` | `agent doctrine export` command |
| `test/agent-doctrine-lab.test.js` | Export contract tests — **run before changing export shape** |
| `safety_eval/run_eval.mjs` | Fast 51-case smoke |
| `scripts/scanner-benchmark.js` | Benchmark export → `origin: synthetic` |

## Environment

| Variable | Purpose |
|----------|---------|
| `DOCTRINE_LAB_API_KEY` | Optional; sent as `X-API-Key` on `--send` |
| Doctrine URL | `--url http://127.0.0.1:8000` (default) |

## Do NOT (unless human explicitly requests)

- Launch RunPod or retrain from ClawGuard traces (factory decision; v9–v15 closed)
- Bulk-approve Doctrine imports without HITL
- Duplicate injection scoring logic — use factory gates
- Point export at non-loopback URL without reviewing `doctrine-lab.js` send guard

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Export 0 entries | Run agent tasks first; check `.clawguard/agent/audit.jsonl` |
| Send 401 | Set `DOCTRINE_LAB_API_KEY` to match Doctrine Lab `.env` `API_KEY` |
| Send blocked (non-loopback) | By design — use file export + manual import for remote lab |
| safety:eval regression | Fix scanner in ClawGuard; re-run factory gate only if adopting new weights |

## Open ClawGuard in Cursor — agent prompt seed

> Integrate ClawGuard with Doctrine Lab per `docs/DOCTRINE_LAB_UPGRADE.md`. Run safety:eval and agent-doctrine-lab tests. Verify export with `--origin synthetic` for harness runs. Run `make -C doctrine-lab integration-smoke` before any defense PR. Do not start retraining; corpus is frozen; champion is `injection-mixed-safety-v8-3b` in the factory.
