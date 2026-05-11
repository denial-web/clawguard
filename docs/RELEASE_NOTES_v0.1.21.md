# ClawGuard v0.1.21

This release upgrades the local web demo from a scanner view into a fuller governed install planner.

## Added

- Web demo run-plan controls for task, profile, privacy, tool risk, and token estimates.
- `/api/run-plan` for combining the current scan result with model routing and budget checks.
- Run-plan result panel with skill gate, recommended model profile, budget decision, command, and routing signals.
- Web-server test coverage for generating a run plan from a scan result.

## Updated

- Demo screenshots and video now show the run-plan flow after scanning a risky dependency skill.
- Web demo documentation now mentions the combined skill gate, model routing, and budget decision.
