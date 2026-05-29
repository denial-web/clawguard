# ClawGuard v0.2.0

This release adds **ClawGuard Agent**, a standalone public AI agent runtime inside the existing npm package.

The agent can inspect projects, plan work, use a small governed tool set, request approval for risky actions, create backups, write hash-chained audit logs, load trusted `SKILL.md` folders, and keep conservative JSONL memory.

## Added

- Added `clawguard agent init`, `chat`, `run`, `tools list`, `skills list`, `memory list`, and `audit show`.
- Added governed file tools for listing, reading, diffing, and approval-gated safe writes.
- Added approval-gated argv-only shell execution with no unrestricted shell command mode.
- Added safe project cleanup demo through `clawguard agent run "clean this project and remove unnecessary files"`.
- Added trusted `SKILL.md` loading with scan and approval checks before risky skills are treated as loadable.
- Added conservative memory storage with explicit approval for sensitive or durable writes.
- Added hash-chained agent audit logs under `.clawguard/agent/audit.jsonl`.
- Added model provider routing for mock, OpenAI, Anthropic, Gemini, OpenRouter-compatible APIs, and Ollama/local fetch calls.
- Added `clawguard agent proposal validate` and `clawguard agent proposal run` for local/mobile action proposal handoff.
- Added `schemas/agent-action-proposal.schema.json` for proposal producers.
- Added `npm run safety:eval` with deterministic fixtures for route, proposal, and skill-safety checks.

## Important

ClawGuard Agent v0.2.0 is intentionally bounded. It does not ship unrestricted shell execution, browser control, payment tools, or external write APIs. Risky local actions pass through policy, approval, backup, and audit.

Generated safety-eval reports under `safety_eval/out/` are local artifacts and are not part of the npm package.

## Try It

```bash
npx --yes --package @denial-web/clawguard@0.2.0 clawguard --version
npx --yes --package @denial-web/clawguard@0.2.0 clawguard agent init
npx --yes --package @denial-web/clawguard@0.2.0 clawguard agent run "inspect this project and propose safe cleanup"
npx --yes --package @denial-web/clawguard@0.2.0 clawguard agent tools list
```

For local source checkout verification:

```bash
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```
