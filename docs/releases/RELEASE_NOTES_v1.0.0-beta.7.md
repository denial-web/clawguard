# ClawGuard v1.0.0-beta.7 Release Notes

ClawGuard v1.0.0-beta.7 hardens agent trust boundaries and adds a local Doctrine Lab export path for beta safety traces.

## What Changed

- Added channel-bound approval action hashes so an approval for one tool action cannot be replayed against changed args, targets, or destinations.
- Added inter-component message wrapping for tool output, keeping tool output untrusted even if it claims forged policy provenance.
- Added runtime-trace-only `verifiedBy` provenance: planner-supplied verifier claims are ignored unless backed by a runtime trace.
- Enriched Blast Radius Explain audit events with policy version, config path, and protected-asset summary metadata.
- Added `clawguard agent doctrine export` to convert ClawGuard audit and approval traces into Doctrine Lab `/api/datasets/import` payloads.
- Added optional local Doctrine Lab delivery with `--send --url http://127.0.0.1:8000`.
- Added `source=clawguard` and `source_runtime=clawguard:beta7` provenance fields for Doctrine Lab imports.
- Added `DOCTRINE_LAB_API_KEY` support for Doctrine Lab instances that enforce `X-API-Key`.

## Safety Boundary

Doctrine Lab export is local-first. By default it prints or writes a JSON payload and does not send network traffic. `--send` only permits loopback Doctrine Lab URLs such as `127.0.0.1` or `localhost`.

The export payload may include audit text, redacted tool args, paths, and policy reasons. Treat generated JSON as local security telemetry.

## Useful Commands

```bash
clawguard agent doctrine export --out doctrine-import.json
clawguard agent doctrine export --send --url http://127.0.0.1:8000
DOCTRINE_LAB_API_KEY=... clawguard agent doctrine export --send --url http://127.0.0.1:8000
```

## Validation

Run the focused and full checks:

```bash
node --test test/agent-beta7-channel.test.js
node --test test/agent-doctrine-lab.test.js
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```

Expected beta.7 baseline:

- Forged tool-output provenance remains untrusted.
- `verifiedBy` survives only with an allowed runtime trace.
- Side-effecting tool actions pause for policy approval.
- Approval replay with changed action hashes blocks.
- Blast-radius audit includes beta policy/protected-asset metadata.
- Doctrine Lab export creates pending `agent_safety` import payloads with ClawGuard provenance.
