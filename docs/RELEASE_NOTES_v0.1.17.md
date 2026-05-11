# ClawGuard v0.1.17

This release adds the first provider-neutral budget governance gate.

## Added

- `clawguard budget check` estimates request cost from input/output tokens and model pricing.
- CLI pricing flags: `--input-usd-per-1m`, `--output-usd-per-1m`, `--approval-usd`, and `--max-usd`.
- Token hard limits: `--max-input-tokens`, `--max-output-tokens`, and `--max-total-tokens`.
- `.clawguard.json` support for approved budget limits and model pricing.
- JSONL audit logging for budget decisions with `--audit-log`.
- Budget governance documentation and team smoke-test instructions.

## Notes

Budget checks are estimate-based in this release. ClawGuard does not hardcode provider prices or read live provider billing APIs yet. Agent runtimes should feed estimated or measured token counts into this command before high-cost requests.
