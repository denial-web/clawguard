# ClawGuard Agent Threat Model

This document defines the v1.0 beta threat model for ClawGuard Agent.

## What ClawGuard Protects

ClawGuard Agent is designed to reduce risk when an AI agent can inspect projects, propose file changes, run approved commands, save memory, install skills, or ask external systems to act.

The main defense is separation:

```text
model reasoning
  -> validated plan/proposal
  -> policy and approval gate
  -> constrained tool execution
  -> backup/audit/memory record
```

## In-Scope Threats

### Malicious Or Compromised Skills

A skill may hide instructions, undeclared network access, shell commands, secret access, install scripts, or dependency risk. ClawGuard scans skills and gates install or trust decisions.

### Prompt Injection

Prompt injection may appear in `README.md`, tool output, web content, skill instructions, memory candidates, GitHub issues, or local files. ClawGuard treats retrieved content as untrusted and blocks obvious memory-injection phrases such as attempts to ignore prior instructions, reveal secrets, exfiltrate data, disable approvals, or bypass policy.

### Excessive Agency

The agent must not get unrestricted shell, unrestricted browser control, payment actions, desktop control, or broad external-write APIs in core. High-risk actions require explicit approval and constrained execution.

### Memory Poisoning

Memory poisoning is the persistent form of prompt injection: an attacker's payload survives into durable memory and becomes recurring context. An attacker may try to save a false rule, downgrade sensitive data to a low-risk type, mislabel tool output as an exact user statement, or preserve a malicious instruction across sessions. ClawGuard applies memory quality checks, content-based policy tags, approval gates, redaction, tombstones, replacements, and effective-view recall.

### Sensitive Data Leakage

Secrets may appear in files, tool output, memory candidates, approval messages, diffs, or audit data. ClawGuard redacts common secret-like values before approval messages and memory storage, and sensitive memory remains approval-gated.

### Protected Asset Destruction

An agent may try to finish a task by reading, overwriting, moving, or deleting company databases, system files, customer data, secrets, or backups. ClawGuard treats memory as guidance only and enforces local protected asset policy through tools. Protected reads and diffs require approval, protected writes escalate to high or critical approval, cleanup blocks protected paths, and destructive database/system shell commands become critical approval or hard blocks.

**Case-folded paths:** Protected-asset pattern matching is **case-insensitive** (for example `.ENV` matches the `.env*` rule). On macOS and Windows this gates the same inode when users or agents vary casing. On case-sensitive Linux, an oddly-cased path that is a *different* file may still require approval — intentional **safe over-caution**, not a bypass.

### Audit Tampering

The audit log is hash-chained so local tampering is detectable by `clawguard agent audit show --verify`. This proves local chain consistency. It does not yet prove the file was not replaced with a new internally consistent chain.

## Out Of Scope For v1.0 Beta

- Remote-anchored audit roots.
- Multi-user RBAC, SSO, organization policy, or maker-checker dashboards.
- Complete DLP coverage for every secret format.
- Enterprise protected-data controls such as dual approval, RBAC, encrypted policy stores, or centralized policy distribution.
- Safe execution of browser click/type/submit or desktop app actions.
- Payment, purchase, money movement, regulated final decisions, or customer-impacting actions.
- Strong concurrent multi-process JSONL memory guarantees.
- Cloud sync or server-backed team memory.
- ForceMemory as a production backend.

## Safety Boundaries

The following must remain true through v1.0 beta:

- No unrestricted shell execution.
- Shell execution is argv-only, approval-gated, timeout-bound, and output-limited.
- File writes are approval-gated and backed up.
- Protected local assets are policy-gated before read, diff, write, cleanup, or destructive shell execution.
- Browser/app click, type, submit, payment, and desktop actions remain proposal-only.
- GitHub external writes require approval and repo allowlist checks.
- Durable memory writes are approval-gated by default.
- Business-rule, project-rule, decision, sensitive, rule-like, provenance-mismatched, and consolidated memory require approval.
- Bootstrap memory is proposed, not silently persisted.
- Removed memory is tombstoned, not erased.

## Known Residual Risks

- Pattern-based redaction can miss custom secrets, partial credentials, or proprietary token formats.
- Local hash-chained audit does not protect against full-file replacement without an external anchor.
- Localhost dashboard state should be treated as local developer tooling, not a hardened multi-user console.
- JSONL append/read behavior is intended for local single-user workflows, not high-concurrency team deployments.
- Memory quality checks are conservative but not complete; humans should review business rules and sensitive memory.

## Beta Security Review Checklist

Before each beta release, manually review:

- approval message redaction
- memory policy tags
- bootstrap proposal payloads
- exact-user-statement source handling
- consolidation type and policy-tag inheritance
- protected asset default patterns and custom block/approval rules
- GitHub repo allowlist behavior
- browser bridge URL handling and redirects
- audit verification output
- schema validation for action proposals

Then run the automated prerequisites:

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check src/web-server.js
node --check safety_eval/run_eval.mjs
npm run safety:eval
npm run demo:memory
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```
