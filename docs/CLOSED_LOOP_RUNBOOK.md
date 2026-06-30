# Doctrine Lab closed loop

ClawGuard exports blocked/escalated audit events to Doctrine Lab for training and evaluation.

**Upgrade guide (open this in Cursor for safety work):** [DOCTRINE_LAB_UPGRADE.md](DOCTRINE_LAB_UPGRADE.md)  
**Factory handoff:** [doctrine-lab/docs/SISTER_REPO_UPGRADE.md](../../thinking-DT/doctrine-lab/docs/SISTER_REPO_UPGRADE.md)  
**Full runbook:** [doctrine-lab/docs/CLOSED_LOOP_RUNBOOK.md](../../thinking-DT/doctrine-lab/docs/CLOSED_LOOP_RUNBOOK.md)

## Export traces

```bash
# Dry-run
clawguard agent doctrine export --out /tmp/clawguard-import.json

# Live send (Doctrine Lab on :8000)
clawguard agent doctrine export --send --url http://127.0.0.1:8000

# Harness / benchmark (not organic retrain fuel)
clawguard agent doctrine export --send --url http://127.0.0.1:8000 --origin synthetic
```

## Before release

```bash
npm run safety:eval
node --test test/agent-doctrine-lab.test.js
make -C ../thinking-DT/doctrine-lab integration-smoke
```

Runtime label: `clawguard:beta.10` (matches package version).
