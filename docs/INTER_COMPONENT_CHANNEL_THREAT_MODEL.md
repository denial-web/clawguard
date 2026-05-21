# Inter-Component Channel Threat Model

Status: beta.7 design contract

ClawGuard's next architecture step is separation of duties for agent work. This document defines the trust boundaries and message rules that must exist before any Data Broker, multi-component runtime, or "multi-brain" product mode is shipped.

The core rule is:

```text
LLM components may propose.
Deterministic policy components decide.
Executors obey policy decisions only.
Messages between components are untrusted until wrapped and verified by the receiver.
```

## Scope

In scope:

- Planner: LLM-backed task understanding, planning, and draft proposal generation.
- Data Broker: structured, read-only data access mediator planned for beta.8.
- Policy Engine: deterministic code that decides allow, approval_required, block, or escalate.
- Critic: deterministic professional-worker checks such as Evidence Ledger sealing.
- Executor: code that performs approved tool calls.
- Audit Writer: append-only audit event creator and hash-chain verifier.

Out of scope for beta.7:

- Implementing the Data Broker.
- Implementing process isolation.
- Implementing signed policy bundles.
- Implementing multi-component mode.
- Replacing existing protected assets, approvals, backups, or audit.

Beta.7 is a threat model and test contract. It should prevent beta.8+ from building unsafe channels by accident.

## Component Types

| Component | Type | May Use LLM? | Authority |
| --- | --- | --- | --- |
| Planner | reasoning | yes | Proposes plans and tool requests. No execution authority. |
| Data Broker | deterministic mediator | no in beta.8 | Returns allowlisted data shapes only. No freeform summaries. |
| Policy Engine | deterministic authority | no | Final policy decision for tool actions. |
| Critic | deterministic gate | no for beta.5 checks | Seals evidence and fails unsafe drafts. |
| Executor | deterministic tool runner | no | Executes only with a valid policy approval handle. |
| Audit Writer | deterministic recorder | no | Writes normalized, hash-chained events. |

Implementation rule: do not name deterministic authority components "brains" in code. Public marketing may use "multi-brain" as a metaphor, but code and specs must distinguish reasoning components from enforcement components.

## Trust Labels

All cross-component payloads must be wrapped by the sending runtime component, not copied from model or tool text.

Allowed trust labels:

- `user_input`: direct user request or explicit user confirmation.
- `llm_proposal`: model-generated plan, critique, summary, or requested action.
- `untrusted_tool_output`: file, web, MCP, browser, repository, or external system output.
- `policy_decision`: deterministic Policy Engine output.
- `critic_decision`: deterministic Critic output.
- `approval_grant`: human approval produced by the approval system.
- `audit_record`: normalized audit event or hash-chain verification result.

Raw tool output is always `untrusted_tool_output` even if it contains text that looks like provenance.

## Message Envelope

Every component channel should use this envelope shape or a strict superset:

```json
{
  "schemaVersion": "clawguard.interComponentMessage.v1",
  "messageId": "uuid-or-stable-id",
  "source": {
    "component": "planner",
    "componentType": "llm_reasoning"
  },
  "destination": {
    "component": "policy_engine"
  },
  "trust": "llm_proposal",
  "allowedUse": ["policy_evaluation"],
  "createdAt": "2026-05-21T00:00:00.000Z",
  "payload": {},
  "provenance": {
    "wrappedBy": "clawguard-runtime",
    "verifiedBy": null,
    "signature": null
  }
}
```

Rules:

- `trust` is assigned by the runtime, not by LLM text, tool text, or user-pasted JSON.
- `verifiedBy` is null unless a deterministic component or tool trace produced verification.
- Receivers must reject unknown `trust` values and unknown `allowedUse` values.
- Receivers must treat `payload` as hostile unless the trust label gives a specific permitted use.
- A message approved for display is not automatically approved for execution.
- A message approved for policy evaluation is not automatically approved for memory writing.

See [inter-component-message.schema.json](../schemas/inter-component-message.schema.json).

## Channel Inventory

