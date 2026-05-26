# ClawGuard vs Other ClawGuards

Last reviewed: 2026-05-25.

The name "ClawGuard" is used by at least seven public projects in the OpenClaw ecosystem. This page is an honest map of who does what, where we overlap, and where each project is stronger.

It is intentionally short. For the strategic context behind this comparison, see [STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md).

## Summary table

| Project | Stars | Shape | Primary surface |
|---|---:|---|---|
| **[denial-web/clawguard](https://github.com/denial-web/clawguard)** (this repo) | 0 | Scanner + governed agent runtime | CLI, library, GitHub Action, web demo |
| NeuZhou/clawguard ([npm](https://www.npmjs.com/package/@neuzhou/clawguard)) [^neuzhou-repo] | 1 | Agent firewall / pattern scanner | CLI, library, HTTP server, LangChain middleware |
| [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web) + [yourclaw/clawguard-scanner](https://github.com/yourclaw/clawguard-scanner) | 0 | Hosted trust registry + multi-tool orchestrator | Next.js web app at `clawguard.sh`, REST API |
| [lombax85/clawguard](https://github.com/lombax85/clawguard) | 15 | Outbound API gateway | Local service, Telegram approvals |
| [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian) | 32 | OpenClaw plugin | `before_tool_call` / `tool_result_persist` hooks |
| [clawnify/clawguard](https://github.com/clawnify/clawguard) | 1 | Agent watchdog | Local daemon |
| [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian) | — | Prompt-injection middleware | OpenClaw skill + FastAPI service |

## What each one is best at

### denial-web/clawguard (this project)

- Static security scanner for OpenClaw skills, ClawHub installs, MCP configs, and dependency manifests.
- Optional governed agent runtime ([docs/AGENT.md](AGENT.md)) layered on top of the scanner.
- Approval-gated installs, hash-chained audit, protected assets, blast-radius explain, A-S-FLC routing, role packs, SOP packs.
- Zero runtime dependencies in the core scan path.

Best when you want: one tool that gates the *install* path and optionally runs a governed agent inside the same policy.

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

- Local watchdog daemon.
- Detects loops, stuck tools, forbidden command patterns; takes corrective action.
- Zero dependencies, fleet-deployable.

Best when you want: an out-of-process safety net for many agent instances on the same machine.

### pantherstar/clawguardian

- OpenClaw security middleware.
- Multimodal prompt-injection detection across text, image, PDF, audio.
- On-chain threat intelligence on Base Sepolia.

Best when you want: prompt-injection defense for media-rich agent inputs.

## Where we overlap honestly

| Capability | denial-web | NeuZhou | yourclaw | lombax85 | superglue-ai | clawnify | pantherstar |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Static skill / file scanning | yes | yes | yes | no | partial | no | partial |
| SARIF / GitHub Code Scanning | yes | yes | no | no | no | no | no |
| Approval-gated install path | yes | no | partial | no | no | no | no |
| OpenClaw plugin hook | no | no | no | no | yes | no | yes |
| Outbound API gateway | no | no | no | yes | no | no | no |
| Governed agent runtime | yes | no | no | no | no | no | no |
| Hash-chained audit | yes | no | partial | yes | partial | no | no |
| Memory lifecycle (approval-gated) | yes | no | no | no | no | no | no |
| SOP / role packs | yes | no | no | no | no | no | no |
| Physical device dry-run governor | yes | no | no | no | no | no | no |
| Multimodal prompt-injection | no | no | no | no | no | no | yes |

This table reflects public READMEs as of 2026-05-25. None of these projects exclude another; many are complementary.

## Where we are honestly weaker

- **No native OpenClaw plugin.** [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian) and [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian) hook into the OpenClaw runtime directly; we do not.
- **No outbound API gateway.** [lombax85/clawguard](https://github.com/lombax85/clawguard) intercepts real API calls and keeps tokens off the agent's machine; we do not.
- **No hosted trust registry.** [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web) owns `clawguard.sh` and aggregates public scans; we do not.
- **Longer install command.** `npx --yes --package @denial-web/clawguard@beta clawguard ...` is heavier than `npx @neuzhou/clawguard ...`.
- **No multimodal scanning.** [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian) scans image, PDF, and audio inputs; we are text-only.

## Where we are honestly stronger

- **Install path is the unit of work.** We gate *before* a candidate skill becomes trusted. Most others gate at tool-call time, after the skill is already in the trusted folder.
- **Scanner + governed agent in one package.** No other ClawGuard ships both.
- **Hash-chained audit log** with `clawguard agent audit show --verify`.
- **A-S-FLC routing, role packs, SOP packs.** No other ClawGuard models the operator's job before deciding what to run.
- **Zero scan-path dependencies.** [yourclaw/clawguard-scanner](https://github.com/yourclaw/clawguard-scanner) orchestrates 5+ external tools; we do not.

## How to choose

- **You want to scan a skill / repo / MCP config before trusting it.** Use this project, or [`@neuzhou/clawguard`](https://www.npmjs.com/package/@neuzhou/clawguard) for pure inline pattern checks.
- **You want a public scan score on a hosted page.** Use [yourclaw/clawguard-web](https://github.com/yourclaw/clawguard-web).
- **You want to put a human in front of every outbound API call.** Use [lombax85/clawguard](https://github.com/lombax85/clawguard).
- **You want PII filtering inside OpenClaw itself.** Use [superglue-ai/clawguardian](https://github.com/superglue-ai/clawguardian).
- **You want a watchdog that aborts stuck or runaway agents.** Use [clawnify/clawguard](https://github.com/clawnify/clawguard).
- **You want prompt-injection defense across text, image, PDF, audio.** Use [pantherstar/clawguardian](https://github.com/pantherstar/clawguardian).
- **You want one tool that gates installs and runs a governed agent under the same policy.** Use this project.

Several of these are usefully composable. ClawGuard can gate the install path; superglue-ai's plugin can filter tool calls; lombax85's gateway can sit in front of outbound APIs. They cover different cuts of the same problem.

## Update cadence

This page is regenerated when:

- A new public "ClawGuard" project appears, or
- A listed project ships a meaningfully new surface (plugin hook, registry, gateway, runtime), or
- Quarterly, whichever comes first.

For positioning context behind these choices, see [STRATEGIC_REVIEW.md](STRATEGIC_REVIEW.md). For the public-surface validation behind the capability matrix in this page, see [REAL_WORLD_VALIDATION.md](REAL_WORLD_VALIDATION.md) "Competitor Landscape Validation".

[^neuzhou-repo]: The source repository at `github.com/NeuZhou/clawguard` (referenced from the npm package's `homepage` field) returns 404 as of 2026-05-26. The `@neuzhou/clawguard` package on npm is published and active; the maintainer's other public work continues at [NeuZhou/mcp-firewall](https://github.com/NeuZhou/mcp-firewall) (still labeled "Powered by ClawGuard") and [NeuZhou/agentprobe](https://github.com/NeuZhou/agentprobe). We treat the npm package as the canonical surface until the source repo is restored.
