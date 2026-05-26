# Real-World Validation

Last checked: 2026-05-26.

Previous check: 2026-05-25 (competitor landscape survey). Initial 2026-05-08 (ClawHub-only).

## Refresh History

- **2026-05-26** — Published `clawguard.install.v1` and shipped the `clawguard install <url>` CLI for HTTPS tarballs plus `--resume`. Spec: [INSTALL_WRAPPER_SPEC.md](INSTALL_WRAPPER_SPEC.md). Schema: [clawguard-install.schema.json](../schemas/clawguard-install.schema.json). Implementation: [src/install-url/](../src/install-url/). End-to-end test coverage includes path-traversal, symlink, integrity-mismatch, and approval-resume paths. Zip and `clawhub:` URLs remain deferred to v1.1 with an explicit exit-3 message.
- **2026-05-25** — Added the "Competitor Landscape Validation" section after [STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md) flagged the crowded ClawGuard namespace on GitHub. No new ClawHub source clone in this refresh; ClawHub findings from 2026-05-08 are unchanged.
- **2026-05-08** — Initial ClawHub compatibility validation against `openclaw/clawhub` source.

## Sources Checked

- Official ClawHub repository: https://github.com/openclaw/clawhub
- Official ClawHub skill format docs: https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md
- OpenClaw ClawHub docs: https://docs.openclaw.ai/tools/clawhub

The official `openclaw/clawhub` repository was cloned at:

```text
f14d70759dcc14b24890f5a50e1f9ce06f38eacd
```

An attempted shallow clone of `https://github.com/openclaw/skills` returned `Repository not found` from GitHub in this environment, so validation used the current ClawHub source repository, docs, schema code, and a local skill fixture modeled on the current public skill-format docs.

## Compatibility Signals

Current ClawHub docs describe:

- Skill folders with `SKILL.md` or `skill.md`.
- Per-skill install metadata at `<skill>/.clawhub/origin.json`.
- Workspace install state at `<workdir>/.clawhub/lock.json`.
- Runtime declarations under `metadata.openclaw`.
- Alias metadata namespaces: `metadata.clawdbot` and `metadata.clawdis`.
- Required env declarations through `requires.env`, `primaryEnv`, and `envVars`.
- Install specs under `metadata.openclaw.install`.
- Install kinds including `brew`, `node`, `go`, and `uv`.

## Validation Results

ClawGuard already covered the main ClawHub surfaces:

- `SKILL.md` and `skill.md` frontmatter parsing.
- `.clawhub/origin.json` and `.clawhub/lock.json` scanning.
- `openclaw.plugin.json` package manifest scanning.
- Lock/origin drift detection.
- Declared env, binary, config, network, and install behavior.
- npm and Python dependency manifest checks.
- MCP and OpenClaw plugin config checks.

This validation added parser support for:

- `metadata.openclaw.envVars` map entries.
- `requiredEnv` declarations used by ClawHub config examples.
- OpenClaw plugin package compatibility fields required by current ClawHub publishing flows.
- TypeScript plugin runtime entries that need matching compiled JavaScript output.

The latest-format validation fixture now scans without undeclared metadata findings. It only reports the expected low external-network signal for the example URL.

## Competitor Landscape Validation

This section is a public-surface survey, not a runtime scan. Six other GitHub projects publish under the name "ClawGuard" (or "ClawGuardian"). For positioning context see [STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md); for a side-by-side capability comparison see [COMPARISON.md](COMPARISON.md). This section validates that the claims in those summaries match each project's public README and verifies which surfaces ClawGuard does and does not interoperate with today.

### Method

- Read each project's GitHub README, package metadata (when on npm), and any linked schema/spec docs.
- Did not clone, build, or run any competitor source. Running competitor binaries is a separate validation pass and is listed as a gap below.
- Snapshot date: 2026-05-26. Star counts and last-push dates change continuously; treat as approximate.
- The 2026-05-26 re-survey discovered the namespace is materially larger than the 2026-05-25 first pass recorded — 50+ public projects in total. The full list lives in [COMPARISON.md](COMPARISON.md). The table below covers the projects we've validated for interop intent; for the full landscape with star counts and one-line descriptions, see [COMPARISON.md](COMPARISON.md) "Summary table" and "Other notable projects in the namespace".

### Per-project validation

