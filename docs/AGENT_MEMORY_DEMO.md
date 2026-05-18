# ClawGuard Agent Memory Demo

Use this demo to show why ClawGuard memory is more than a plain notes file.

```bash
npm run demo:memory
```

Keep the generated workspace for inspection:

```bash
npm run demo:memory -- --keep
```

Machine-readable output:

```bash
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

## Talk Track

> Most agent memory starts empty and then becomes messy. ClawGuard starts with governed memory: useful facts can be proposed, reviewed, approved, replaced, consolidated, or removed without silently rewriting the audit trail.

Use this when comparing against OpenClaw/Hermes-style memory:

- Cold start is handled by bootstrap and project inspection.
- Durable memory writes are approval-gated by default.
- Business rules and sensitive memory cannot be silently saved.
- Removed memory is tombstoned, not erased.
- Replacement and consolidation keep provenance.
- Recall uses the effective memory view, so outdated memory does not keep steering the agent.

## Expected Result

The final output should show:

- at least one pending approval
- an approved memory write
- a replacement
- a consolidation approval
- a tombstone removal
- an active recall summary

This demo is intentionally local-only. It does not call model providers, browser control, GitHub writes, payment APIs, email, calendar, or external app automation.
