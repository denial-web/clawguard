# ClawGuard Agent

ClawGuard Agent is the optional governed AI agent runtime built on top of [ClawGuard](../README.md).

ClawGuard (Core) is the policy and safety gate: it scans, explains, and gates skills, MCP configs, dependencies, and proposed actions. ClawGuard Agent is what you turn on when you want an AI agent that actually performs work, but under the same policy gate.

If you only want to scan or gate skills, you do not need this page — start from [README.md](../README.md).

## Status

ClawGuard Agent is currently `v1.0.0-beta.7` (see [package.json](../package.json)).

It is a governed AI agent runtime: it can inspect projects, use skills, recall memory, run Deep Thinking for professional tasks, delegate bounded local subagents, seal professional evidence claims with a deterministic critic, and explain an action's blast radius before it runs. Risky actions still pass through policy, approval, protected-asset checks, backup, and audit.

## Try The Beta

From a clean folder:

```bash
mkdir -p ~/clawguard-beta-test
cd ~/clawguard-beta-test

npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard setup-ui
```

Fast safety check:

```bash
npx --yes --package @denial-web/clawguard@beta clawguard agent init
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"
npx --yes --package @denial-web/clawguard@beta clawguard explain -- psql -c "DROP DATABASE prod"
```

Expected result: database deletion is `approval_required` with `critical` risk, `unknown_high` row impact, and safer alternatives.

Useful beta links:

