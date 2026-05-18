# ClawGuard Role Intelligence

Role Intelligence is the layer that helps ClawGuard understand a job before doing work in that domain.

The first role pack is:

```sh
clawguard agent role show small-business/cafe/marketing-manager
clawguard agent role run small-business/cafe/marketing-manager --cadence daily
```

## Why It Exists

Many agents fail professional work because they start executing before they understand:

- what the business sells
- what the role is responsible for
- what the daily, weekly, monthly, and event-driven routines are
- what the agent can decide alone
- what needs owner approval
- what is forbidden

Role Intelligence makes that understanding explicit and auditable.

## Seven Artifacts

Every role pack must include these artifacts:

1. `domain_frame`
2. `purpose_and_risk`
3. `role_vocabulary`
4. `cadence_map`
5. `decision_authority`
6. `feedback_loop`
7. `constraints`

Hard rule: ClawGuard does not produce task inventory before `decision_authority` exists.

Role packs should also include `validationQuestions`: a short list of questions the agent should ask the business owner before real-world use. This keeps inferred role knowledge useful without pretending it is already verified.

## A-S-FLC Routes

Each role action is evaluated through A-S-FLC:

```text
exact positives - buffered estimated negatives = net decision signal
```

The result becomes one of:

- `LOCAL`
- `VERIFY_FIRST`
- `APPROVAL_REQUIRED`
- `ESCALATE`
- `BLOCK`

For a cafe marketing manager, drafting a social post can be local. Publishing it is approval-required. Fake reviews and unsafe health claims are blocked.

## Current CLI

```sh
clawguard agent role list
clawguard agent role show small-business/cafe/marketing-manager
clawguard agent role run small-business/cafe/marketing-manager --cadence daily
clawguard agent role run small-business/cafe/marketing-manager --cadence weekly
clawguard agent role run small-business/cafe/marketing-manager --cadence monthly
clawguard agent role run small-business/cafe/marketing-manager --cadence event
```

Use `--json` for machine-readable output.

## Next Good Packs

The most useful next packs are:

- small-business/restaurant/marketing-manager
- small-business/retail/store-manager
- small-business/cafe/owner-operator
- financial-services/customer-support-agent
- software-company/release-manager

Each pack should stay procedural and governed. It should not contain executable code.

## Pack Quality Rules

ClawGuard rejects malformed role packs when they load:

- duplicate action IDs
- cadence tasks that reference missing actions
- actions without A-S-FLC chains
- missing seven-artifact role model

This is intentional. Role packs are professional operating knowledge, so a broken pack should fail closed instead of quietly producing shallow task lists.
