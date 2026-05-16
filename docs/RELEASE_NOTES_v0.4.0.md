# ClawGuard v0.4.0

This release moves ClawGuard Agent toward governed browser/app automation without adding unrestricted operator control.

The focus is a safe bridge boundary: external browser/app executors can propose one action at a time, while ClawGuard validates, explains, approval-gates, and audits the action before any bridge can execute it.

## Added

- Added browser/app proposal tools:
  - `browser.open`
  - `browser.extract`
  - `browser.click_proposed`
  - `browser.type_proposed`
  - `app.open_proposed`
  - `app.action_proposed`
- Added dry-run bridge execution for browser/app proposals.
- Added `clawguard agent proposal explain <proposal.json>`.
- Added `clawguard agent bridge spec`.
- Added safe `web.research` recipe.
- Added bundled `web-research-safe` skill.
- Added browser bridge config keys under `.clawguard.json.agent.integrations.browserBridge`.
- Expanded safety eval fixtures for credential URLs, private URLs, hidden clicks, payment clicks, password typing, and app actions.
- Added [Browser/App Bridge Spec](BROWSER_BRIDGE_SPEC.md).

## Important

ClawGuard Agent v0.4.0 still does not perform real browser clicking, form filling, desktop control, payments, email/calendar writes, or credential entry inside ClawGuard core.

Browser/app control remains dry-run/proposal-first. External bridges must execute only approved action ids, one action at a time.

## Try It

```bash
npx --yes --package @denial-web/clawguard@0.4.0 clawguard agent init
npx --yes --package @denial-web/clawguard@0.4.0 clawguard agent bridge spec
npx --yes --package @denial-web/clawguard@0.4.0 clawguard agent proposal explain ./browser-open.json
npx --yes --package @denial-web/clawguard@0.4.0 clawguard agent run --recipe web.research
```

For local source checkout verification:

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check safety_eval/run_eval.mjs
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```

