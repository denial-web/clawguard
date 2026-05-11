# Run Plan

`clawguard run-plan` combines the core ClawGuard gates into one non-destructive decision.

It checks:

- Skill scan and policy decision.
- Model routing recommendation.
- Budget decision when selected model pricing is configured.
- Optional approval request with all evidence in one payload.

## Command

Create a starter config first:

```bash
clawguard init --profile local-first
```

```bash
clawguard run-plan \
  --config .clawguard.json \
  --skill ./candidate-skill \
  --task "Install and run this skill" \
  --privacy medium \
  --tool-risk high \
  --input-tokens 12000 \
  --output-tokens 2000 \
  --approval-out ./.clawguard/approvals.jsonl
```

Run plans do not install skills, execute files, install dependencies, or call model providers. They are safe to run before an agent grants trust.

## Output

The JSON output uses `schemaVersion: "clawguard.runPlan.v1"` and includes:

- `decision`: combined governance decision.
- `skill`: scan/policy summary.
- `modelRecommendation`: selected model profile and budget decision.
- `requiredActions`: combined required actions.
- `approvalRequest`: pending approval metadata when `--approval-out` is used.

## Exit Codes

- `0`: plan is allowed.
- `1`: plan needs approval or manual review.
- `2`: plan is blocked and no approval queue was requested.

When `--approval-out` is supplied and the plan is non-allow, ClawGuard writes a pending approval and exits `1` so automation can pause for the owner.

## Why It Matters

OpenClaw, Hermes Agent, and similar runtimes may discover skills and choose models automatically. A run plan gives them one checkpoint before trust is granted:

```text
candidate skill + task
        ↓
ClawGuard run-plan
        ↓
skill risk + model route + budget
        ↓
allow / approval request / block
```
