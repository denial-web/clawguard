# ClawGuard v0.6.1

This patch release fixes stale public bridge-spec wording after the v0.6 dashboard release.

## Fixed

- Updated `clawguard agent bridge spec` so the hard-boundary text no longer refers to v0.5 while running in the v0.6 series.

## Safety Boundary

No behavior changed. The Agent Dashboard remains read-only, and bridge execution remains limited to explicitly enabled read-only `browser.open` and `browser.extract` actions.

## Verification

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check src/web-server.js
node --check web/app.js
node --check safety_eval/run_eval.mjs
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```
