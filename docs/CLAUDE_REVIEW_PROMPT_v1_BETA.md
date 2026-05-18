# Claude Review Prompt: ClawGuard Agent v1.0 Beta Readiness

You are reviewing **ClawGuard Agent**, a safety-first AI agent runtime inside the npm package `@denial-web/clawguard`.

Please review the product direction, architecture, memory design, safety posture, and competitive readiness against public agent runtimes and memory systems you can verify. Do not assume OpenClaw, Hermes Agent, or Manus-style products unless you have links or reliable current context for them.

## Current State

ClawGuard is no longer only a scanner. It now includes a standalone governed agent:

```bash
clawguard agent init
clawguard agent run "inspect this project and propose safe cleanup"
clawguard agent run --recipe project.inspect
clawguard agent run --recipe release.prepare
clawguard agent run --recipe npm.package_check
clawguard agent chat
clawguard agent tools list
clawguard agent skills list
clawguard agent skills show <name>
clawguard agent memory list
clawguard agent memory search <query>
clawguard agent memory recall <query>
clawguard agent memory sessions search <query>
clawguard agent memory bootstrap
clawguard agent memory review
clawguard agent memory approve <approval-id>
clawguard agent memory reject <approval-id>
clawguard agent memory remove <memory-id>
clawguard agent memory replace <memory-id> --content <text>
clawguard agent memory consolidate <query>
clawguard agent memory export --format markdown
clawguard agent audit show --verify
clawguard agent proposal validate <proposal.json>
clawguard agent proposal explain <proposal.json>
clawguard agent proposal run <proposal.json>
clawguard agent bridge spec
clawguard agent bridge execute <proposal.json> --driver fetch
```

## Product Positioning

Current positioning:

> ClawGuard Agent is an AI agent that can act, but every risky action passes through policy, approval, backup, and audit.

It is meant to be useful for individual developers and later useful for companies that need security, approvals, auditability, and governance.

It should not copy broad-autonomy cloud/browser agents too early. The intended advantage is governed execution.

## Implemented Capabilities

### Safe Task Automation

- Agent run/chat loop.
- JSON plan validation.
- Read-only git tools:
  - `git.status`
  - `git.diff`
  - `git.log`
- Recipes:
  - `project.inspect`
  - `release.prepare`
  - `npm.package_check`
- Approval-gated file writes.
- Approval-gated argv-only shell execution.
- No unrestricted shell.

### Skills

- `SKILL.md` folder support.
- Bundled skills:
  - `project-cleanup`
  - `github-release`
  - `npm-package-helper`
  - `web-research-safe`
- Skill precedence:
  - workspace skills
  - trusted ClawGuard skills
  - bundled skills
- Skills are procedural instructions plus metadata, not executable code.

### Memory

ClawGuard memory is JSONL by default, with human-readable mirrors:

```text
.clawguard/
  agent/
    memory.jsonl
    USER.md
    MEMORY.md
    recall/
    sessions/
```

Current memory features:

- `memory.bootstrap`: proposes starter memories from project files.
- `memory.search`: deterministic local search.
- `memory.recall`: creates active recall snapshots.
- `memory.review`: shows pending memory approvals.
- `memory.approve` / `memory.reject`: decide memory approvals from agent surface.
- `memory.remove`: appends tombstones instead of silently deleting.
- `memory.replace`: supersedes old records while preserving history.
- `memory.consolidate`: proposes merged memories for approval.
- Quality gates block:
  - duplicates
  - vague memories
  - prompt-injection-style memories
  - secret-like content is redacted
- Sensitive and business-rule memory require approval.
- Submitted memory type is treated as a hint. ClawGuard reclassifies rule-like, sensitive, high-risk, and consolidated memories before deciding whether approval is required.
- Bootstrap memories are proposed as untrusted input and are not written directly to durable memory.
- Consolidated memories inherit the highest-risk type among their inputs.
- Durable memory auto-write is disabled by default.

### Browser/App Control

- Proposal-first model.
- Read-only `browser.open` / `browser.extract` bridge path can execute through a sandboxed fetch driver when enabled.
- Browser click/type/app actions remain proposal-only.
- No payment, purchase, form submit, destructive browser/app action, or desktop control in core.

### Integrations

- GitHub read and issue draft.
- GitHub issue creation requires approval and repo allowlist.
- Telegram approval notification path exists.
- Local Agent Dashboard shows:
  - approvals
  - memory
  - memory approvals
  - audit
  - bridge state

### Audit / Safety

- Hash-chained audit JSONL.
- Approval JSONL and decisions JSONL.
- File writes require approval, diff, and backup.
- Shell execution requires approval, argv-only execution, timeout, and output limits.
- Action proposal schema validates risky actions.
- Safety eval suite exists.

## Recent Release State

Recent work:

- `v0.9.0` released publicly.
- npm trusted publishing succeeded.
- GitHub release exists.
- Published smoke tests passed.
- Full tests passed: `214/214` at release time.
- After beta-hardening docs/demo, full tests passed: `215/215`.
- Safety eval passed: `16/16`.

