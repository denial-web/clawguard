# ClawGuard v0.1.25

This release adds editable SOP workflow template generation.

## Added

- `clawguard sop init --pack <id> --out <workflow.json>`.
- `clawguard sop init --industry milk-tea --out <workflow.json>`.
- Default SOP workflow path generation when `--out` is omitted.
- Overwrite protection for generated workflow files, with `--force` when needed.
- Generated milk tea closing workflow templates with evidence, approvals, metrics, notes, and safe default actions.

## Verify

```sh
npm test
npx --yes --package @denial-web/clawguard@0.1.25 clawguard sop init --pack small-business/milk-tea/closing --out milk-tea-close.json
npx --yes --package @denial-web/clawguard@0.1.25 clawguard sop check --pack small-business/milk-tea/closing milk-tea-close.json
```
