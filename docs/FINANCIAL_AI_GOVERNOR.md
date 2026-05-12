# ClawGuard Financial AI Governor

ClawGuard Financial AI Governor is a policy, approval, model-routing, recovery, and audit layer for financial institutions piloting AI agents.

It is designed for internal governed workflows first:

- employee copilots
- internal document review
- customer support drafting
- fraud or compliance triage support
- SOP evidence checks
- controlled agent skill installs

It is not a core banking system and it must not be presented as bank-ready without legal, compliance, security, and bank partner review.

## Positioning

Financial institutions should not start with fully autonomous money-moving agents. The safer first path is a controlled environment where agents can read, draft, recommend, and prepare evidence while humans approve regulated or customer-impacting outcomes.

ClawGuard keeps the same posture:

```text
agent intent
  -> action classification
  -> data classification
  -> policy decision
  -> approval if needed
  -> pre-action snapshot where possible
  -> append-only action journal
  -> recovery or incident record if something goes wrong
```

## Global-Bank Control Patterns

The design follows common patterns used by mature financial institutions:

- controlled internal AI environments
- private or approved model routes for sensitive data
- human approval for regulated decisions
- separation between maker, checker, and auditor
- immutable evidence logs
- incident response and operational resilience planning
- clear non-goals for autonomous payments and final customer decisions

Reference anchors:

- NIST SSDF SP 800-218 for secure development practices
- NIST SP 800-61 Rev. 3 for incident response lifecycle
- OWASP LLM Top 10 for prompt injection, sensitive information disclosure, and excessive agency
- DORA-style operational resilience expectations
- MAS-style fairness, ethics, accountability, and transparency posture
- NBC Cambodia technology and cyber risk management expectations

## Action Classes

ClawGuard action governance uses these classes:

| Action | Meaning | Default financial-governor decision |
| --- | --- | --- |
| `read` | Inspect files or data. | Allow for low-risk internal data; review for sensitive data. |
| `draft` | Create suggested text. | Allow for low-risk internal data; review for sensitive data. |
| `recommend` | Produce decision support. | Allow for low-risk internal data; review for sensitive data. |
| `write-local` | Modify local workflow files. | Manual review and snapshot. |
| `install-skill` | Trust a candidate skill. | Manual review and snapshot. |
| `send-external` | Send data outside the local environment. | Manual review or dual approval for sensitive data. |
| `customer-impacting` | Affect a customer case, card, loan, fraud status, or account record. | Dual approval. |
| `money-movement` | Transfer, pay, refund, reverse, settle, debit, or credit. | Block in the MVP. |

## Data Classes

Supported data classes:

- `public`
- `internal`
- `confidential`
- `customer-pii`
- `payment-data`
- `credentials`
- `regulatory`

Sensitive classes should default to private or bank-approved models. Public models should not receive customer PII, payment data, credentials, or regulated records unless a bank explicitly configures and approves that route.

## Config Profiles

Starter profiles:

- `financial-internal`: internal employee workflows with strong controls.
- `financial-sensitive`: customer or regulatory data workflows requiring tighter review.
- `financial-critical`: critical workflows where even local/private model use is approval-gated.

Create one:

```bash
clawguard init --profile financial-internal
clawguard init --profile financial-sensitive
clawguard init --profile financial-critical
```

The templates intentionally use placeholder model names and placeholder pricing. Replace them with bank-approved providers, models, and current pricing before production use.

## CLI Examples

Block money movement:

```bash
clawguard action plan \
  --type money-movement \
  --data-class payment-data \
  --task "Transfer $100 from one customer account to another"
```

Plan a local file update:

```bash
clawguard action plan \
  --type write-local \
  --data-class internal \
  --target ./case-note.json \
  --task "Update an internal case note"
```

Record the planned action and capture a snapshot:

```bash
clawguard action record \
  --type write-local \
  --data-class internal \
  --target ./case-note.json \
  --journal ./.clawguard/actions.jsonl \
  --hash-chain
```

Recover from a bad local update:

```bash
clawguard action recover \
  --id <action-id> \
  --journal ./.clawguard/actions.jsonl
```

Open an incident from the action:

```bash
clawguard incident open \
  --from-action <action-id> \
  --journal ./.clawguard/actions.jsonl \
  --reason "Agent updated the wrong local workflow file"
```

## Financial SOP Packs

The financial-governor track also includes starter SOP Packs for internal support workflows:

- `financial-services/customer-complaint-triage`
- `financial-services/kyc-document-intake`
- `financial-services/fraud-alert-review`

These packs check whether an AI-assisted workflow has required evidence, approval, escalation, and privacy controls before the agent can mark the workflow complete. They intentionally block final regulated actions such as sending final complaint responses, approving KYC, freezing accounts, or closing high-risk fraud alerts without human approval.

```bash
clawguard sop init --industry banking-complaints --out complaint-triage.json
clawguard sop init --industry banking-kyc --out kyc-intake.json
clawguard sop init --industry banking-fraud --out fraud-review.json
clawguard sop check --pack financial-services/fraud-alert-review examples/sop-workflows/fraud-alert-review-incomplete.json
```

## Non-Goals

ClawGuard Financial AI Governor does not:

- move money
- reverse real banking transactions
- approve KYC, AML, cards, loans, account freezes, or customer-impacting final decisions
- replace bank compliance, legal, model-risk, or security review
- guarantee an AI agent is safe

For irreversible external actions, ClawGuard creates a compensating incident record and escalation path. It must never claim rollback of a real banking transaction unless integrated with official bank reversal APIs and approved operating procedures.
