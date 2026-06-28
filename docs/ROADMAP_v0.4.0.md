# ClawGuard Agent v0.4.0 Roadmap

## Goal

Make ClawGuard Agent meaningfully stronger for real task automation while keeping browser and app control governed by default.

Status: started on `main`. Proposal validation, dry-run bridge tools, `proposal explain`, `bridge spec`, `web.research`, the bundled `web-research-safe` skill, and browser/app safety eval fixtures are implemented locally for the next release.

v0.4 should not become an unrestricted operator. It should become the safe control plane for browser/app actions:

```text
external browser/app bridge -> ClawGuard proposal validation -> policy -> approval -> audit -> optional sandbox executor
```

## Product Position

ClawGuard should compete with OpenClaw, Hermes Agent, and Manus on usefulness, but win on trust.

The v0.4 message:

```text
ClawGuard Agent can coordinate browser and app actions, but risky operations are proposed, validated, approved, and audited before execution.
```

## Scope

### Must Build

- Proposal support for browser/app actions:
  - `browser.open`
  - `browser.extract`
  - `browser.click_proposed`
  - `browser.type_proposed`
  - `app.open_proposed`
  - `app.action_proposed`
- Validation rules that block:
  - credential URLs
  - localhost/private URLs unless explicitly allowed
  - password, token, seed phrase, payment, or financial transfer form actions
  - hidden or ambiguous selectors
  - unapproved submit/send/purchase/delete actions
- A browser bridge spec for external executors.
- A dry-run executor that only prints the proposed browser/app action and records audit.
- Policy categories for navigation, extraction, form input, submit, download, upload, and destructive app actions.
- Tests and safety eval fixtures for malicious browser/app proposals.

### Should Build

- `clawguard agent proposal explain <proposal.json>`
- `clawguard agent bridge spec`
- `clawguard agent run --recipe web.research`
- Bundled skill: `web-research-safe`
- Config keys under `.clawguard.json.agent.integrations.browserBridge`.

### Do Not Build Yet

- Real browser clicking inside ClawGuard core.
- Desktop control.
- Email/calendar/slack write actions.
- Payment or purchase tools.
- Password manager or credential autofill.
- Unrestricted Playwright sessions.

## Proposed Tools

These tools should exist as ClawGuard-governed proposal tools first. Execution may be handled by an external bridge or dry-run adapter.

```text
browser.open
browser.extract
browser.click_proposed
browser.type_proposed
app.open_proposed
app.action_proposed
```

Risk defaults:

| Tool | Default Risk | Approval |
| --- | --- | --- |
| `browser.open` | low | none unless blocked domain |
| `browser.extract` | low | none unless sensitive page |
| `browser.click_proposed` | medium | required for submit/delete/send/buy |
| `browser.type_proposed` | medium | required when field may contain sensitive data |
| `app.open_proposed` | medium | approval for non-allowlisted apps |
| `app.action_proposed` | high | always |

## Proposal Shape

Example:

```json
{
  "schemaVersion": "clawguard.agentActionProposal.v1",
  "source": "browser-bridge",
  "task": "Research pricing for a competitor product.",
  "tool": "browser.open",
  "args": {
    "url": "https://example.com/pricing",
    "purpose": "Open public pricing page for read-only research."
  },
  "risk": "low",
  "reason": "The page is public and no form submission is requested."
}
```

High-risk example:

```json
{
  "schemaVersion": "clawguard.agentActionProposal.v1",
  "source": "browser-bridge",
  "task": "Submit a support ticket.",
  "tool": "browser.click_proposed",
  "args": {
    "url": "https://example.com/support",
    "selector": "button[type=submit]",
    "label": "Submit",
    "intent": "submit_form"
  },
  "risk": "high",
  "reason": "This submits a message to an external service."
}
```

## Recipes

Add one safe recipe:

```bash
clawguard agent run --recipe web.research
```

Recipe behavior:

1. Search with configured `web.search`.
2. Fetch public pages with `web.fetch`.
3. Extract summaries.
4. Propose browser openings only when a page needs manual review.
5. Never click, type, submit, log in, buy, or download.

## Browser Bridge Spec

Add a documented external bridge contract:

```text
bridge proposes action JSON
ClawGuard validates proposal
ClawGuard checks policy
ClawGuard requests approval when needed
ClawGuard records audit event
bridge executes only approved action ids
bridge returns execution result JSON
ClawGuard records result audit event
```

The bridge must not receive blanket permission. It receives approval for one action id at a time.

## Acceptance Tests

- Proposal schema accepts valid `browser.open` and `browser.extract`.
- Proposal schema rejects credential URLs and private URLs.
- `browser.click_proposed` submit intent requires high risk and approval.
- `browser.type_proposed` rejects password/token/seed phrase fields.
- `app.action_proposed` always requires approval.
- Dry-run bridge records audit but performs no real click/type/open.
- `web.research` recipe uses only read-only tools and browser proposals.
- Safety eval blocks:
  - credential exfiltration URL
  - localhost admin panel navigation
  - hidden submit button click
  - payment button click
  - password field typing
  - destructive desktop app action

## Release Bar

Before release:

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check safety_eval/run_eval.mjs
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```

After publish:

```bash
npx --yes --package @denial-web/clawguard@0.4.0 clawguard --version
npx --yes --package @denial-web/clawguard@0.4.0 clawguard agent proposal validate ./browser-open.json
npx --yes --package @denial-web/clawguard@0.4.0 clawguard agent proposal explain ./browser-open.json
npx --yes --package @denial-web/clawguard@0.4.0 clawguard agent run --recipe web.research
```

## Sequencing

1. Extend proposal schema and validation.
2. Add dry-run browser/app proposal tools.
3. Add audit records for proposed and approved bridge actions.
4. Add `proposal explain`.
5. Add `bridge spec`.
6. Add `web.research` recipe and `web-research-safe` skill.
7. Add tests and safety eval cases.
8. Update README and release notes.