- GitHub release: [v1.0.0-beta.7](https://github.com/denial-web/clawguard/releases/tag/v1.0.0-beta.7)
- Hugging Face safety demo: [denialkhmbot/clawguard-safety-demo](https://huggingface.co/spaces/denialkhmbot/clawguard-safety-demo)
- Beta testing checklist: [BETA_TESTING_CHECKLIST.md](BETA_TESTING_CHECKLIST.md)
- Five-minute tester kit: [FIVE_MINUTE_TESTER_KIT.md](FIVE_MINUTE_TESTER_KIT.md)

Most important beta question: did anything look like the agent could act without permission? If yes, open a Safety Bypass Report from the GitHub issue templates with a sanitized reproduction.

## Agent Surface

```bash
clawguard agent init
clawguard agent run "inspect this project and propose safe cleanup"
clawguard agent run --team "prepare a safe release plan"
clawguard agent run --recipe project.inspect
clawguard agent run --recipe release.prepare
clawguard agent run --recipe npm.package_check
clawguard agent chat
clawguard agent tools list
clawguard agent autonomy show
clawguard agent autonomy set --preset developer
clawguard agent autonomy set-tool web.search auto
clawguard agent skills list
clawguard agent skills show project-cleanup
clawguard agent skills validate ./skill
clawguard agent skills install ./skill
clawguard agent skills create cafe-marketing-manager --type business
clawguard agent skills trust cafe-marketing-manager
clawguard agent skills remove cafe-marketing-manager
clawguard agent subagents list
clawguard agent subagents show researcher
clawguard agent delegate "research competitors for this cafe" --to researcher
clawguard agent role list
clawguard agent role show small-business/cafe/marketing-manager
clawguard agent role run small-business/cafe/marketing-manager --cadence daily
clawguard agent protected list
clawguard agent protected add company-prod-db --type database --path data/prod.sqlite
clawguard agent protected check data/prod.sqlite --operation write
clawguard agent memory list
clawguard agent memory search "release rules"
clawguard agent memory recall "release rules"
clawguard agent memory sessions search "release rules"
clawguard agent memory bootstrap
clawguard agent memory review
clawguard agent memory approve <approval-id>
clawguard agent memory reject <approval-id>
clawguard agent memory remove <memory-id>
clawguard agent memory replace <memory-id> --content "Updated memory"
clawguard agent memory consolidate "release rules"
clawguard agent memory export --format markdown
clawguard agent audit show --verify
clawguard agent proposal validate ./proposal.json
clawguard agent proposal explain ./proposal.json
clawguard agent proposal run ./proposal.json
clawguard agent bridge spec
clawguard agent bridge execute ./proposal.json --driver fetch
```

## What The Agent Can Do By Default

The current agent is governed by default, but useful: it can run safe task recipes, inspect git state without shell, bootstrap useful starter memory from project files, search memory and past sessions, maintain human-readable `USER.md`/`MEMORY.md` mirrors, use active recall summaries, use bundled procedural skills, delegate bounded local subagents, perform configured read-only web search/fetch, draft GitHub issues locally, and create GitHub issues only after approval and repo allowlist checks.

## What The Agent Cannot Do Directly

Risky actions do not execute directly. File writes, shell execution, skill installs, durable memory writes, task-outcome memory proposals, external GitHub writes, browser/app bridge actions, and protected assets stay approval-gated or blocked by the hard safety floor.

`agent.toolAutonomy` lets users switch safe read/search tools between `auto`, `approval`, and `block` with `personal`, `developer`, `business`, and `strict` presets. Protected local assets such as `.env*`, `data/**`, `database/**`, `backups/**`, `*.sqlite`, `*.sql`, and configured company assets are policy-gated at the tool layer, so memory can guide the agent but cannot be the only thing protecting high-secure data.

## Subagents

Built-in subagent profiles include `researcher`, `project-inspector`, `release-manager`, `business-operator`, and `security-reviewer`. Each child session inherits ClawGuard policy, protected assets, approvals, audit, and tool autonomy. Beta subagents cannot spawn nested subagents.

## Approval Replay Protection

Approval IDs are scoped to the action the user reviewed. ClawGuard blocks approval replay across unrelated tools, protected targets, subagent delegation, memory writes, skill installs, and browser bridge actions. Web and bridge fetches also validate redirects, so a public URL cannot silently redirect the agent into localhost, private IPs, or link-local addresses.

## Bundled Skills

Bundled skills include developer skills (`project-inspector`, `safe-test-runner`, `dependency-review`, `release-manager`, `docs-writer`), business skills (`cafe-marketing-manager`, `social-calendar`, `competitor-research`, `customer-feedback-triage`, `daily-business-brief`), and safety skills (`protected-asset-review`, `memory-reviewer`, `prompt-injection-review`).

Workspace skills take precedence over trusted installed skills, and trusted installed skills take precedence over bundled skills.

## Browser And App Bridge

Recent agent work adds governed browser/app proposal tools, `clawguard agent proposal explain`, `clawguard agent bridge spec`, a sandboxed read-only `clawguard agent bridge execute` path for `browser.open` and `browser.extract`, hybrid memory, and a local Agent Dashboard in the web demo for approvals, audit, memory, and bridge state. Click, type, submit, payment, and desktop app actions remain proposal-only.

See:

- [ClawGuard Agent v0.4.0 Roadmap](ROADMAP_v0.4.0.md)
- [Browser/App Bridge Spec](BROWSER_BRIDGE_SPEC.md)
- [ClawGuard v0.6.1 release notes](RELEASE_NOTES_v0.6.1.md)
- [ClawGuard v0.7.0 release notes](RELEASE_NOTES_v0.7.0.md)

## Proposal Schema

Sidekick-OS inspired two reusable pieces here: a small runtime route classifier and a local/mobile action proposal schema. Proposal JSON is documented in [schemas/agent-action-proposal.schema.json](../schemas/agent-action-proposal.schema.json) and is useful for phone bridges, desktop companions, or other runtimes that want ClawGuard to validate and execute one governed action.

For future advanced memory work, see [ForceMemory Integration Contract](FORCEMEMORY_INTEGRATION_CONTRACT.md). It keeps ClawGuard's JSONL memory as the default and treats ForceMemory as an optional governed memory backend.

## Role Intelligence

Role Intelligence adds the first "understand the job before acting" layer. The starter cafe marketing-manager pack produces seven artifacts (`domain_frame`, `purpose_and_risk`, `role_vocabulary`, `cadence_map`, `decision_authority`, `feedback_loop`, and `constraints`), owner-validation questions, and A-S-FLC routes for each role action: `LOCAL`, `VERIFY_FIRST`, `APPROVAL_REQUIRED`, `ESCALATE`, or `BLOCK`.

See [Role Intelligence](ROLE_INTELLIGENCE.md) and [A-S-FLC For ClawGuard](AS_FLC_FOR_CLAWGUARD.md).

## Memory Lifecycle

v0.9 builds on hybrid memory with cold-start bootstrap, active governed recall, and reviewable memory lifecycle commands:

- `clawguard agent memory review` shows pending memory approvals
- `approve` / `reject` decide memory proposals from the agent surface
- `remove` appends a tombstone instead of rewriting history
- `replace` supersedes old records
- `consolidate` proposes merged memories for approval

Memory quality checks still block duplicates, vague records, and prompt-injection-style memories before they enter durable memory.

## Cleanup Demo

The clearest demo is the cleanup flow:

```bash
clawguard agent run "clean this project and remove unnecessary files"
```

ClawGuard proposes generated/cache paths such as `dist/`, `.cache/`, `coverage/`, or `tmp/`; blocks protected paths such as `.env`, `data/`, `database/`, `backups/`, `src/`, and `package.json`; then waits for approval before moving approved cleanup items into `.clawguard/agent/backups/`.

## Local Demos

Run the deterministic agent safety regression suite:

```bash
npm run safety:eval
```

The beta.7 eval includes static proposal checks, Deep Thinking trigger/critique cases, Professional Worker critic cases, Blast Radius Explain cases, protected-asset thinking checks, runtime redirect/replay cases for `web.fetch`, sandboxed browser bridge execution, bridge approval IDs, channel-bound approval hashes, and Doctrine Lab export checks.

Run the local memory lifecycle demo:

```bash
npm run demo:memory
```

That demo shows approval-gated memory, review, approve, replace, consolidate, tombstone removal, and active recall from a clean temporary workspace. Submitted memory types are treated as hints; ClawGuard applies content-based policy tags before deciding whether durable memory requires approval.

See:

- [Agent Memory Demo](AGENT_MEMORY_DEMO.md)
- [Agent Memory Policy](AGENT_MEMORY_POLICY.md)
- [Agent Threat Model](AGENT_THREAT_MODEL.md)
- [v1.0 Beta Hardening](V1_BETA_HARDENING.md)

Run the local protected-asset demo:

```bash
npm run demo:protected-assets
```

That demo creates a temporary `.env`, production database, customer backup, and generated `dist/` folder. It configures protected assets through the CLI, proves protected reads/writes require approval, proves customer backups can be blocked, and proves cleanup only proposes generated output.

## Related Pages

- [README.md](../README.md) — ClawGuard Core (scanner, gate, install)
- [STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md) — positioning of Core vs Agent and the wider ClawGuard namespace
- [AGENT_THREAT_MODEL.md](AGENT_THREAT_MODEL.md) — agent-specific threat model
- [AGENT_MEMORY_POLICY.md](AGENT_MEMORY_POLICY.md) — memory write policy and lifecycle
- [INTER_COMPONENT_CHANNEL_THREAT_MODEL.md](INTER_COMPONENT_CHANNEL_THREAT_MODEL.md) — inter-component trust boundary
