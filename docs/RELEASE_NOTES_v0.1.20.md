# ClawGuard v0.1.20

This release adds starter config templates and an onboarding command.

## Added

- `clawguard init` to generate `.clawguard.json`.
- Built-in init profiles:
  - `local-first`
  - `cloud-balanced`
  - `enterprise-strict`
- `clawguard init --list-profiles`.
- `--out` and `--force` support for init.
- Template config files under `configs/`.
- Config template documentation.

## Notes

The starter templates intentionally use placeholder provider/model names and placeholder prices. Replace them with real local model names, cloud model refs, and current provider pricing before using the budgets for production decisions.