| Project | Stars | Surface they publish | What ClawGuard reads today | Interop status |
|---|---:|---|---|---|
| [AquaOne/ClawGuard](https://github.com/AquaOne/ClawGuard) | 303 | CN README verified 2026-05-26: Python AST static scan (`python -m clawguard scan`), runtime `audit-hook` monitor, millisecond RCE/exfil interception, anti-abuse marketplace modeling, MIT Beta. | Nothing direct; both do static analysis but on different artifacts (their AST on agent Python source vs our skill/MCP/dependency files). | **Parallel + partial overlap.** Their runtime interceptor is complementary to our install gate; both could run on the same deployment. No shared schema. English README still absent — see gap below for full translation pass. |
| [JaydenBeard/clawguard](https://github.com/JaydenBeard/clawguard) | 138 | README verified 2026-05-26: `@jaydenbeard/clawguard` npm; background service + `localhost:3847` dashboard; WebSocket activity feed; risk tiers; kill switch; webhooks; multi-gateway (`openclaw`/`moltbot`/`clawdbot`). | Nothing direct. | **Complementary.** Their surface is *runtime activity monitor + kill switch*; ours is *install gate + offline scan*. Series-composable. |
| [Gk0Wk/ClawGuard](https://github.com/Gk0Wk/ClawGuard) | 101 | README verified 2026-05-26: OpenClaw plugin demo (not npm-published); runtime approval for `exec`, outbound, `write`/`edit`/`apply_patch`; plugin pages `/clawguard*`. Explicitly Sprint 0 / install-demo only. | Nothing direct. | **Closest narrative overlap, different cut.** Inside-OpenClaw runtime approval UI vs our install-time gate. `clawguard.check.v1` could be proposed if they ship a stable decision API; outreach deferred until they exit demo stage. |
| [SafeAgent-Beihang/clawguard](https://github.com/SafeAgent-Beihang/clawguard) | 49 | README verified 2026-05-26: ClawGuard v3 — five SKILL.md-driven modules (Auditor, Checker, Detect, Guardian, Shield); 2,714 lines of agent-executable defense guides; Beihang academic line. | Nothing direct; their model is agent-invoked SKILL.md modules, not host CLI. | **Parallel, different integration model.** Agent reads defense SKILL.md files; we gate installs from the host. Could compose if an operator runs ClawGuard scan before loading SafeAgent modules. |
| [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian) | 34 | OpenClaw plugin: `before_agent_start`, `before_tool_call`, `tool_result_persist` hooks. | Nothing direct. ClawGuard does not register as an OpenClaw plugin today. | **Complementary.** Their surface is *tool-call interception inside OpenClaw*; ours is *install-time gating*. Outreach issue filed at [superglue-ai/clawguardian#1](https://github.com/superglue-ai/clawguardian/issues/1). |
| [lombax85/clawguard](https://github.com/lombax85/clawguard) | 15 | YAML policy gateway with Telegram approvals; CIBA pattern. | Nothing direct. Their `clawguard.yaml` is a different policy schema. | **Complementary.** Their surface is *outbound API gateway*; ours is *install gate + governed agent*. Outreach issue filed at [lombax85/clawguard#38](https://github.com/lombax85/clawguard/issues/38). |
| [SaharaLabsAI/Verifiable-ClawGuard](https://github.com/SaharaLabsAI/Verifiable-ClawGuard) | 7 | TEE attestation that a remote OpenClaw agent runs behind a known guardrail. | Nothing direct. | **Complementary, distinct surface.** TEE attestation is unique in the namespace. Could attest *our* gate decision in a future composition. |
| NeuZhou/clawguard ([npm](https://www.npmjs.com/package/@neuzhou/clawguard); source repo not publicly accessible as of 2026-05-26 — see [COMPARISON.md](COMPARISON.md)) | 1 | CLI + library + HTTP server; SARIF; LangChain middleware. | Nothing direct; we both emit SARIF, so both can target the same GitHub Code Scanning surface. | **Parallel.** Both can run on the same repo without conflict. No shared config schema. No outreach channel available (no public issue tracker). |
| [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web) + [yourclaw/clawguard-scanner](https://github.com/yourclaw/clawguard-scanner) | 0 + 0 | Hosted trust registry at `clawguard.sh`; REST `POST /api/v1/scan`; orchestrates Gitleaks, Semgrep, MCP-Scan, npm audit, Claude review. | Nothing direct. Their registry format is not documented as a public schema. | **Parallel, schema-composable.** [`clawguard.check.v1`](../schemas/clawguard-check.schema.json) proposed as a normalized decision shape via [yourclaw/clawguard-web#2](https://github.com/yourclaw/clawguard-web/issues/2). |
| [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian) | 2 | OpenClaw skill + FastAPI service; multimodal detection; on-chain threat intel. | Nothing direct; ClawGuard does not currently scan image/PDF/audio inputs. | **Complementary.** Their surface is *multimodal prompt-injection*; ours is *static skill / config / dependency scanning*. |
| clawnify/clawguard | — | Previously: local daemon with stuck-tool / loop / forbidden-pattern rules. | Nothing direct. | **Repo not publicly accessible** (404 as of 2026-05-26 — see [COMPARISON.md](COMPARISON.md) footnote). Retained in this table for historical context. |

### Compatibility signals validated

- **SARIF.** Both `denial-web/clawguard` and `@neuzhou/clawguard` emit SARIF for GitHub Code Scanning; the same repository can ingest both outputs without collision (rule IDs are namespaced).
- **OpenClaw plugin slug.** `clawguardian` is taken by [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian). Any future ClawGuard OpenClaw plugin must use a different identifier.
- **npm name.** `@neuzhou/clawguard` ships as a single-word `clawguard` command via `npx @neuzhou/clawguard`; ours is `@denial-web/clawguard`. No package-name collision, but command-name conflict exists if both are installed globally.
- **Domain.** `clawguard.sh` is held by `yourclaw/clawguard-web`. Confirmed via their public Next.js README homepage field.

### What was not validated

- **No runtime scan of competitor source.** Cloning and running `clawguard scan` against each competitor repo would surface real findings (e.g. does their own code pass our static rules?) and is a separate validation pass — listed as a gap below.
- **Partial CN README pass only.** [AquaOne/ClawGuard](https://github.com/AquaOne/ClawGuard) capabilities were summarized from the Chinese README on 2026-05-26 (static AST scan, audit-hook runtime, interceptor). A full English translation pass for operator-facing docs is still open. Other CN-only projects remain unvalidated ([hongshaoyu1166](https://github.com/hongshaoyu1166/clawguard), [ForceInjection](https://github.com/ForceInjection/ClawGuard), [legeling](https://github.com/legeling/ClawGuard), [xw-xmy](https://github.com/xw-xmy/clawguard)).
- **No README walk-through for repos without a public description.** [Claw-Guard/ClawGuard](https://github.com/Claw-Guard/ClawGuard) (17 stars) still has no public description; capabilities unverified. SafeAgent-Beihang was validated via README on 2026-05-26.
- **No semver/install-script audit of `@neuzhou/clawguard` package contents.** Only the README was read.
- **No interactive verification of `clawguard.sh` `/api/v1/scan` response shape.** Endpoint was read from the README, not exercised (HTTP probe confirmed the service is live as of 2026-05-26).
- **No `superglue-ai/clawguardian` plugin install on a live OpenClaw instance.** Hook list verified from README only.
- **No catalogue of the long tail.** Projects under 5 stars (~20+ projects) are listed in [COMPARISON.md](COMPARISON.md) but not individually validated against our surfaces.

## Remaining Real-World Gaps

ClawHub interop:

- Add optional digest/source verification for ClawHub plugin packages when metadata is available.
- Validate against real installed skill folders once a public archive or local ClawHub install is available.
- Add a small corpus of known-safe and known-risky public skills after manual review.

Competitor interop:

- Run `clawguard scan` against each of the six other ClawGuard projects and publish the findings. Use a dedicated `examples/competitor-fixtures/` snapshot to keep the result stable. *(Still open. Tracked for the next refresh.)*
- Specify a shared "trust result" schema, propose it to `yourclaw/clawguard-web` as a public input format, and document the mapping in [INTEGRATION_SPEC.md](INTEGRATION_SPEC.md). The existing [clawguard-check.schema.json](../schemas/clawguard-check.schema.json) is the candidate. *(Partially closed: schema is frozen and INTEGRATION_SPEC.md "Compose Patterns" now names `clawguard-web` as a consumer. Sending the proposal to that project still requires sign-off in [OUTREACH.md](OUTREACH.md).)*
- Decide on the OpenClaw plugin identifier ClawGuard would publish under (must avoid `clawguardian`, already taken). Track in a follow-up to [STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md) item 6; outreach drafts live in [OUTREACH.md](OUTREACH.md). *(Closed for design: constraint and candidate ids recorded in [PLUGIN_ID.md](PLUGIN_ID.md). Final id pick deferred until a plugin prototype exists.)*
- Document an explicit compose pattern in [INTEGRATION_SPEC.md](INTEGRATION_SPEC.md) for running ClawGuard alongside [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian) and [lombax85/clawguard](https://github.com/lombax85/clawguard) so users see ClawGuard as the missing layer, not a replacement. *(Done: see "Compose Patterns" in [INTEGRATION_SPEC.md](INTEGRATION_SPEC.md).)*

## Refresh Cadence

This document is regenerated when:

- A new public "ClawGuard" project appears.
- A listed project ships a meaningfully new surface (plugin hook, registry, gateway, runtime, schema).
- ClawGuard publishes a new schema (`clawguard.report.v*`, `clawguard.check.v*`, `clawguard.install.v*`).
- Quarterly, whichever comes first.

Each refresh MUST update the "Last checked" date at the top and append an entry under "Refresh History".
