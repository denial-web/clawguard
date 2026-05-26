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
- Snapshot date: 2026-05-25. Star counts and last-push dates change continuously; treat as approximate.

### Per-project validation

| Project | Surface they publish | What ClawGuard reads today | Interop status |
|---|---|---|---|
| [NeuZhou/clawguard](https://github.com/NeuZhou/clawguard) (`@neuzhou/clawguard`) | CLI + library + HTTP server; SARIF; LangChain middleware. | Nothing direct; we both emit SARIF, so both can target the same GitHub Code Scanning surface. | **Parallel.** Both can run on the same repo without conflict. No shared config schema. |
| [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web) + [yourclaw/clawguard-scanner](https://github.com/yourclaw/clawguard-scanner) | Hosted trust registry at `clawguard.sh`; REST `POST /api/v1/scan`; orchestrates Gitleaks, Semgrep, MCP-Scan, npm audit, Claude review. | Nothing direct. Their registry format is not documented as a public schema. | **Parallel.** Could converge if a shared trust-result schema is published; today ClawGuard's [clawguard-check.schema.json](../schemas/clawguard-check.schema.json) is the closest candidate but has not been proposed to them. |
| [lombax85/clawguard](https://github.com/lombax85/clawguard) | YAML policy gateway with Telegram approvals; CIBA pattern. | Nothing direct. Their `clawguard.yaml` is a different policy schema. | **Complementary.** Their surface is *outbound API gateway*; ours is *install gate + governed agent*. No overlap. |
| [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian) | OpenClaw plugin: `before_agent_start`, `before_tool_call`, `tool_result_persist` hooks. | Nothing direct. ClawGuard does not register as an OpenClaw plugin today. | **Complementary.** Their surface is *tool-call interception inside OpenClaw*; ours is *install-time gating*. Both could run in the same OpenClaw install. |
| [clawnify/clawguard](https://github.com/clawnify/clawguard) | Local daemon JSON config with stuck-tool / loop / forbidden-pattern rules. | Nothing direct. | **Parallel.** Both are out-of-process safety nets; their model is anomaly-based, ours is policy-based. |
| [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian) | OpenClaw skill + FastAPI service; multimodal detection; on-chain threat intel. | Nothing direct; ClawGuard does not currently scan image/PDF/audio inputs. | **Complementary.** Their surface is *multimodal prompt-injection*; ours is *static skill / config / dependency scanning*. |

### Compatibility signals validated

- **SARIF.** Both `denial-web/clawguard` and `@neuzhou/clawguard` emit SARIF for GitHub Code Scanning; the same repository can ingest both outputs without collision (rule IDs are namespaced).
- **OpenClaw plugin slug.** `clawguardian` is taken by [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian). Any future ClawGuard OpenClaw plugin must use a different identifier.
- **npm name.** `@neuzhou/clawguard` ships as a single-word `clawguard` command via `npx @neuzhou/clawguard`; ours is `@denial-web/clawguard`. No package-name collision, but command-name conflict exists if both are installed globally.
- **Domain.** `clawguard.sh` is held by `yourclaw/clawguard-web`. Confirmed via their public Next.js README homepage field.

### What was not validated

- **No runtime scan of competitor source.** Cloning and running `clawguard scan` against each competitor repo would surface real findings (e.g. does their own code pass our static rules?) and is a separate validation pass — listed as a gap below.
- **No semver/install-script audit of `@neuzhou/clawguard` package contents.** Only the README was read.
- **No interactive verification of `clawguard.sh` `/api/v1/scan` response shape.** Endpoint was read from the README, not exercised.
- **No `superglue-ai/clawguardian` plugin install on a live OpenClaw instance.** Hook list verified from README only.

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
