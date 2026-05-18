# ClawGuard v0.8.0 Release Notes

This release improves ClawGuard Agent memory for day-one usefulness. The focus is **Cold-Start + Active Governed Recall**: make a new workspace useful immediately without silently trusting unsafe memory.

## Highlights

- Added cold-start memory bootstrap:
  - `clawguard agent memory bootstrap`
  - proposes starter memories from `README.md`, `package.json`, `.clawguard.json`, git remote metadata, and local instruction files
  - writes approval requests, not durable memory
- Added active recall command:
  - `clawguard agent memory recall <query>`
  - creates a recall snapshot and human-readable summary from durable memory plus prior sessions
- Added memory quality checks before durable writes or proposals:
  - duplicate detection
  - vague-memory blocking
  - prompt-injection text blocking
  - sensitive-memory redaction and approval routing
- Added durable memory ids for new records.
- Updated planner prompts to include active recall summaries instead of only raw memory lines.

## Why This Matters

Hermes-style agents become stronger after they have history, but a brand-new user starts with little useful memory. v0.8 gives ClawGuard a safer cold-start path: inspect the project, propose starter memory, and let the user approve what should become durable context.

## Safety Posture

Bootstrap and task-outcome learning remain proposal-first. ClawGuard does not silently store business rules, project rules, sensitive facts, or prompt-like instructions. Secret-looking values are redacted before they appear in approval payloads or durable records.

## Example

```bash
clawguard agent init
clawguard agent memory bootstrap
clawguard agent memory recall "release process"
clawguard agent run --recipe release.prepare
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
