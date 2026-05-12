# Config Templates

ClawGuard ships with starter profiles for local, enterprise, and financial-governance workflows.

## Profiles

- `local-first`: prefers local models for privacy and keeps cloud usage tightly budgeted.
- `cloud-balanced`: balanced cloud-first setup with approval before premium spend.
- `enterprise-strict`: conservative policy, lower budget ceilings, and approval-gated strong/premium models.
- `financial-internal`: internal financial AI workflows with money movement blocked.
- `financial-sensitive`: customer or regulatory data workflows with tighter review.
- `financial-critical`: critical financial workflows with approval-gated model use and stricter action controls.

## Init

Create a config:

```bash
clawguard init --profile local-first
```

Write to a custom path:

```bash
clawguard init --profile cloud-balanced --out ./configs/clawguard.json
```

List profiles:

```bash
clawguard init --list-profiles
```

Overwrite an existing config:

```bash
clawguard init --profile enterprise-strict --force
```

By default, `init` refuses to overwrite `.clawguard.json`.

## Template Files

The same starter configs are available as files:

- `configs/local-first.json`
- `configs/cloud-balanced.json`
- `configs/enterprise-strict.json`
- `configs/financial-internal.json`
- `configs/financial-sensitive.json`
- `configs/financial-critical.json`

These examples intentionally use placeholder provider/model names and placeholder prices. Replace them with your real local model names, cloud provider model refs, and current provider pricing.

## Recommended First Run

After init:

```bash
clawguard run-plan \
  --skill ./path/to/skill \
  --task "Install and run this skill" \
  --privacy medium \
  --tool-risk high \
  --input-tokens 12000 \
  --output-tokens 2000 \
  --approval-out ./.clawguard/approvals.jsonl
```
