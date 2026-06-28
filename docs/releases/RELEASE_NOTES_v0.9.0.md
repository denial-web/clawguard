# ClawGuard Agent v0.9.0

ClawGuard Agent v0.9.0 adds memory review and consolidation so hybrid memory can stay useful after the cold-start phase.

## New Memory Lifecycle Commands

- `clawguard agent memory review`
- `clawguard agent memory approve <approval-id>`
- `clawguard agent memory reject <approval-id>`
- `clawguard agent memory remove <memory-id>`
- `clawguard agent memory replace <memory-id> --content <text>`
- `clawguard agent memory consolidate <query>`

## Highlights

- Memory approvals are visible from the agent memory surface.
- Approved memory proposals can be decided and saved through `clawguard agent memory approve`.
- Removed memory records are tombstoned in append-only JSONL instead of silently deleted.
- Replacements supersede old records while preserving history.
- Consolidation proposes merged memories for approval instead of silently writing them.
- List, search, recall, export, and markdown mirrors now use the effective memory view.
- The local Agent Dashboard exposes memory approvals separately from bridge approvals.

## Safety Boundary

v0.9 does not make memory self-editing or autonomous. Durable memory creation, consolidation, and sensitive/business-rule memory remain approval-gated. Removal and replacement preserve an append-only trail so business users can review how memory changed over time.

## Verification

Release checks should include:

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check src/web-server.js
node --check safety_eval/run_eval.mjs
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```
