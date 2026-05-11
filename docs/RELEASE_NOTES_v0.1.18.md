# ClawGuard v0.1.18

This release adds explainable model routing.

## Added

- `clawguard model recommend` for local, cheap, strong, and premium model profile selection.
- Rule-based routing signals for privacy, tool risk, task type, and estimated token size.
- `.clawguard.json` `modelRouting` config with profile models, fallbacks, approval profiles, and context thresholds.
- Budget-aware model recommendations when selected model pricing is configured.
- Model routing documentation and team smoke-test instructions.

## Notes

The router is intentionally explainable. It does not yet call an LLM to classify ambiguous tasks. That keeps the first version deterministic, testable, and safe to use as a policy gate before adding optional AI-assisted routing later.
