# ClawGuard Outreach Drafts

Last updated: 2026-05-26.

> **Status: mixed.** Two outreach issues have been sent (see Outreach Log). Remaining sections are drafts. Use this page to review and edit copy before any outbound message. Once a message is sent, record it in the "Outreach Log" section at the bottom.

## Why outreach at all

[STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md) and [COMPARISON.md](COMPARISON.md) document a crowded "ClawGuard" namespace. Three of the existing projects — [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian), [lombax85/clawguard](https://github.com/lombax85/clawguard), and [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web) — own surfaces ClawGuard does not (OpenClaw plugin hooks; outbound API gateway with Telegram approval; hosted trust registry orchestrating multiple scanners). Treating them as adjacent layers rather than rivals is the honest read of the landscape.

Goals for outreach, in order:

1. Acknowledge their work publicly. Avoid the "yet another ClawGuard" tone.
2. Make ClawGuard discoverable to people already using their projects.
3. Offer the [clawguard-check.schema.json](../schemas/clawguard-check.schema.json) as a shared decision contract if they find it useful.
4. Learn what install-time gating they would want, if any.

Non-goals:

- Asking them to integrate ClawGuard Agent.
- Asking them to use our name or branding.
- Anything that reads as a takeover or competition.

## Framing rules

Every outbound message MUST:

- Name their project correctly (`clawguardian` is one word; `clawguard` for lombax85).
- Acknowledge what their project does in one sentence, in their own framing.
- State what ClawGuard does in one sentence, distinct from theirs.
- Identify a concrete, low-cost ask. No open-ended "let's chat".
- Offer reciprocity (link, mention, schema PR), not just ask for theirs.
- Be honest about ClawGuard's stage (beta on npm, reproducible benchmarks at [SCANNER_BENCHMARK.md](SCANNER_BENCHMARK.md)).

Every outbound message MUST NOT:

- Use the words "rival", "competitor", "winner", "best".
- Claim ClawGuard is the "official" or "canonical" ClawGuard.
- Imply their project is missing features.
- Send the same template to multiple projects unchanged.

## Primary target 1: superglue-ai/clawguardian

- Repository: [github.com/superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian)
- Stars at survey: 32
- Surface they own: OpenClaw plugin (`openclaw plugins install clawguardian`) with `before_agent_start`, `before_tool_call`, `tool_result_persist` hooks.
- Why they are a partner, not a rival: they intercept *at tool-call time, inside OpenClaw*. We gate *at install time, outside OpenClaw*. Both can run on the same machine.

### Concrete ask

Single, low-cost ask:

> Would you be open to a one-line mention in your README pointing users who want install-time gating to ClawGuard, in exchange for the same mention in ours? If interested, we would also share our [clawguard-check.schema.json](../schemas/clawguard-check.schema.json) in case a shared decision shape is useful between our two surfaces.

### Draft GitHub issue

Title:

```text
Compose pattern: install-time gating alongside ClawGuardian tool-call hooks
```

Body:

```markdown
Hi superglue-ai team,

Long-time admirer of ClawGuardian — the `before_tool_call` and `tool_result_persist` hooks are exactly the right place to filter PII inside OpenClaw. Thank you for shipping that.

I maintain a separate project called ClawGuard (https://github.com/denial-web/clawguard) that gates the *install path* — scanning candidate skills, MCP configs, and dependency manifests before they reach the trusted skill folder. It is a different surface from ClawGuardian: install-time gate vs tool-call interception.

I want to be careful about the name collision. The OpenClaw plugin slug `clawguardian` is yours; any future ClawGuard plugin would use a different identifier.

Two small things I wanted to ask about:

1. **Compose pattern mention.** Would you be open to a one-line note in ClawGuardian's README pointing users who want install-time gating at ClawGuard? Happy to add the reciprocal mention to our README (already drafted, would link your repo and explain ClawGuardian's role).

2. **Shared decision schema (optional).** ClawGuard publishes a small JSON Schema for cross-tool install/scan decisions: `clawguard.check.v1` (https://github.com/denial-web/clawguard/blob/main/schemas/clawguard-check.schema.json). If ClawGuardian ever emits a JSON decision when it blocks or redacts a tool call, this shape may be reusable. No PR proposed; just flagging in case it is useful.

Nothing about ClawGuard depends on ClawGuardian and vice versa. Both can run in the same OpenClaw install today.

Happy to be told this is not the right fit — just wanted to surface the option rather than build in parallel without coordination.

Thanks,
denial-web
```

### Draft short message (Discord / X DM / email)

```text
Hi — maintainer of the ClawGuard install-time gate at github.com/denial-web/clawguard. Big fan of what ClawGuardian does inside OpenClaw's tool-call lifecycle. Different surface from ours (install path vs runtime hook). Just opened a small issue suggesting a compose-pattern mention in each README and pointing at our clawguard.check.v1 schema in case a shared decision shape is useful: <issue link>. No pressure if it is not a fit.
```

## Primary target 2: lombax85/clawguard

- Repository: [github.com/lombax85/clawguard](https://github.com/lombax85/clawguard)
- Stars at survey: 15
- Surface they own: outbound API gateway with CIBA-pattern Telegram approval; zero-knowledge tokens; web audit dashboard.
- Why they are a partner, not a rival: they gate *outbound API calls from an agent*. We gate *the install path before an agent loads a skill*. The two are series-composable: an operator could run ClawGuard for install gating *and* lombax85's gateway for outbound calls.

### Concrete ask

Single, low-cost ask:

> Would you consider linking ClawGuard from your README as the install-time gate complementary to the outbound CIBA gateway, in exchange for the same mention from us? Our spec for `clawguard install <url>` (https://github.com/denial-web/clawguard/blob/main/docs/INSTALL_WRAPPER_SPEC.md) is the closest thing to a public install-time peer for what you already do at outbound time.

### Draft GitHub issue

Title:

```text
Compose pattern: install-time gate next to outbound CIBA gateway
```

Body:

```markdown
Hi lombax85,

Your CIBA + Telegram approval pattern is the cleanest design I have seen for outbound API calls from an agent — keeping real tokens off the agent's machine and forcing a phone tap before writes is the right shape. Thank you.

I maintain a separate project also called ClawGuard (https://github.com/denial-web/clawguard). I want to be upfront about the name collision: our project predates contact with yours, but the namespace is clearly contested (six public "ClawGuard" projects at the moment — survey at docs/COMPARISON.md). I do not expect anyone to rename; I just want to make composition explicit.

Our surface is different from yours:

- **Yours:** outbound API call → policy check → Telegram approve → real token injected. Runs at request time.
- **Ours:** candidate skill / MCP config / dependency bundle → static scan → policy decision → approval-gated copy into trusted folder. Runs at install time, before any agent loads the skill.

The two are series-composable on the same machine: ClawGuard at install time, your gateway at outbound time.

Two small things:

1. **Compose pattern mention.** Would you be open to a one-line mention in your README pointing users who want install-time gating at ClawGuard? Happy to add the reciprocal mention to ours (already drafted).

2. **Approval channel reuse (optional).** ClawGuard's install approval flow (https://github.com/denial-web/clawguard/blob/main/docs/INSTALL_WRAPPER_SPEC.md) writes a JSONL approval record. Your Telegram approval channel could be a downstream consumer of that record if it is ever useful; spec is open.

Nothing about ClawGuard depends on yours and vice versa. Happy to be told it is not a fit.

Thanks,
denial-web
```

### Draft short message

```text
Hi — maintainer of github.com/denial-web/clawguard. Different ClawGuard than yours (install-time gate vs CIBA outbound gateway). The two are series-composable. Just opened an issue with a one-line README mention proposal and a pointer to our install spec in case your Telegram approval channel could ever consume install approvals: <issue link>. Fine to close if it is not a fit.
```

## Primary target 3: yourclaw/clawguard-web

- Repository: [github.com/yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web), with the scanner at [github.com/yourclaw/clawguard-scanner](https://github.com/yourclaw/clawguard-scanner).
- Stars at survey: 0 (yourclaw-web) + 0 (yourclaw-scanner). Apache-2.0. Org founded 2026-02-03.
- Live service: [clawguard.sh](https://clawguard.sh) (verified 307 → www.clawguard.sh on 2026-05-26).
- Maintainer: Fabian Baier (Pulze.ai), publishes via `fabian@yourclaw.ai`.
- Surface they own: hosted trust-registry UI at `clawguard.sh`, REST `POST /api/v1/scan`, scanner orchestrating Gitleaks, Semgrep, MCP-Scan, npm audit, and Claude AI review in parallel.
- Why they are a partner, not a rival: they aggregate *other tools' scan results* behind a hosted UI and an API. ClawGuard is one such tool; our `clawguard.check.v1` payload could plug into their `/api/v1/scan` shape as one normalized input. They already think in compose-multiple-tools terms (5+ tools orchestrated).
- Why they are unblocked now: the deferral gate in this doc was *"Reaching out without a concrete schema offer would read as a name-grab. Re-evaluate after `clawguard.check.v1` has at least one external consumer."* Both halves are met: the schema is published at [schemas/clawguard-check.schema.json](../schemas/clawguard-check.schema.json), and the [ClawGuard GitHub Action](../action.yml) is now a working consumer of it (emitting the payload + decision outputs as of 2026-05-26).

### Concrete ask

Single, low-cost ask:

> Would `@yourclaw/clawguard-scanner` consider emitting (or accepting) the `clawguard.check.v1` decision shape so its REST surface and our GitHub Action can interoperate? No takeover — just a normalized decision envelope. If that's too speculative, the smaller ask is a one-line mention in your README pointing users who want install-time gating at ClawGuard, in exchange for the same mention in ours.

### Draft GitHub issue

Title:

```text
Compose pattern: clawguard.check.v1 as a normalized decision shape for /api/v1/scan
```

Body:

```markdown
Hi Fabian / yourclaw team,

Long-time admirer of what `clawguard.sh` is doing — pulling Gitleaks, Semgrep, MCP-Scan, npm audit, and Claude review behind a single trust-registry surface is exactly the right primitive for "is this skill safe to install?". Thank you for shipping that.

I maintain a separate project also named ClawGuard (https://github.com/denial-web/clawguard). Same name, different surface: we are a CLI + GitHub Action that gates the *install path* — static scan + policy decision + approval-gated copy into a trusted folder — rather than a hosted multi-scanner registry. The two are honestly composable: your `/api/v1/scan` could call (or be called by) our `clawguard check --json` and treat its output as one more scanner input.

Our [COMPARISON.md](https://github.com/denial-web/clawguard/blob/main/docs/COMPARISON.md) already credits yourclaw/clawguard-web as the hosted-trust-registry surface; the namespace is messy and I want to be explicit that we're complementary, not competing for the same niche.

Two small things to ask about:

1. **Shared decision shape.** ClawGuard publishes a small JSON Schema, `clawguard.check.v1`, intended as a normalized decision envelope across scanners:
   - Schema: https://denial-web.github.io/clawguard/schemas/clawguard-check.schema.json
   - Source: https://github.com/denial-web/clawguard/blob/main/schemas/clawguard-check.schema.json
   - Working consumer #1 (CLI): `clawguard check <path> --json` emits this shape directly.
   - Working consumer #2 (CI): our [GitHub Action](https://github.com/denial-web/clawguard/blob/main/action.yml) emits the payload as a build artifact and exposes `decision` / `risk` / `summary` / `recommended-action` as step outputs ([example](https://github.com/denial-web/clawguard/blob/main/docs/GITHUB_ACTION.md)).

   If `@yourclaw/clawguard-scanner` ever wants a normalized decision shape to return alongside the per-tool result blobs it already aggregates, this schema is open and versioned. No PR proposed — just flagging in case it's useful when you next touch `/api/v1/scan`.

2. **Compose-pattern mention.** Would you be open to a one-line note in `clawguard-web`'s README pointing users who want a local CLI / GitHub Action install-time gate at ClawGuard? Happy to add the reciprocal mention to ours (already drafted: would link `clawguard.sh` and describe yourclaw's role as a hosted trust registry + multi-scanner aggregator).

Nothing about ClawGuard depends on yourclaw and vice versa. The two products live on different surfaces (local CLI / CI Action vs hosted multi-scanner) and could happily ignore each other forever.

Honest about our stage: ClawGuard is beta, 0 stars at time of writing, schema first published a few days ago. I'm reaching out because I'd rather get the composition story right early than fight namespace wars later.

Happy to be told this isn't the right fit.

Thanks,
denial-web
```

### Draft short message (Discord / X DM / email)

```text
Hi — maintainer of github.com/denial-web/clawguard (different ClawGuard than yourclaw's; local CLI + GitHub Action that gates the install path rather than a hosted multi-scanner). Just opened an issue suggesting clawguard.check.v1 as a normalized decision shape for your /api/v1/scan, with the published schema and a working GitHub Action consumer as concrete references: <issue link>. Fine to close if it's not a fit.
```

## Secondary targets

Not in the first wave. Listed so the rationale for not contacting them yet is recorded.

| Project | Why deferred |
|---|---|
| NeuZhou/clawguard ([npm](https://www.npmjs.com/package/@neuzhou/clawguard)) | **Pre-send check failed on 2026-05-26: the source repo at `github.com/NeuZhou/clawguard` is non-public, so the standard "file a compose-pattern issue" channel is not available.** The maintainer's other public work continues at [NeuZhou/mcp-firewall](https://github.com/NeuZhou/mcp-firewall) and [NeuZhou/agentprobe](https://github.com/NeuZhou/agentprobe). Alternative channels (X DM to `@Neuzhou_`, Substack, npm-maintainer email) are heavier per-message and were judged not worth the asymmetry against a 0-star outreach project. Deferred indefinitely until either the source repo is restored or there is a compelling reason to engage via a non-issue channel. |
| [clawnify/clawguard](https://github.com/clawnify/clawguard) | Watchdog daemon, very small overlap. Wait until ClawGuard has its own out-of-process monitor story to compare. |
| [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian) | Multimodal prompt-injection focus. No present overlap with static scanning. Defer indefinitely. |

## Pre-send checklist

Before sending any message in this doc:

- [ ] Re-read the target project's README. Confirm nothing has changed that would make the message wrong.
- [ ] Verify the maintainer is still active (last commit, issue response cadence).
- [ ] Confirm no recent ClawGuard incident or breaking change makes us look careless.
- [ ] Confirm our README and [COMPARISON.md](COMPARISON.md) already mention them, so the ask is reciprocal not one-sided.
- [ ] If filing an issue, check existing issues for a similar thread first.
- [ ] Copy the message into the "Outreach Log" below as a draft before sending; update with timestamp after sending.

## Outreach Log

| Date | Project | Channel | Status | Notes |
|---|---|---|---|---|
| 2026-05-26 | [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian) | github-issue | sent | Compose-pattern proposal filed at [superglue-ai/clawguardian#1](https://github.com/superglue-ai/clawguardian/issues/1). Pre-send: last commit 2026-02-02, 34 stars at send, no existing "clawguard install" issues. Linked our [INTEGRATION_SPEC.md](INTEGRATION_SPEC.md), [PLUGIN_ID.md](PLUGIN_ID.md), [COMPARISON.md](COMPARISON.md), and the published [clawguard-check.schema.json](https://denial-web.github.io/clawguard/schemas/clawguard-check.schema.json). |
| 2026-05-26 | [lombax85/clawguard](https://github.com/lombax85/clawguard) | github-issue | sent | Compose-pattern proposal filed at [lombax85/clawguard#38](https://github.com/lombax85/clawguard/issues/38). Pre-send: last commit 2026-05-25 (very active), 15 stars at send, no existing "clawguard install" issues. Linked our [INSTALL_WRAPPER_SPEC.md](INSTALL_WRAPPER_SPEC.md), [INTEGRATION_SPEC.md](INTEGRATION_SPEC.md), [COMPARISON.md](COMPARISON.md), and the published [clawguard-install.schema.json](https://denial-web.github.io/clawguard/schemas/clawguard-install.schema.json). |
| 2026-05-26 | [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web) | github-issue | sent | Compose-pattern proposal filed at [yourclaw/clawguard-web#2](https://github.com/yourclaw/clawguard-web/issues/2). Pre-send: clawguard.sh live (307 → www.clawguard.sh), maintainer Fabian Baier active (Pulze.ai), issue tracker enabled, no existing threads, repo quiet since 2026-03-02. Promoted from Secondary after `clawguard.check.v1` gained two working consumers (CLI in beta.8 + GitHub Action via #6). Linked our published [clawguard-check.schema.json](https://denial-web.github.io/clawguard/schemas/clawguard-check.schema.json), the [action.yml consumer](https://github.com/denial-web/clawguard/blob/main/action.yml), [docs/GITHUB_ACTION.md](GITHUB_ACTION.md), and [COMPARISON.md](COMPARISON.md). |
| 2026-05-26 | all three primary targets | github-comment | sent | Follow-up comments on [#1](https://github.com/superglue-ai/clawguardian/issues/1#issuecomment-4541383551), [#38](https://github.com/lombax85/clawguard/issues/38#issuecomment-4541386394), [#2](https://github.com/yourclaw/clawguard-web/issues/2#issuecomment-4541386839) linking [SCANNER_BENCHMARK.md](SCANNER_BENCHMARK.md) and beta.9 npm tag. |
| 2026-05-26 | NeuZhou/clawguard ([npm](https://www.npmjs.com/package/@neuzhou/clawguard)) | n/a | deferred | Pre-send check failed: `github.com/NeuZhou/clawguard` returns 404 (source repo non-public as of 2026-05-26). The standard "file a compose-pattern issue" channel is not available. Alternative channels (X DM to `@Neuzhou_`, Substack, npm-maintainer email) judged too heavy for a 0-star outreach. Moved to Secondary with deferred-indefinitely rationale. See [COMPARISON.md](COMPARISON.md) footnote for the canonical record of the discovery. |

Each row should be appended on send, then updated when a response is received. Do not edit a row in place once a response has landed; add a new row referencing the previous one.

## Related

- [STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md) section 9 item 6 — where this work is tracked.
- [COMPARISON.md](COMPARISON.md) — the public comparison page already linked from README, which any outreach target may read first.
- [REAL_WORLD_VALIDATION.md](REAL_WORLD_VALIDATION.md) "Competitor Landscape Validation" — the public-surface survey behind the framing in each draft.
