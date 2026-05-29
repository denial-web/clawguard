# ClawGuard v1.0.0-beta.5 Release Notes

ClawGuard v1.0.0-beta.5 adds the Professional Worker Critic: a deterministic gate for sealing business evidence claims before future professional-worker responses rely on them.

## Highlights

- Added a pure JavaScript Professional Worker critic module with no I/O, no model calls, and no new dependencies.
- Added Evidence Ledger sealing where `verified` is privileged and only runtime verification traces can grant it.
- Added automatic downgrade for model-requested `verified` claims without traces.
- Added stable critic finding codes for unverified regulated numbers, missing verification traces, authority overreach, ungated side effects, banned tactics, and cost ceilings.
- Added warning findings for downgraded status and high unverified-number counts.
- Added `professional_critic` safety eval coverage, including the fake-verification canary.

## Safety Notes

The critic does not replace ClawGuard policy enforcement. It detects unsafe professional-worker drafts and sealed evidence problems; protected assets, approvals, autonomy policy, backups, and audit remain the enforcement layer.

Beta.5 intentionally does not add a full Professional Worker runtime, second-model critic, new CLI commands, or new role-pack marketplace behavior. It proves the deterministic foundation first.

## Verification

```bash
node --check src/agent/professional-worker/*.js
node --test test/professional-worker-critic.test.js
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```

Expected beta.5 baseline:

- Professional critic standalone tests pass.
- Safety eval includes the fake `verified` canary and professional-worker critic cases.
- Existing beta.4 Deep Thinking, protected asset, memory, bridge, approval, subagent, and autonomy tests remain green.
