# ClawGuard Agent Memory Demo

Use this demo to show why ClawGuard memory is more than a plain notes file.

```bash
# Run the demo and remove its temporary workspace afterward.
npm run demo:memory

# Keep the generated workspace for inspection.
npm run demo:memory -- --keep

# Return machine-readable output.
npm run demo:memory -- --json
```

## What The Demo Proves

The script creates a clean temporary project and runs a full memory lifecycle:

1. Initializes ClawGuard Agent state.
2. Proposes a project-rule memory that requires approval.
3. Reviews pending memory approvals.
4. Approves the durable memory through the agent memory surface.
5. Writes low-risk user preferences.
6. Replaces one memory while preserving the old record as superseded history.
7. Proposes a consolidated memory for approval.
8. Approves the consolidated memory.
9. Removes one memory by appending a tombstone instead of deleting history.
10. Creates active recall from the effective memory view.

## Key Terms

Memory classification is explicit in the current public runtime. The agent, user, recipe, or bootstrap flow submits a memory type such as `PROJECT_RULE`, `BUSINESS_RULE`, `SENSITIVE`, `INFERRED_PREFERENCE`, or `TASK_OUTCOME`. ClawGuard does not trust that submitted type by itself. It also applies content-based policy tags before deciding whether a write may proceed.

- `PROJECT_RULE`, `BUSINESS_RULE`, `DECISION`, and `SENSITIVE` always require approval.
- Rule-like content, such as `must`, `always`, `never`, `requires approval`, `policy`, `compliance`, or secret-related language, requires approval even if submitted as `INFERRED_PREFERENCE`.
- Secret-like values are redacted before approval or durable storage.
- Low-risk preference and task-outcome records may be written only when memory auto-write is enabled; the default is approval-gated.
- Quality checks still block duplicates, vague records, and prompt-injection-style records before they reach durable memory.

The effective memory view is:

```text
approved durable memory
- tombstoned records
- old records superseded by replacements
= memory eligible for list/search/recall/export/mirrors
```

The raw JSONL log remains append-only. Removal does not erase history; replacement keeps the old record out of recall while preserving provenance.

Consolidation requires approval because it rewrites several memories into one summary. That can lose nuance or amplify a bad memory, so ClawGuard treats consolidation as a governed memory write instead of a silent cleanup. Consolidated memory inherits the highest-risk memory type among its inputs instead of majority-voting the type down.

## Talk Track

> Most agent memory starts empty and then becomes messy.
>
> ClawGuard starts with governed memory: useful facts can be proposed, reviewed, approved, replaced, consolidated, or removed without silently rewriting the audit trail.

Use this when comparing against typical agent memory or memory backends that silently write, update, or summarize facts:

- Cold start is handled by bootstrap and project inspection. Bootstrap reads safe project metadata such as `README.md`, `package.json`, `.clawguard.json`, git remote metadata, and local instruction files.
- Durable memory writes are approval-gated by default.
- Business rules and sensitive memory cannot be silently saved.
- Removed memory is tombstoned, not erased.
- Replacement and consolidation keep provenance.
- Recall uses the effective memory view, so outdated memory does not keep steering the agent.

## ClawGuard vs ForceMemory

ClawGuard Agent is the public governed agent runtime. Its default memory backend is local JSONL plus markdown mirrors because that keeps `npm install -g @denial-web/clawguard` simple.

ForceMemory is a separate advanced-memory direction documented in [ForceMemory Integration Contract](FORCEMEMORY_INTEGRATION_CONTRACT.md). It should be treated as an optional future backend for richer scored decisions, database-backed chains, and deeper memory audit. The demo here is not ForceMemory under another name; it is the ClawGuard runtime showing the same governance philosophy with the lightweight default backend.

For the precise public memory policy, see [Agent Memory Policy](AGENT_MEMORY_POLICY.md). For the beta threat model, see [Agent Threat Model](AGENT_THREAT_MODEL.md).

## Expected Result

The human output includes falsifiable checks. A healthy run should look like this shape:

```text
Falsifiable checks:
- [PASS] Proposed 1 project-rule memory and queued approval (approvalId=...; pendingApprovals=1)
- [PASS] Approved 1 project-rule memory write (memoryId=...)
- [PASS] Wrote 2 low-risk preferences without approval (memoryIds=...,...)
- [PASS] Replaced old memory with superseded chain intact (from=...; to=...)
- [PASS] Consolidated matching memories through approval (approvalId=...; matchedRecords=3; memoryId=...)
- [PASS] Tombstoned removable memory without deleting the log (memoryId=...; tombstoneId=...)
- [PASS] Effective view hides tombstoned and superseded source records (effectiveMemoryRecords=4; hiddenIds=...,...)
- [PASS] Active recall uses effective memory records (recallMemoryRecords=4; hiddenIds=...,...)
- [PASS] Effective memory count decreased after tombstone (before=5; after=4)
```

The JSON output includes the same checks under:

```json
{
  "schemaVersion": "clawguard.agentMemoryDemo.v1",
  "counts": {
    "pendingApprovalsCreated": 2,
    "approvedMemoryWrites": 2,
    "lowRiskPreferencesWritten": 2,
    "replacements": 1,
    "consolidationsApproved": 1,
    "tombstones": 1,
    "effectiveMemoryRecords": 4,
    "recallMemoryRecords": 4
  },
  "assertions": [
    { "label": "Proposed 1 project-rule memory and queued approval", "pass": true }
  ]
}
```

The script exits non-zero if any core assertion fails.

This demo is intentionally local-only. It does not call model providers, browser control, GitHub writes, payment APIs, email, calendar, or external app automation.