New beta-hardening demo:

```bash
npm run demo:memory
```

The demo shows:

1. Initialize agent state.
2. Propose approval-gated project-rule memory.
3. Review memory approvals.
4. Approve durable memory.
5. Write low-risk preferences.
6. Replace memory while preserving history.
7. Propose consolidated memory.
8. Approve consolidated memory.
9. Remove temporary memory using a tombstone.
10. Create active recall from effective memory.

## Files To Review

Please focus on these:

```text
README.md
package.json
src/cli.js
src/agent/runtime.js
src/agent/memory.js
src/agent/approvals.js
src/agent/tools.js
src/agent/planner.js
src/agent/providers.js
src/agent/skills.js
src/agent/recipes.js
src/agent/bridge.js
src/web-server.js
schemas/agent-action-proposal.schema.json
safety_eval/run_eval.mjs
safety_eval/fixtures/agent_safety.jsonl
docs/AGENT_MEMORY_DEMO.md
docs/AGENT_MEMORY_POLICY.md
docs/AGENT_THREAT_MODEL.md
docs/V1_BETA_HARDENING.md
docs/FORCEMEMORY_INTEGRATION_CONTRACT.md
test/agent-v09.test.js
test/agent-memory-demo.test.js
```

## Review Questions

Please answer these directly.

### 1. Product Readiness

Is ClawGuard Agent good enough for a public v1.0 beta?

Please classify:

```text
Not ready / Almost ready / Ready for beta / Ready for stable
```

Explain the top reasons.

### 2. Competitive Comparison

Compare ClawGuard Agent against:

- public agent runtimes you can verify from current knowledge or supplied links
- public memory systems such as mem0, Letta/MemGPT, Zep, or LangChain Memory when relevant
- broad-autonomy cloud/browser agents as a category

Use this table:

| Area | ClawGuard Agent | Verified comparable(s) | Broad-autonomy/cloud agent pattern | Gap / Advice |
|---|---|---|---|---|
| Real task automation | | | | |
| Skills | | | | |
| Memory | | | | |
| Browser/app control | | | | |
| Integrations/channels | | | | |
| Safety/governance | | | | |
| Business readiness | | | | |
| Developer UX | | | | |

### 3. Memory Review

Review the ClawGuard memory design.

Questions:

- Is this memory system strong enough for early users compared with memory systems or agent runtimes you can verify?
- Is the cold-start story good enough?
- Are bootstrap, recall, review, replace, remove, and consolidate the right primitives?
- Are tombstones/superseded records the right append-only approach?
- What is still weak?
- What should be added before v1.0 beta?
- What should wait until after v1.0?

### 4. Safety Review

Look for safety or security problems.

Please focus on:

- approval bypass
- memory poisoning
- prompt injection through memory
- unsafe shell execution
- file path escape
- GitHub external write risks
- browser bridge risks
- sensitive data leaks in approval messages
- audit/tamper evidence gaps
- bad defaults for business users

Provide concrete findings with severity:

```text
Critical / High / Medium / Low
```

### 5. Architecture Review

Review whether the architecture is clean enough:

- CLI surface
- runtime/planner/tools separation
- memory module size and complexity
- approval model
- audit model
- bridge model
- recipe system
- skill loading
- config/state layout

Please identify any areas that should be refactored before v1.0 beta.

### 6. Business / Enterprise Usefulness

For companies and regulated businesses, evaluate:

- Is the approval/audit/memory model understandable?
- Is the safety posture credible?
- What is missing for team/business mode?
- What is missing for compliance/security teams?
- What should be in a paid/pro/business roadmap?

### 7. v1.0 Beta Recommendation

Give a concrete v1.0 beta plan:

```text
Must fix before beta:
1.
2.
3.

Should improve before beta:
1.
2.
3.

Can wait until after beta:
1.
2.
3.
```

### 8. Messaging / README Advice

Suggest better wording for the README and product tagline.

Current tagline:

> An AI agent that can act, but every risky action passes through policy, approval, backup, and audit.

Please suggest:

- one developer-focused tagline
- one business-focused tagline
- one security-team tagline
- one short GitHub repo description
- one 30-second demo script

## Important Constraints

Do not recommend adding unrestricted shell, unrestricted browser control, payment actions, email/calendar writes, or broad external-write APIs before v1.0 beta.

Prefer improvements that strengthen:

- trust
- clarity
- safe usefulness
- auditability
- memory reliability
- business readiness

The goal is not to beat broad-autonomy agents in raw autonomy immediately. The goal is to be the safest useful public agent runtime and a strong foundation for business-grade governed agents.

## Expected Output

Please return:

1. Executive verdict.
2. Competitive comparison table.
3. Top 10 risks or weaknesses.
4. Top 10 recommended improvements.
5. v1.0 beta go/no-go checklist.
6. README/tagline suggestions.
7. Any code-level concerns you would inspect first.
