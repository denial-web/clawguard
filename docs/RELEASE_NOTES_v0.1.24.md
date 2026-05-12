# ClawGuard v0.1.24

This release introduces the first SOP Pack MVP, starting with a small-business milk tea shop closing checklist.

## Added

- `clawguard sop list` to show built-in SOP packs.
- `clawguard sop check --pack <id> <workflow.json>` to evaluate a workflow against an SOP pack.
- `--industry milk-tea` resolution for the default milk tea SOP pack.
- `sop-packs/small-business/milk-tea/closing.json`.
- `schemas/sop-pack.schema.json`.
- Example complete and incomplete milk tea closing workflows.

## What The Milk Tea Pack Checks

- Boba discard time.
- Tea batch discard time.
- Fridge temperature log.
- Topping expiry labels.
- Cleaning log.
- Cash reconciliation and cash variance threshold.
- Delivery app reconciliation.
- Incident and complaint review.
- Manager sign-off before close completion.

## Verify

```sh
npm test
npx --yes --package @denial-web/clawguard@0.1.24 clawguard sop list
npx --yes --package @denial-web/clawguard@0.1.24 clawguard sop check --pack small-business/milk-tea/closing examples/sop-workflows/milk-tea-closing-incomplete.json
```