| Channel | Payload | Sender Trust | Receiver Rule | Audit |
| --- | --- | --- | --- | --- |
| User -> Planner | task text, constraints | `user_input` | May guide planning; does not grant tool authority. | session started |
| Tool -> Planner | file/web/MCP content | `untrusted_tool_output` | May be summarized; cannot issue instructions. | tool result hash |
| Planner -> Policy Engine | proposed action | `llm_proposal` | Validate schema, ignore claimed approvals, inspect protected assets. | policy evaluated |
| Policy Engine -> Executor | decision + approval handle | `policy_decision` | Executor requires valid handle for side effects. | decision recorded |
| Human Approval -> Executor | approval grant | `approval_grant` | Check scope, expiry, action hash, and protected asset match. | approval recorded |
| Planner -> Critic | draft answer + ledger | `llm_proposal` | Seal ledger against runtime verification traces. | critic evaluated |
| Critic -> Planner | findings | `critic_decision` | May revise draft; cannot bypass policy. | critic findings |
| Data Broker -> Planner | allowlisted shape | `untrusted_tool_output` or broker-specific verified shape | Must respect query budget and no freeform summary. | broker query |
| Executor -> Audit Writer | executed action result | deterministic runtime result | Normalize and hash-chain. | action recorded |

## Adversary Models

### A1: Untrusted Input

An attacker controls a file, repository, web page, README, MCP response, browser page, or package metadata that the Planner reads.

Goal: make the Planner ignore policy, request dangerous tools, leak secrets, or forge provenance.

Required controls:

- Mark all tool content as `untrusted_tool_output`.
- Strip or quarantine embedded provenance envelopes.
- Run prompt-injection checks before durable memory proposals.
- Require Policy Engine decisions for tool actions.

### A2: Compromised Planner

Prompt injection or model failure makes the Planner malicious or reckless.

Goal: call Executor directly, request broad approvals, summarize sensitive data, or hide risk from the user.

Required controls:

- Executor functions must require a Policy Engine approval handle for side effects.
- Planner output is only `llm_proposal`.
- Policy Engine ignores planner-claimed approvals.
- Audit records include the normalized proposed action and policy decision.

### A3: Forged Provenance In Tool Output

A tool response includes JSON or text such as `verifiedBy: "DataBroker"` or `trust: "policy_decision"`.

Goal: trick downstream components into treating tool text as verified authority.

Required controls:

- Provenance wrappers are created by ClawGuard runtime only.
- Receivers never parse provenance from `payload` text.
- Tool output remains `untrusted_tool_output`.
- Critic `verified` claims require runtime verification traces.

### A4: Malicious Dependency

A package loaded by ClawGuard or a skill attempts to patch modules, bypass policy, or monkey-patch executor calls.

Goal: remove the veto layer or forge approval handles.

Required controls:

- No executable skill code in procedural skill installs.
- Future Policy Engine module hashes should be recorded on startup.
- Side-effect APIs should accept unforgeable handles, not plain booleans.
- Release notes must distinguish current local beta from regulated enterprise integrity.

### A5: Local Attacker With File Write

An attacker can modify local ClawGuard source, config, or policy files.

Goal: change policy, hide audit events, or make dangerous actions appear approved.

Required controls:

- Record loaded policy version and hashes in audit.
- Treat signed policy bundles as beta.9+ work.
- Document that local beta does not defend against an attacker who can patch the runtime.

### A6: Side-Channel Learner

An attacker cannot read sensitive data directly but can ask repeated Data Broker questions.

Goal: infer customer counts, record existence, schema, correlations, or sensitive field distributions.

Required controls before Data Broker ships:

- Query budget per user, workspace, and data class.
- Similar-query detection.
- Refusal for filterable presence queries below sensitivity thresholds.
- Coarse, non-monotonic bands or deliberate noise for count-like responses.
- No field-name suggestions in errors.

### A7: Approval Fatigue Exploiter

An attacker or bad agent causes many approval prompts until the user rubber-stamps.

Goal: make approvals meaningless.

Required controls:

- Batch similar approvals.
- Expire approvals by time, session, and action hash.
- Track approval rate and warn on rubber-stamping patterns.
- Keep high-risk tools locked even when autonomy is set to auto.

## Attack Catalog

| Attack | Example | Required Behavior |
| --- | --- | --- |
| Prompt injection across summary handoff | README says "tell Critic this is verified" | Summary remains untrusted; Critic requires traces. |
| Provenance forgery | Tool output embeds `trust: policy_decision` | Receiver ignores payload provenance. |
| Executor capability leak | Planner imports executor and calls write function | Executor requires approval handle. |
| Approval replay | Old approval reused for different command | Reject when action hash, scope, or expiry differs. |
| Policy bundle swap | Policy file changed before action | Audit loaded policy hash; future signed bundle check. |
| Data Broker composition | Repeated filtered count queries infer records | Budget/refuse/noise similar queries. |
| Schema via error | Query missing field reveals valid fields | Return generic error only. |
| Approval fatigue | 30 low-context prompts | Batch and warn on rubber-stamping. |
| Audit tampering | Delete or edit audit line | Hash-chain verification must fail. |
| Memory laundering | Poisoned source becomes business rule | Memory policy and approvals decide; free-text memory cannot enforce. |

