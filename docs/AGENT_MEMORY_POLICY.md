# ClawGuard Agent Memory Policy

This document defines the public beta memory policy for ClawGuard Agent.

## Summary

ClawGuard memory is governed by default. A submitted memory type is treated as a hint, not as the only source of truth. ClawGuard applies content-based policy tags, quality checks, approval gates, redaction, and append-only history before durable memory can influence recall.

## Memory Pipeline

```text
candidate memory
  -> normalize type/content/scope/confidence
  -> redact secret-like values
  -> assign policy tags
  -> run quality checks
  -> require approval if policy says so
  -> append durable memory JSONL record
  -> refresh USER.md / MEMORY.md mirrors
  -> recall through effective memory view
```

## Submitted Types

Supported memory types:

- `EXACT_USER_STATEMENT`
- `INFERRED_PREFERENCE`
- `BUSINESS_RULE`
- `PROJECT_RULE`
- `TASK_OUTCOME`
- `WORKED`
- `FAILED`
- `DECISION`
- `TEMPORARY_CONTEXT`
- `UNVERIFIED`
- `SENSITIVE`

The submitter can be a user, CLI command, recipe, bootstrap flow, or agent proposal. The type is not trusted by itself.

## Policy Tags

ClawGuard assigns policy tags after normalization:

- `sensitive`: record is explicitly sensitive, type is `SENSITIVE`, or redaction changed the content.
- `high-risk-type`: type is `BUSINESS_RULE`, `PROJECT_RULE`, `DECISION`, or `SENSITIVE`.
- `rule-like-content`: content appears to define a rule, restriction, compliance claim, approval rule, or secret-handling instruction.
- `consolidated-memory`: record summarizes or merges older memories.

Rule-like content includes terms such as:

```text
must, always, never, required, requires, prohibited, forbidden,
blocked, cannot, do not, approval required, requires approval,
policy, compliance, regulatory, secret, token, password, api key
```

This is intentionally conservative. It prevents a poisoned prompt or tool result from saving a business rule as a low-risk preference just by choosing `INFERRED_PREFERENCE`.

## Approval Rules

Approval is required when any of these is true:

- `autoWriteMemory` is not enabled.
- type is `BUSINESS_RULE`, `PROJECT_RULE`, `DECISION`, or `SENSITIVE`.
- content is rule-like.
- record is sensitive or secret-like.
- record is a consolidation.

Low-risk preference and task-outcome records may be written without approval only when `agent.autoWriteMemory=true` and no higher-risk policy tag applies.

## Quality Gates

ClawGuard blocks:

- duplicate memories
- vague memories that are too short to be useful
- prompt-injection-style memory such as attempts to ignore prior instructions, reveal secrets, exfiltrate data, disable approval, or bypass policy

The v1.0 beta prompt-injection gate is pattern-based and currently blocks memory candidates containing instruction-like phrases in these families:

```text
ignore previous/prior instructions
system prompt / developer message
reveal secrets
exfiltrate
disable safety / disable approval
bypass ClawGuard / bypass approval / bypass policy
```

ClawGuard sends to manual review:

- sensitive records
- low-confidence or unverified records
- rule-like records submitted as lower-risk types

## Bootstrap Memory

Bootstrap reads project metadata such as:

- `package.json` name, version, and selected scripts
- `README.md` title
- `.clawguard.json` policy and agent safety profile
- local instruction files such as `AGENTS.md`, `CLAUDE.md`, `MEMORY.md`, `USER.md`, and `SOUL.md`
- git remote metadata

Bootstrap does not silently write durable memory. It proposes memory records and queues approvals, because project files can contain prompt injection or stale instructions.

## Consolidation

Consolidation is always approval-gated. It rewrites several memory records into a single summary and could lose nuance or amplify a bad input.

The consolidated record inherits the highest-risk type among its inputs:

```text
SENSITIVE
BUSINESS_RULE / PROJECT_RULE / DECISION
TASK_OUTCOME / WORKED / FAILED
EXACT_USER_STATEMENT / INFERRED_PREFERENCE
UNVERIFIED / TEMPORARY_CONTEXT
```

This prevents a group of mixed records from being downgraded to a low-risk type.

## Effective Memory View

The raw JSONL log is append-only. Normal list/search/recall/export/mirror commands use the effective memory view:

```text
durable memory records
- tombstoned records
- records superseded by replacements
= effective memory
```

Removal appends a tombstone event. Replacement appends a new record with `supersedes=<old-id>`. The old facts stay in the log for audit but stop steering active recall.

## Limits In v1.0 Beta

- Redaction is pattern-based and conservative; it is not a complete DLP system.
- Approval messages render redacted memory content for sensitive records, but reviewers should still treat memory approvals as sensitive operational data.
- JSONL memory is local and append-only; remote anchoring is not in the beta.
- The effective view is rebuilt from local JSONL records; team/server concurrency is post-beta.
- ForceMemory is an optional future backend direction, not the default memory engine.
