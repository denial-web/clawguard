# ClawGuard v0.5.0

This release adds the first narrow sandboxed browser bridge executor to ClawGuard Agent.

v0.5 keeps the v0.4 safety posture: browser/app actions are still governed proposals first. ClawGuard core now executes only read-only browser actions, and only when the browser bridge is explicitly enabled in config.

## Added

- Added `clawguard agent bridge execute <proposal.json>`.
- Added sandboxed bridge execution for:
  - `browser.open`
  - `browser.extract`
- Added bridge drivers:
  - `fetch` for lightweight read-only page retrieval and extraction.
  - `playwright` for isolated headless browser page open/extract when dependencies and browsers are available.
- Added approval-gated private/local URL execution:
  - proposal must be high-risk
  - proposal must set `allowPrivate: true`
  - config must set `agent.integrations.browserBridge.allowPrivateUrls: true`
  - user approval must be recorded before execution
- Added bridge execution audit events.
- Added `agent.integrations.browserBridge.driver`.
- Added tests for disabled bridge execution, private URL approval, extraction, and proposal-only click blocking.

## Important

ClawGuard Agent v0.5.0 still does not execute:

- browser clicks
- browser typing
- form submission
- downloads/uploads
- purchases/payments/transfers
- desktop app actions
- credential entry

Those actions remain proposal-only and approval-gated for external bridges.

## Try It

Enable the bridge in `.clawguard.json`:

```json
{
  "agent": {
    "integrations": {
      "browserBridge": {
        "enabled": true,
        "driver": "fetch",
        "allowPrivateUrls": false,
        "allowedDomains": []
      }
    }
  }
}
```

Run:

```bash
npx --yes --package @denial-web/clawguard@0.5.0 clawguard agent bridge spec
npx --yes --package @denial-web/clawguard@0.5.0 clawguard agent proposal explain ./browser-open.json
npx --yes --package @denial-web/clawguard@0.5.0 clawguard agent bridge execute ./browser-open.json --driver fetch
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

