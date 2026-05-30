# ClawGuard glossary

Short definitions for names you will see across the repo, CLI, and docs.

## ClawGuard products

| Term | Meaning |
| --- | --- |
| **ClawGuard** | Umbrella project: explainable governance for AI agents and the skills/tools they use. |
| **ClawGuard Core** | Static scanner, policy gate, guarded install, monitor, and GitHub Action. Use before trusting a skill. CLI: `scan`, `gate`, `check`, `install`, `monitor`. |
| **ClawGuard Agent** | Optional governed agent runtime: deterministic tool autonomy, approvals, audit, blast-radius. CLI: `agent`, `explain`, `setup-ui`. Documented in [AGENT.md](AGENT.md). |

Core and Agent are **independent**: you can scan skills without running the agent, and run the agent without using the scanner in CI.

## Ecosystem (compatible, not owned by ClawGuard)

| Term | Meaning |
| --- | --- |
| **OpenClaw** | Open agent/skill ecosystem ClawGuard targets. ClawGuard is compatible but **not affiliated**. |
| **ClawHub** | Skill registry / lockfile concept (`clawhub:<slug>@<version>` installs). Discovery stays in ClawHub; ClawGuard gates install. |
| **Hermes Agent** | Optional agent framework; ClawGuard provides `clawguard hermes install` presets. |
| **PicoClaw** | Optional lightweight agent framework; `clawguard picoclaw install` preset. |
| **MCP** | Model Context Protocol — tool/server configs ClawGuard can scan (e.g. `.cursor/mcp.json`). |

## External tools (not shipped as ClawGuard)

| Term | Meaning |
| --- | --- |
| **Doctrine Lab** | Separate evaluation platform (often `127.0.0.1:8000`) used for benchmark trace import and LLM-as-judge experiments. Optional; not required to scan or gate skills. |
| **Nexus** | External agent project referenced in benchmark wiring (`NEXUS_AGENT_URL`). Not part of the ClawGuard package. |

## Other “ClawGuard” repos on GitHub

Several unrelated repositories use similar names. This project is **`denial-web/clawguard`** on npm as `@denial-web/clawguard`. See [COMPARISON.md](COMPARISON.md) for a namespace map.
