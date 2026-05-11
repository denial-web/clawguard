# ClawGuard v0.1.19

This release adds unified run plans.

## Added

- `clawguard run-plan` combines skill scan, model routing, and budget policy into one governance decision.
- Run plan JSON output with `schemaVersion: "clawguard.runPlan.v1"`.
- Approval requests now include model recommendation and budget context when created from a run plan.
- Run plan documentation and team smoke-test instructions.

## Notes

Run plans are non-destructive. They do not install skills, execute code, install dependencies, or call model providers. They are intended as the checkpoint an agent runtime can call before granting trust or starting a costly model run.
