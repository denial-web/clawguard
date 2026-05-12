# Recovery Model

ClawGuard recovery starts with local agent actions. The first goal is to recover or contain actions ClawGuard can actually control.

## Lifecycle

```text
intent
  -> risk check
  -> approval
  -> pre-action snapshot
  -> execution
  -> verification
  -> closeout or recovery
```

The recovery model is evidence-first. Every governed action should have a journal record before execution.

## Recoverability

| Recoverability | Meaning | ClawGuard behavior |
| --- | --- | --- |
| `reversible` | Local state can be restored from a snapshot. | Restore snapshot and quarantine current state. |
| `compensating` | True rollback is not available, but an incident or correction record can be created. | Open incident and preserve evidence. |
| `irreversible` | Action cannot safely be undone by ClawGuard. | Block unless a bank-approved procedure exists. |

## Recoverable Local Actions

Examples:

- skill install into a trusted local folder
- local workflow JSON update
- SOP state file update
- generated config file update
- local approval queue mistake before apply

Recovery behavior:

- find the action journal record
- locate the pre-action snapshot
- move the current target to recovery quarantine
- restore the snapshot
- append a recovery event to the journal

## Compensating Actions

Examples:

- external message already sent
- customer service draft pasted into a third-party tool
- model response already shared with a staff member
- SOP was marked complete and later found incomplete

ClawGuard should not pretend these are rolled back. It should:

- open an incident
- record what happened
- preserve action journal evidence
- require human review
- produce a compensating action, such as reopening the case or invalidating completion

## Irreversible Or Bank-Controlled Actions

Examples:

- money transfer
- refund
- account freeze
- card status change
- loan approval
- KYC approval
- AML case closure

These are blocked in the MVP. ClawGuard can only support them later through bank-approved APIs, maker-checker controls, reconciliation, and official operational procedures.

## Audit Integrity

Action journals can be hash chained:

```bash
clawguard action record --type write-local --target ./file.json --hash-chain
clawguard action verify --journal ./.clawguard/actions.jsonl
```

Verification checks:

- each record hash matches the record contents
- each `previousHash` points to the prior record hash

This is not a replacement for a bank SIEM or immutable storage system, but it gives early pilots a tamper-evident local evidence trail.

