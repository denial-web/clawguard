# ClawGuard v1.0.0-beta.3 Release Notes

ClawGuard v1.0.0-beta.3 adds governed autonomy presets, local subagents, stronger skill management, and setup UI controls.

## Highlights

- Added `agent.toolAutonomy` with `personal`, `developer`, `business`, and `strict` presets.
- Added safe-tool overrides for eligible read/search tools such as `file.read`, `git.status`, `memory.search`, `web.search`, `web.fetch`, and GitHub read/draft tools.
- Kept the hard safety floor locked: file writes, cleanup, shell execution, memory writes, skill installs, protected assets, browser/app actions, and external writes cannot silently become full-auto.
- Added `clawguard agent autonomy show|set|set-tool|reset`.
- Added local subagent profiles: `researcher`, `project-inspector`, `release-manager`, `business-operator`, and `security-reviewer`.
- Added `clawguard agent delegate ... --to <profile>` and `clawguard agent run --team ...`.
- Added `clawguard agent skills validate|install|create|trust|remove`.
- Added bundled developer, business, and safety skills.
- Added autonomy controls to `clawguard setup-ui`.
- Hardened approval scope checks so approval IDs cannot be replayed across unrelated subagent, bridge, memory, protected file, or skill-install actions.
- Hardened `web.fetch` and sandboxed bridge fetch execution so public URLs cannot redirect into localhost, private IPs, or link-local addresses.

## Safety Notes

Autonomy is intentionally tiered. Users can make low-risk read/search tools smoother, but ClawGuard still escalates or blocks protected assets such as `.env`, databases, backups, customer data, secrets, system files, and configured protected paths.

Recipes, skills, proposals, and subagents cannot change `agent.toolAutonomy`. Use the explicit CLI or setup UI so ClawGuard can validate the hard safety floor.

Subagent delegation is itself governed. In business and strict modes, `agent run --team` pauses before child workers start; approved IDs are checked against the original request before delegation proceeds.

Bridge and web access remain read-first and bounded. ClawGuard validates direct URLs and followed redirects, blocks credential-bearing URLs, and prevents public-to-private redirect bypasses unless a bridge is explicitly configured for private URL review.

## Verification

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check src/web-server.js
node --check web/app.js
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```

Expected beta.3 hardening baseline:

- `npm run safety:eval` -> `31/31 passed`
- `npm test` -> `263/263 passed`
