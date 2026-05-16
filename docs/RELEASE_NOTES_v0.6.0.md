# ClawGuard v0.6.0

This release adds a local Agent Dashboard to the ClawGuard web demo.

v0.6 is a visibility release: it makes the governed agent state easier to inspect without expanding the execution boundary. Browser/app actions remain proposal-first, and ClawGuard core still only executes the narrow read-only bridge actions introduced in v0.5 when explicitly enabled.

## Added

- Added `GET /api/agent-dashboard` to the local web server.
- Added an Agent Dashboard panel to the web demo.
- The dashboard shows:
  - pending approval counts
  - recent approval summaries
  - recent audit events
  - audit hash-chain verification status
  - recent memory records
  - browser bridge configuration
  - supported bridge execution tools
- Added dashboard tests with an isolated temporary workspace.
- Updated the web demo docs to describe the dashboard safety model.

## Safety Boundary

ClawGuard Agent v0.6.0 does not add:

- browser clicks
- browser typing
- form submission
- downloads/uploads
- purchases/payments/transfers
- desktop app actions
- credential entry
- unrestricted shell execution

The dashboard is read-only. It reads local `.clawguard/` state and does not approve, deny, install, execute, or mutate agent actions.

## Try It

From a source checkout:

```bash
npm run web -- --port 4176
```

Open:

```text
http://127.0.0.1:4176
```

The Agent Dashboard appears below the approval loop demo and shows the current workspace runtime state.

For published package smoke tests:

```bash
npx --yes --package @denial-web/clawguard@0.6.0 clawguard --version
npx --yes --package @denial-web/clawguard@0.6.0 clawguard agent bridge spec
npx --yes --package @denial-web/clawguard@0.6.0 clawguard demo quickstart
```

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
