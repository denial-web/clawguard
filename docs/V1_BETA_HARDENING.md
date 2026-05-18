# ClawGuard Agent v1.0 Beta Hardening

This is the checklist before calling ClawGuard Agent a v1.0 beta.

## Stable Public Surface

Keep these command groups stable through v1.0 beta:

- `clawguard agent init`
- `clawguard agent run`
- `clawguard agent chat`
- `clawguard agent tools list`
- `clawguard agent skills list`
- `clawguard agent skills show`
- `clawguard agent memory list`
- `clawguard agent memory search`
- `clawguard agent memory recall`
- `clawguard agent memory sessions search`
- `clawguard agent memory bootstrap`
- `clawguard agent memory review`
- `clawguard agent memory approve`
- `clawguard agent memory reject`
- `clawguard agent memory remove`
- `clawguard agent memory replace`
- `clawguard agent memory consolidate`
- `clawguard agent memory export`
- `clawguard agent audit show`
- `clawguard agent proposal validate`
- `clawguard agent proposal explain`
- `clawguard agent proposal run`
- `clawguard agent bridge spec`
- `clawguard agent bridge execute`

## Must Stay True

- No unrestricted shell execution.
- No browser click/type/submit execution in core.
- No payment or money-movement tools.
- No email/calendar/external write APIs without explicit approval and allowlists.
- No silent durable memory writes by default.
- Business-rule and sensitive memory always require approval.
- File writes require approval, diff, and backup.
- Audit log remains hash-chained.
- Removed memory is tombstoned instead of deleted.

## Beta Proofs

Run these before each beta release:

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check src/web-server.js
node --check safety_eval/run_eval.mjs
npm run safety:eval
npm run demo:memory
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```

## External Tester Script

Ask a tester to run:

```bash
mkdir -p ~/clawguard-beta-test
cd ~/clawguard-beta-test
npx --yes --package @denial-web/clawguard clawguard --version
npx --yes --package @denial-web/clawguard clawguard agent init
npx --yes --package @denial-web/clawguard clawguard agent run --recipe project.inspect
npx --yes --package @denial-web/clawguard clawguard agent memory review
npx --yes --package @denial-web/clawguard clawguard agent tools list
```

Ask them:

- Did install work without extra setup?
- Did the agent inspect a project without mutating files?
- Did memory proposals feel understandable?
- Did the approval messages clearly say what would happen?
- Did anything look like the agent could act without permission?

## Good v1.0 Beta Bar

ClawGuard Agent is ready for a v1.0 beta when a new developer can:

1. Install it with `npx` or `npm install -g`.
2. Initialize a workspace.
3. Inspect a project.
4. Run safe recipes.
5. Review and approve memory.
6. Understand every risky action before it happens.
7. Show an auditor where the action and memory decisions were recorded.
