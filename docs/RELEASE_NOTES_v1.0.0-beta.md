# ClawGuard v1.0.0 Beta Release Notes

ClawGuard Agent v1.0.0 beta focuses on governed local autonomy: the agent can inspect projects, use memory, follow role-aware procedures, and propose work, while risky actions remain gated by policy, approval, backup, and audit.

## Highlights

- Added local protected asset policy for secrets, databases, customer data, backups, and configured company assets.
- Added `clawguard agent protected` commands to list, add, block, and check protected assets.
- Protected reads, diffs, writes, cleanup moves, and destructive shell commands now require approval or are blocked before content is revealed or changed.
- Added destructive database/system command detection for `DROP DATABASE`, `TRUNCATE`, `DELETE FROM`, `kubectl delete`, cloud storage deletes, and inline interpreter deletion attempts.
- Added protected-asset safety eval cases and a deterministic protected-asset demo.
- Added Role Intelligence as the first "understand the job before acting" layer, with A-S-FLC routes for role actions.
- Documented the key boundary: memory guides the agent, but protected asset policy gates the tools.

## Stable Beta Commands

```bash
clawguard agent init
clawguard agent run
clawguard agent chat
clawguard agent tools list
clawguard agent skills list
clawguard agent protected list
clawguard agent protected add
clawguard agent protected block
clawguard agent protected check
clawguard agent memory list
clawguard agent memory review
clawguard agent audit show
```

## Protected Asset Example

```bash
clawguard agent protected add company-prod-db --type database --path data/prod.sqlite
clawguard agent protected block customer-backups --type customer_data --path backups/customer/**
clawguard agent protected check data/prod.sqlite --operation write
clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"
```

## Verification

Current local verification:

- `npm test`: 244/244 passing
- `npm run safety:eval`: 27/27 passing
- `npm run demo:protected-assets`: passing
- `npm pack --dry-run`: passing

## Security Boundary

This is a local beta guard, not a full enterprise control plane. Banking, government, and regulated deployments still need organization policy distribution, RBAC, dual approval, encrypted policy storage, and remote audit anchoring.
