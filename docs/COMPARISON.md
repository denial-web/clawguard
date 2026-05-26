# ClawGuard vs Other ClawGuards

Last reviewed: 2026-05-26.

The name "ClawGuard" is contested. As of 2026-05-26, [a GitHub search](https://github.com/search?q=clawguard) returns 50+ public repositories named `clawguard` and another 5 named `clawguardian`, spanning static scanners, OpenClaw plugins, outbound gateways, hosted trust registries, watchdogs, TEE-attested gates, and academic prototypes.

This page is **not** an exhaustive catalogue. It deep-dives a small set of projects: (1) the ones we've been in contact with for outreach, (2) the highest-star projects regardless of overlap, and (3) projects with a meaningfully distinct surface (TEE, multimodal, etc.). The next tier is listed in "Other notable projects in the namespace" below.

For the strategic context behind this comparison, see [STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md).

## Summary table — projects we deep-dive

| Project | Stars | Shape | Primary surface |
|---|---:|---|---|
| **[denial-web/clawguard](https://github.com/denial-web/clawguard)** (this repo) | 0 | Scanner + governed agent runtime | CLI, library, GitHub Action, web demo |
| [AquaOne/ClawGuard](https://github.com/AquaOne/ClawGuard) | 303 | Automated audit & defense system (CN) | OpenClaw plugin ecosystem audit |
| [JaydenBeard/clawguard](https://github.com/JaydenBeard/clawguard) | 138 | Activity monitor + kill switch | Real-time dashboard for Clawdbot |
| [Gk0Wk/ClawGuard](https://github.com/Gk0Wk/ClawGuard) | 101 | "Antivirus for OpenClaw" | Skill scanner + dangerous-action approval |
| [SafeAgent-Beihang/clawguard](https://github.com/SafeAgent-Beihang/clawguard) | 49 | Academic agent-safety project (no public README) | Unknown (Beihang University) |
| [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian) | 34 | OpenClaw plugin | `before_tool_call` / `tool_result_persist` hooks |
| [lombax85/clawguard](https://github.com/lombax85/clawguard) | 15 | Outbound API gateway | Local service, Telegram approvals |
| NeuZhou/clawguard ([npm](https://www.npmjs.com/package/@neuzhou/clawguard)) [^neuzhou-repo] | 1 | Agent firewall / pattern scanner | CLI, library, HTTP server, LangChain middleware |
| [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web) + [yourclaw/clawguard-scanner](https://github.com/yourclaw/clawguard-scanner) | 0 + 0 | Hosted trust registry + multi-tool orchestrator | Next.js web app at `clawguard.sh`, REST API |
| [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian) | 2 | Prompt-injection middleware | OpenClaw skill + FastAPI service |
| clawnify/clawguard [^clawnify-repo] | — | Agent watchdog (previously documented) | Repo no longer publicly accessible |

## What each one is best at

### denial-web/clawguard (this project)

- Static security scanner for OpenClaw skills, ClawHub installs, MCP configs, and dependency manifests.
- Optional governed agent runtime ([docs/AGENT.md](AGENT.md)) layered on top of the scanner.
- Approval-gated installs, hash-chained audit, protected assets, blast-radius explain, A-S-FLC routing, role packs, SOP packs.
- Zero runtime dependencies in the core scan path.

Best when you want: one tool that gates the *install* path and optionally runs a governed agent inside the same policy.

### AquaOne/ClawGuard

- Chinese-language project: "针对 OpenClaw 插件生态的自动化安全审计与防御系统" ("Automated security audit and defense system for the OpenClaw plugin ecosystem").
- 303 stars at survey — the highest-star ClawGuard project on GitHub.
- Targets the OpenClaw plugin ecosystem specifically.

Best when you want: the most-adopted ClawGuard in the Chinese OpenClaw community.

### JaydenBeard/clawguard

- "Activity monitor and security dashboard for Clawdbot — real-time analytics, risk analysis, and kill switch."
- Different surface from a static scanner: this is a runtime activity monitor with a kill switch, scoped to Clawdbot rather than OpenClaw generally.
- 138 stars.

Best when you want: a live dashboard of what your Clawdbot agent is doing right now, with an emergency stop button.

### Gk0Wk/ClawGuard

- "The antivirus for OpenClaw — approve dangerous actions, scan skills, block secret leaks, and keep humans in control, for safety."
- 101 stars.
- Closest direct-overlap project to ours in shape (scan + approve dangerous actions). Different scope: framed as antivirus, not install-time gate.

Best when you want: an inside-OpenClaw approval prompt for risky actions, marketed as antivirus.

### SafeAgent-Beihang/clawguard

- 49 stars; no public description on the repo as of 2026-05-26. The owner suggests an affiliation with the SafeAgent group at Beihang University.
- Capabilities unverified without README.

Best when you want: a starting point if you're already in the Beihang/SafeAgent academic ecosystem (assess the README before adopting; we have not).

### NeuZhou/clawguard

- 285+ rule patterns, MCP firewall proxy, TF-IDF anomaly detection, insider-threat detection, LangChain middleware, SARIF, HTTP server.
- Zero dependencies, 684 tests.
- Published as `@neuzhou/clawguard` on npm with a short `npx @neuzhou/clawguard check ...` invocation.
- Source repo at `github.com/NeuZhou/clawguard` is not publicly accessible as of 2026-05-26; the npm package is the canonical surface. The maintainer publishes related work at [NeuZhou/mcp-firewall](https://github.com/NeuZhou/mcp-firewall) and [NeuZhou/agentprobe](https://github.com/NeuZhou/agentprobe).[^neuzhou-repo]

Best when you want: an inline content/risk scanner for any agent framework, called from code or a sidecar HTTP server.

### yourclaw/clawguard-web + clawguard-scanner

- Hosted trust registry at `clawguard.sh` with public scan-on-demand.
- Scanner orchestrates Gitleaks, Semgrep, MCP-Scan, npm audit, and Claude AI review in parallel.
- REST `POST /api/v1/scan`.

Best when you want: a web-facing trust score and an aggregated multi-tool scan, not a local CLI.

### lombax85/clawguard

- Outbound API gateway between an OpenClaw agent and real services (GitHub, Slack, OpenAI, Todoist).
- Real API tokens never leave ClawGuard's machine; the agent runs with dummy credentials.
- CIBA pattern with Telegram approval, hourly audit dashboard.

Best when you want: out-of-band, human-in-the-loop approval for every outbound write call your agent makes.

### superglue-ai/clawguardian

- Native OpenClaw plugin (`openclaw plugins install clawguardian`).
- Hooks `before_agent_start`, `before_tool_call`, and `tool_result_persist`.
- Block, redact, confirm, agent-confirm, warn, log actions.

Best when you want: PII / sensitive-data filtering inside the OpenClaw tool-call lifecycle with no separate process.

### clawnify/clawguard

- Previously a local watchdog daemon: detected loops, stuck tools, forbidden command patterns; took corrective action; zero dependencies, fleet-deployable.
- **The repository at `github.com/clawnify/clawguard` returns 404 as of 2026-05-26.**[^clawnify-repo] The `clawnify` organization still exists with 22 other repos (clawflow, open-board, open-crm, etc.), but the `clawguard` repo specifically is no longer publicly accessible. Treat this section as historical until / unless the repo is restored.

### pantherstar/clawguardian

- OpenClaw security middleware.
- Multimodal prompt-injection detection across text, image, PDF, audio.
- On-chain threat intelligence on Base Sepolia.

Best when you want: prompt-injection defense for media-rich agent inputs.

## Other notable projects in the namespace

The deep-dive list above is curated. The broader ClawGuard namespace also includes the following projects we have not deep-dived. Listed by stars at survey on 2026-05-26 (descriptions are the maintainer's own; we have not independently verified capabilities).

| Project | Stars | Maintainer description |
|---|---:|---|
| [NSF-AIGuard/NSF-ClawGuard](https://github.com/NSF-AIGuard/NSF-ClawGuard) | 33 | "Real-time monitoring of the security status on the client side, intelligently identifying risks and providing handling solutions." |
| [jiangmuran/clawguard](https://github.com/jiangmuran/clawguard) | 28 | "Security scanning and interception tool for OpenClaw, offering comprehensive diagnostics for skills/plugins, risk detection, and one-click protection." |
| [NY1024/ClawGuard](https://github.com/NY1024/ClawGuard) | 23 | "Comprehensive security toolkit designed to mitigate risks associated with autonomous agents, such as OpenClaw and other LLM Agents." |
| [capsulesecurity/clawguard](https://github.com/capsulesecurity/clawguard) | 23 | "Security guard plugin for OpenClaw — uses LLM as a Judge to detect and block risky tool calls." |
| [Claw-Guard/ClawGuard](https://github.com/Claw-Guard/ClawGuard) | 17 | (no description) |
| [SaharaLabsAI/Verifiable-ClawGuard](https://github.com/SaharaLabsAI/Verifiable-ClawGuard) | 7 | "Use TEE attestation to enable a remote OpenClaw agent to prove themselves running behind some known guardrail." — unique surface (trusted-execution attestation). |
| [joergmichno/clawguard](https://github.com/joergmichno/clawguard) | 7 | "Open-Source Prompt Injection Scanner for AI agents. 225 detection patterns, 15 languages, F1=98.3%. REST API, EU AI Act compliance mapping, <10ms latency." |
| [newtro/ClawGuard](https://github.com/newtro/ClawGuard) | 6 | "Security middleware for OpenClaw skills — permission manifests, sandboxing, and audit logging." |
| [aeon0199/ClawGuard](https://github.com/aeon0199/ClawGuard) | 5 | "High-performance C++ system monitor and security watchdog for OpenClaw. Port intrusion detection, skill attribution, trend analysis, and proactive alerts." |
| [Stanxy/clawguard](https://github.com/Stanxy/clawguard) | 1 | "DLP surveillance layer for OpenClaw — scans outbound content for secrets, PII, and policy violations before it leaves the machine." |
| [0xtrsn/clawguard](https://github.com/0xtrsn/clawguard) | 1 | "OpenClaw intermediary that limits activity on a host PC." |

This is not exhaustive. Several dozen smaller / zero-star projects exist; see the [GitHub search](https://github.com/search?q=clawguard) for the current full list.

## Where we overlap honestly

The matrix below covers the named deep-dive comparators we know well enough to compare. It does not cover every project in "Other notable projects" above, because we have not validated their capabilities against their READMEs.

| Capability | denial-web | NeuZhou | yourclaw | lombax85 | superglue-ai | pantherstar |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Static skill / file scanning | yes | yes | yes | no | partial | partial |
| SARIF / GitHub Code Scanning | yes | yes | no | no | no | no |
| Approval-gated install path | yes | no | partial | no | no | no |
| OpenClaw plugin hook | no | no | no | no | yes | yes |
| Outbound API gateway | no | no | no | yes | no | no |
| Governed agent runtime | yes | no | no | no | no | no |
| Hash-chained audit | yes | no | partial | yes | partial | no |
| Memory lifecycle (approval-gated) | yes | no | no | no | no | no |
| SOP / role packs | yes | no | no | no | no | no |
| Physical device dry-run governor | yes | no | no | no | no | no |
| Multimodal prompt-injection | no | no | no | no | no | yes |

This table reflects public READMEs as of 2026-05-26. None of these projects exclude another; many are complementary.

## Where we are honestly weaker

- **No native OpenClaw plugin.** [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian) and [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian) hook into the OpenClaw runtime directly; we do not. [Gk0Wk/ClawGuard](https://github.com/Gk0Wk/ClawGuard) also surfaces approval prompts inside OpenClaw rather than at install time.
- **No outbound API gateway.** [lombax85/clawguard](https://github.com/lombax85/clawguard) intercepts real API calls and keeps tokens off the agent's machine; we do not.
- **No hosted trust registry.** [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web) owns `clawguard.sh` and aggregates public scans; we do not.
- **No live runtime activity dashboard.** [JaydenBeard/clawguard](https://github.com/JaydenBeard/clawguard) and [NSF-AIGuard/NSF-ClawGuard](https://github.com/NSF-AIGuard/NSF-ClawGuard) show what an agent is doing in real time, with a kill switch; we focus on the install path and offline scan instead.
- **No TEE attestation.** [SaharaLabsAI/Verifiable-ClawGuard](https://github.com/SaharaLabsAI/Verifiable-ClawGuard) proves a remote agent is running behind a known guardrail using trusted-execution attestation; we do not.
- **Longer install command.** `npx --yes --package @denial-web/clawguard@beta clawguard ...` is heavier than `npx @neuzhou/clawguard ...`.
- **No multimodal scanning.** [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian) scans image, PDF, and audio inputs; we are text-only.
- **Low community traction so far.** Three projects in the namespace have more than 100 stars — [AquaOne/ClawGuard](https://github.com/AquaOne/ClawGuard) (303), [JaydenBeard/clawguard](https://github.com/JaydenBeard/clawguard) (138), [Gk0Wk/ClawGuard](https://github.com/Gk0Wk/ClawGuard) (101) — while we are at 0. We have no community-validation signal yet.

## Where we are honestly stronger

- **Install path is the unit of work.** We gate *before* a candidate skill becomes trusted. Most others gate at tool-call time, after the skill is already in the trusted folder.
- **Scanner + governed agent in one package.** No other ClawGuard ships both.
- **Hash-chained audit log** with `clawguard agent audit show --verify`.
- **A-S-FLC routing, role packs, SOP packs.** No other ClawGuard models the operator's job before deciding what to run.
- **Zero scan-path dependencies.** [yourclaw/clawguard-scanner](https://github.com/yourclaw/clawguard-scanner) orchestrates 5+ external tools; we do not.

## How to choose

- **You want to scan a skill / repo / MCP config before trusting it.** Use this project, or [`@neuzhou/clawguard`](https://www.npmjs.com/package/@neuzhou/clawguard) for pure inline pattern checks.
- **You want approval prompts inside OpenClaw for risky actions, marketed as antivirus.** Use [Gk0Wk/ClawGuard](https://github.com/Gk0Wk/ClawGuard).
- **You want the most community-adopted ClawGuard in the Chinese OpenClaw scene.** Use [AquaOne/ClawGuard](https://github.com/AquaOne/ClawGuard).
- **You want a live dashboard + kill switch for a running Clawdbot agent.** Use [JaydenBeard/clawguard](https://github.com/JaydenBeard/clawguard).
- **You want TEE attestation to prove a remote agent is running behind a known guardrail.** Use [SaharaLabsAI/Verifiable-ClawGuard](https://github.com/SaharaLabsAI/Verifiable-ClawGuard).
- **You want a public scan score on a hosted page.** Use [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web).
- **You want to put a human in front of every outbound API call.** Use [lombax85/clawguard](https://github.com/lombax85/clawguard).
- **You want PII filtering inside OpenClaw itself.** Use [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian).
- **You want prompt-injection defense across text, image, PDF, audio.** Use [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian).
- **You want one tool that gates installs and runs a governed agent under the same policy.** Use this project.

Several of these are usefully composable. ClawGuard can gate the install path; superglue-ai's plugin can filter tool calls; lombax85's gateway can sit in front of outbound APIs; JaydenBeard's dashboard can watch all of the above. They cover different cuts of the same problem.

## Update cadence

This page is regenerated when:

- A new public "ClawGuard" project appears, or
- A listed project ships a meaningfully new surface (plugin hook, registry, gateway, runtime), or
- Quarterly, whichever comes first.

For positioning context behind these choices, see [STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md). For the public-surface validation behind the capability matrix in this page, see [REAL_WORLD_VALIDATION.md](REAL_WORLD_VALIDATION.md) "Competitor Landscape Validation".

[^neuzhou-repo]: The source repository at `github.com/NeuZhou/clawguard` (referenced from the npm package's `homepage` field) returns 404 as of 2026-05-26. The `@neuzhou/clawguard` package on npm is published and active; the maintainer's other public work continues at [NeuZhou/mcp-firewall](https://github.com/NeuZhou/mcp-firewall) (still labeled "Powered by ClawGuard") and [NeuZhou/agentprobe](https://github.com/NeuZhou/agentprobe). We treat the npm package as the canonical surface until the source repo is restored.

[^clawnify-repo]: The repository at `github.com/clawnify/clawguard` returns 404 as of 2026-05-26. The `clawnify` organization remains active with 22 other repositories (clawflow, open-board, open-crm, open-studio, etc.), but the `clawguard` repo is no longer publicly accessible. No replacement npm package or alternate source has been published as far as we can tell. We retain the section for historical context.
