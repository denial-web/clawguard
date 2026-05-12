# ClawGuard v0.1.26

This release expands SOP Packs beyond the original milk tea demo into broader small-business coverage.

## Added

- Added `small-business/cafe/closing` SOP Pack.
- Added `small-business/mart/daily-close` SOP Pack.
- Added complete and incomplete example workflows for cafe closing.
- Added complete and incomplete example workflows for mart daily close.
- Added SOP tests for cafe and mart industry shortcut resolution, block decisions, and allow decisions.
- Improved generated SOP workflow templates with better default tasks for cafe, milk tea, and mart workflows.

## Try It

```bash
npx --yes --package @denial-web/clawguard@0.1.26 clawguard sop list
npx --yes --package @denial-web/clawguard@0.1.26 clawguard sop init --industry cafe --out cafe-close.json
npx --yes --package @denial-web/clawguard@0.1.26 clawguard sop init --industry mart --out mart-close.json
npx --yes --package @denial-web/clawguard@0.1.26 clawguard sop check --industry cafe cafe-close.json
```

