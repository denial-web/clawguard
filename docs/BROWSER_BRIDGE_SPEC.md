# ClawGuard Browser/App Bridge Spec

ClawGuard Agent v0.5 treats browser and app control as governed proposals first, with a narrow sandboxed read-only executor for public/manual-review browser actions.

ClawGuard core validates, approval-gates, and audits. It can execute only `browser.open` and `browser.extract` through `clawguard agent bridge execute`. It does not click, type, submit forms, open desktop apps, enter credentials, buy, pay, or transfer funds.

## Flow

```text
bridge proposes one action JSON
clawguard validates the proposal
clawguard explains risk and boundaries
clawguard runs the proposal as a dry-run or pending approval
human approves when required
bridge executes only the approved action id
bridge returns a result for audit
```

## Commands

```bash
clawguard agent bridge spec
clawguard agent proposal validate ./browser-open.json
clawguard agent proposal explain ./browser-open.json
clawguard agent proposal run ./browser-open.json
clawguard agent bridge execute ./browser-open.json --driver fetch
```

## Proposal Tools

- `browser.open`
- `browser.extract`
- `browser.click_proposed`
- `browser.type_proposed`
- `app.open_proposed`
- `app.action_proposed`

## Hard Boundaries

- No blanket bridge permission.
- One approval covers one action id.
- Credential URLs are blocked.
- Localhost/private URLs are blocked unless explicitly high-risk allowed.
- Password, token, seed phrase, payment card, and credential fields are blocked.
- Submit, send, purchase, payment, transfer, and delete clicks require high-risk approval.
- Hidden or ambiguous selectors are blocked.
- ClawGuard core executes only `browser.open` and `browser.extract`.
- `browser.click_proposed`, `browser.type_proposed`, `app.open_proposed`, and `app.action_proposed` remain proposal-only.
- Actual bridge execution is disabled unless `.clawguard.json` sets `agent.integrations.browserBridge.enabled` to `true`.
- Private/local URL execution requires high-risk approval and `agent.integrations.browserBridge.allowPrivateUrls`.

## Example

```json
{
  "schemaVersion": "clawguard.agentActionProposal.v1",
  "source": "browser-bridge",
  "task": "Review a public pricing page.",
  "tool": "browser.open",
  "args": {
    "url": "https://example.com/pricing",
    "purpose": "Open a public page for manual review."
  },
  "risk": "low",
  "reason": "Read-only public page review."
}
```

## Bridge Result

External bridges should return:

```json
{
  "actionId": "proposal-id",
  "ok": true,
  "status": "completed",
  "summary": "Opened the approved public page.",
  "artifacts": []
}
```
