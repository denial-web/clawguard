# ClawGuard documentation index

**ClawGuard** = explainable governance for AI agents and the skills/tools they use. Two parts, usable independently: **Core** (scan/gate/install) and **Agent** (optional governed runtime). Terms: [GLOSSARY.md](GLOSSARY.md).

## Start here

| Doc | Purpose |
| --- | --- |
| [GLOSSARY.md](GLOSSARY.md) | Core vs Agent, OpenClaw, ClawHub, Hermes, external tools |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design (Core surfaces + library layout) |
| [AGENT.md](AGENT.md) | Agent runtime overview |
| [THREAT_MODEL.md](THREAT_MODEL.md) | Scanner threat model |
| [AGENT_THREAT_MODEL.md](AGENT_THREAT_MODEL.md) | Agent threat model |
| [COMPARISON.md](COMPARISON.md) | This repo vs other GitHub projects named "ClawGuard" |

## Scanner path (ClawGuard Core)

| Doc | Purpose |
| --- | --- |
| [RULES.md](RULES.md) | Stable rule IDs and suppressions |
| [POLICY_MODEL.md](POLICY_MODEL.md) | Risk and governance decisions |
| [CONFIG_TEMPLATES.md](CONFIG_TEMPLATES.md) | Starter `.clawguard.json` profiles |
| [INTEGRATION_SPEC.md](INTEGRATION_SPEC.md) | OpenClaw, ClawHub, GitHub Action, MCP, `check` contract |
| [INSTALL_WRAPPER_SPEC.md](INSTALL_WRAPPER_SPEC.md) | `clawguard install <url>` quarantine flow |
| [GITHUB_ACTION.md](GITHUB_ACTION.md) | CI workflow examples |
| [REPORT_SCHEMA.md](REPORT_SCHEMA.md) | Versioned JSON report contracts |
| [WORKSPACE_SCANNING.md](WORKSPACE_SCANNING.md) | Workspace-wide scans |
| [MCP_PLUGIN_SCANNING.md](MCP_PLUGIN_SCANNING.md) | MCP and plugin config scanning |
| [DEPENDENCY_SCANNING.md](DEPENDENCY_SCANNING.md) | npm/Python dependency signals |
| [CLAWHUB_METADATA.md](CLAWHUB_METADATA.md) | ClawHub lockfile and metadata drift |

## Agent path (ClawGuard Agent)

| Doc | Purpose |
| --- | --- |
| [PORTABLE_AGENT_SETUP.md](PORTABLE_AGENT_SETUP.md) | OpenClaw / Hermes / PicoClaw setup |
| [AGENT_MEMORY_POLICY.md](AGENT_MEMORY_POLICY.md) | Memory governance rules |
| [AGENT_MESSAGING_SETUP.md](AGENT_MESSAGING_SETUP.md) | Telegram / WhatsApp approvals |
| [RUN_PLAN.md](RUN_PLAN.md) | Combined skill + model + budget plans |
| [RECOVERY_MODEL.md](RECOVERY_MODEL.md) | Backup and recovery behavior |
| [ROLE_INTELLIGENCE.md](ROLE_INTELLIGENCE.md) | Role packs and SOP wiring |
| [SOP_PACKS.md](SOP_PACKS.md) | Small-business SOP packs |

## Benchmarks and evidence

| Doc | Purpose |
| --- | --- |
| [SCANNER_BENCHMARK.md](SCANNER_BENCHMARK.md) | Static scanner precision/recall |
| [AGENT_POLICY_ENFORCEMENT.md](AGENT_POLICY_ENFORCEMENT.md) | Autonomy gate vs bare LLMs (n=50) |
| [MODEL_AGNOSTIC_GOVERNANCE.md](MODEL_AGNOSTIC_GOVERNANCE.md) | ClawGuard(X) vs bare-X matrix |
| [AGENT_BENCHMARK_v1.0.0-beta.9.md](AGENT_BENCHMARK_v1.0.0-beta.9.md) | Doctrine Lab schema benchmark |

Regenerate: see root [README.md](../README.md#benchmarks-and-evidence).

## Integrations and demos

| Doc | Purpose |
| --- | --- |
| [WEB_DEMO.md](WEB_DEMO.md) | Local scanner web UI |
| [HUGGINGFACE.md](HUGGINGFACE.md) | Public demo Space |
| [PLUGIN_ID.md](PLUGIN_ID.md) | OpenClaw plugin id constraints |
| [CURSOR_USB_HANDOFF.md](CURSOR_USB_HANDOFF.md) | Offline USB handoff |
| [MOBILE_APPROVAL_HANDOFF.md](MOBILE_APPROVAL_HANDOFF.md) | Mobile approval handoff |
| [BROWSER_BRIDGE_SPEC.md](BROWSER_BRIDGE_SPEC.md) | Browser bridge (spec) |

## Testing and beta

| Doc | Purpose |
| --- | --- |
| [EXTERNAL_TESTING.md](EXTERNAL_TESTING.md) | Teammate smoke test |
| [FIVE_MINUTE_TESTER_KIT.md](FIVE_MINUTE_TESTER_KIT.md) | Hand to a tester on another PC |
| [BETA_TESTING_CHECKLIST.md](BETA_TESTING_CHECKLIST.md) | Beta tester checklist |
| [TEAM_SETUP_TESTING.md](TEAM_SETUP_TESTING.md) | Team setup validation |

## Threat models and specialized governors

| Doc | Purpose |
| --- | --- |
| [INTER_COMPONENT_CHANNEL_THREAT_MODEL.md](INTER_COMPONENT_CHANNEL_THREAT_MODEL.md) | Cross-component channels |
| [FINANCIAL_AI_GOVERNOR.md](FINANCIAL_AI_GOVERNOR.md) | Financial-services track |
| [PHYSICAL_DEVICE_AI_GOVERNOR.md](PHYSICAL_DEVICE_AI_GOVERNOR.md) | Physical-device planning track |
| [BUDGET_GOVERNANCE.md](BUDGET_GOVERNANCE.md) | Token spend governance |

## Release history

Versioned notes: [releases/](releases/).

## Maintainer docs (not public product surface)

Working notes (launch, outreach, prompts): [internal/](internal/).
