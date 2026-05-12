# ClawGuard v0.1.27

This release adds a toy shop SOP Pack so ClawGuard can demonstrate product-safety governance, not only food and cash handling.

## Added

- Added `small-business/toy-shop/daily-close` SOP Pack.
- Added complete and incomplete example workflows for toy shop daily close.
- Added product safety source links for CPSC recalls, CPSC tracking labels, CPSC recalled-product resale guidance, and FTC advertising basics.
- Added SOP tests for toy shop industry shortcut resolution, block decisions, and allow decisions.
- Improved generated SOP workflow templates with a toy shop default task.

## Try It

```bash
npx --yes --package @denial-web/clawguard@0.1.27 clawguard sop list
npx --yes --package @denial-web/clawguard@0.1.27 clawguard sop init --industry toy-shop --out toy-shop-close.json
npx --yes --package @denial-web/clawguard@0.1.27 clawguard sop check --industry toy-shop toy-shop-close.json
```

