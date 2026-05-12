# ClawGuard v0.1.30

This release adds the first **ClawGuard Financial AI Governor** slice for internal banking and financial-services AI governance pilots.

## Added

- `clawguard action plan` to classify financial agent actions and return allow, manual review, dual approval, or block.
- `clawguard action record` to write an action journal record and capture pre-action snapshots for reversible local actions.
- `clawguard action recover` to restore a local snapshot and quarantine the current target when recovery is possible.
- `clawguard action verify` to detect action journal tampering through record hashes and hash-chain links.
- `clawguard incident open` and `clawguard incident close` for incident-grade evidence records.
- Financial governance config templates:
  - `financial-internal`
  - `financial-sensitive`
  - `financial-critical`
- Financial governance docs:
  - `docs/FINANCIAL_AI_GOVERNOR.md`
  - `docs/RECOVERY_MODEL.md`

## Safety Defaults

- Money movement is blocked in the MVP.
- Customer-impacting actions require maker-checker approval.
- Sensitive same-maker/same-checker flows are blocked.
- Local file and skill-install actions can capture snapshots before execution.
- Non-recoverable actions produce compensating-record guidance instead of fake rollback claims.

## Verify

```bash
npm test
npx --yes --package @denial-web/clawguard@0.1.30 clawguard action plan --type money-movement --data-class payment-data --task "Transfer customer funds"
```

