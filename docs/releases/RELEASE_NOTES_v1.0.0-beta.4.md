# ClawGuard v1.0.0-beta.4 Release Notes

ClawGuard v1.0.0-beta.4 adds Deep Thinking: a governed inspect, critique, revise, and execute loop for professional agent tasks.

## Highlights

- Added `agent.thinking` config with auto-triggered Deep Thinking and deterministic mock fallback.
- Added `clawguard agent run --think`, `--no-think`, and `--thinking-iterations <n>`.
- Added `clawguard agent thinking show <session-id>` for saved thinking artifacts.
- Added thinking artifacts under `.clawguard/agent/thinking/`.
- Added audit events for `thinking.started`, `thinking.context`, `thinking.critique`, and `thinking.completed`.
- Added automatic role-aware context for tasks such as cafe marketing manager when a role pack matches.
- Added deterministic critique checks for shallow plans, missing role context, missing memory recall, risky tools, missing read-first inspection, and protected asset references.

## Safety Notes

Deep Thinking is advisory. Final action still goes through the existing ClawGuard tool runtime, autonomy resolver, protected asset guard, approval scope checks, backup, and audit.

Thinking does not grant extra tool access. File writes, cleanup, shell execution, skill installs, durable memory writes, browser/app actions, GitHub external writes, and protected assets remain approval-gated or blocked by the existing safety floor.

Proposals cannot change `agent.thinking`, just as they cannot change `agent.toolAutonomy` or enable automatic memory writes.

## Verification

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check safety_eval/run_eval.mjs
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```

Expected beta.4 hardening baseline:

- Safety eval includes Deep Thinking trigger, critique, protected asset, and config-bypass cases.
- Existing beta.3 autonomy, subagent, approval replay, protected asset, memory, and bridge tests remain green.