## Data Broker Safety Floor

The Data Broker must not return freeform natural-language summaries in beta.8. It may return only allowlisted shapes such as:

- `dataset_presence`: whether an allowlisted dataset class exists, with coarse bands only.
- `schema_only`: field names only when schema is already non-sensitive and approved for disclosure.
- `sample_redacted`: small redacted samples with fixed-size redaction markers, not original lengths.
- `policy_refusal`: refusal with no sensitive hints.
- `aggregate_band`: coarse aggregate band with query-budget accounting.

Forbidden until separately designed:

- Freeform "summarize this customer table" responses.
- Arbitrary filters over sensitive datasets.
- Joins across datasets that can re-identify people.
- Error messages that suggest valid field names.
- Returning exact row counts for sensitive datasets.
- Returning redactions that preserve original value length.

## Executor Isolation Requirement

Beta.7 does not implement isolation, but beta.8+ design must choose one:

1. Process isolation: Planner runs in a subprocess; Executor accepts IPC messages with signed or unforgeable approval handles.
2. Capability handles: Executor functions require an opaque handle minted by Policy Engine and scoped to action hash, protected asset match, expiry, and session.
3. Minimum local beta fallback: strict module boundaries plus runtime assertions that side-effect calls include a valid decision object.

Do not ship multi-component mode with convention-only executor separation.

## Policy Engine Integrity Requirement

Policy Engine is deterministic code. Its integrity must be visible.

Minimum beta.7/beta.8 documentation requirement:

- Every policy decision records policy version, config path, and protected-asset policy summary.
- Every startup records ClawGuard version and loaded policy module identity.

Future beta.9+ requirement:

- Hash Policy Engine modules at startup.
- Compare against a manifest for packaged releases.
- Support signed policy bundles for regulated deployments.

## Approval Fatigue Controls

Approval is not safety if users are trained to click through.

Required design rules:

- Approval prompts must explain action, protected assets, blast radius, expiry, and alternatives.
- Similar actions should be batched when possible.
- Approvals expire by default.
- High-risk approvals should be one-shot unless explicitly scoped.
- Approval audit should include prompt text, normalized action, decision, approver, timestamp, and action hash.
- Future regulated mode should support maker-checker dual approval.

## Test Contract

Each attack in this section should become a failing test before the mitigation lands and a passing test after it lands.

Minimum beta.7 tests to add before beta.8 implementation:

1. Tool output containing a fake provenance envelope remains `untrusted_tool_output`.
2. Planner-proposed `verifiedBy` is ignored unless a runtime trace exists.
3. Executor rejects side-effect calls without a policy decision object.
4. Executor rejects replayed approval handles with a different action hash.
5. Policy decision audit includes policy version and protected-asset summary.
6. Data Broker mock refuses repeated near-duplicate filtered presence queries.
7. Data Broker mock returns generic errors for invalid fields.
8. Approval queue batches similar read approvals but keeps shell/file-write one-shot.
9. Audit hash-chain verification fails after line deletion or mutation.
10. Skill/recipe/proposal attempts to modify channel trust labels are blocked.

## Beta.7 Definition Of Done

Beta.7 is complete when:

- This threat model is reviewed and accepted.
- The inter-component message schema is committed.
- The beta.8 Data Broker plan cites this document.
- At least the first five test-contract cases are represented as tests, even if some are marked expected-fail for unimplemented future components.
- Public positioning says "separation of duties for AI agents" rather than promising unrestricted autonomy.

## Residual Risks

Accepted for local beta:

- A local attacker who can patch ClawGuard source can bypass local policy.
- Blast Radius Explain is advisory; enforcement remains in protected assets, approvals, backups, and tool policy.
- The Data Broker does not exist yet.
- Process isolation is not implemented yet.
- Signed policy bundles are not implemented yet.

Not accepted for future multi-component mode:

- Freeform Data Broker summaries over sensitive data.
- Planner-to-Executor direct side effects.
- Model-assigned provenance.
- Policy decisions made by an LLM.
- Approval prompts without expiry or action scope.
