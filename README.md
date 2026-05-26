# ClawGuard

[![npm version](https://img.shields.io/npm/v/@denial-web/clawguard.svg)](https://www.npmjs.com/package/@denial-web/clawguard)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**ClawGuard is the policy and safety gate for OpenClaw-style skills, ClawHub installs, MCP configs, dependencies, and agent tools.** It answers one question before you trust a skill:

> What could this skill do if I trusted it?

ClawGuard sits between a candidate skill and your trusted skill folder. Search and discovery stay native to OpenClaw, ClawHub, Hermes Agent, or any other runtime; ClawGuard is the gate before install.

```text
native search/discovery
        ↓
candidate skill bundle
        ↓
ClawGuard policy gate
        ↓
allow / approval request / block
        ↓
trusted skill folder
```

> **ClawGuard Core vs ClawGuard Agent.** This README covers ClawGuard Core (scanner, gate, installer, monitor, GitHub Action). ClawGuard also includes an optional governed agent runtime — see [docs/AGENT.md](docs/AGENT.md). Either can be used without the other.

This project is compatible with OpenClaw-style workflows, but it is not affiliated with OpenClaw or Hermes Agent.

## Quick Start

Test the published package from a folder outside this repository:

```bash
mkdir -p ~/clawguard-test
cd ~/clawguard-test

npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard init --profile local-first
npx --yes --package @denial-web/clawguard@beta clawguard demo quickstart
npx --yes --package @denial-web/clawguard@beta clawguard scan /path/to/skill --config ./.clawguard.json
```

When working inside this source checkout, use local commands instead:

```bash
node src/cli.js --version
node src/cli.js scan examples/risky-skill
```

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

The wrapper downloads into `.clawguard/quarantine/<run-id>/`, never executes any code, rejects symlinks and path-traversal entries, validates redirects against private/loopback hosts, and only copies into the trusted destination once `check` returns `allow`. On `manual_review` it writes a `clawguard.approval.v1` record and retains the quarantine; finish later with `clawguard install --resume <approval-id>`. v1.0 supports `.tar.gz` / `.tgz` only; `.zip` and `clawhub:` URLs exit 3 with a clear deferral message. See [docs/INSTALL_WRAPPER_SPEC.md](docs/INSTALL_WRAPPER_SPEC.md) and [schemas/clawguard-install.schema.json](schemas/clawguard-install.schema.json).

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

Run the local web demo:

```bash
npm run web
```

Open `http://127.0.0.1:4173`. The demo supports pasted `SKILL.md` content, local folder scanning, and HTML report download. See [docs/WEB_DEMO.md](docs/WEB_DEMO.md).

## What It Checks

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

Starter profiles are documented in [docs/CONFIG_TEMPLATES.md](docs/CONFIG_TEMPLATES.md). Stable rule IDs and suppression guidance are in [docs/RULES.md](docs/RULES.md). The risk and governance decision model is in [docs/POLICY_MODEL.md](docs/POLICY_MODEL.md).

## GitHub Action

```yaml
- uses: denial-web/clawguard@v1
  with:
    target: skills
    policy: governed
    fail-on-policy: "true"
    sarif: clawguard.sarif
```

Upload SARIF with `github/codeql-action/upload-sarif@v3`. Full workflow examples are in [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md).

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

JSON output for automation: `--json`. SARIF for GitHub code scanning: `--sarif clawguard.sarif`. HTML for human review: `--html clawguard.html`.

## Approval Workflow

ClawGuard can write approval requests for OpenClaw, Hermes, Telegram, WhatsApp, or any owner channel before files reach a trusted folder. The full local approval loop runs without external credentials:

```bash
npx --package @denial-web/clawguard clawguard approvals demo-flow --keep
```

See [docs/AGENT_MESSAGING_SETUP.md](docs/AGENT_MESSAGING_SETUP.md) for Telegram, WhatsApp, and agent-native messaging.

## Security Model

ClawGuard is a static scanner. It reads skill files and reports risky patterns; it does not execute skill code, install dependencies, or contact external services.

Good defaults:

- No runtime dependencies in the core scan path
- Skips symbolic links
- Skips files larger than 1 MB by default
- Supports JSON, SARIF, and HTML output for automation and review
- Uses explainable rules instead of hidden scoring

Limits:

- Static analysis can miss novel or heavily obfuscated attacks.
- Findings are risk signals, not proof of malicious intent.
- A clean result does not guarantee a skill is safe.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the current threat model.

## Going Further

Optional surfaces, each documented separately:

- [docs/AGENT.md](docs/AGENT.md) — ClawGuard Agent, the optional governed AI agent runtime built on ClawGuard.
- [docs/PORTABLE_AGENT_SETUP.md](docs/PORTABLE_AGENT_SETUP.md) — prepare a ClawGuard workspace for OpenClaw, Hermes, or PicoClaw on another PC.
- [docs/SOP_PACKS.md](docs/SOP_PACKS.md) — SOP packs for small-business and financial-services workflows.
- [docs/FINANCIAL_AI_GOVERNOR.md](docs/FINANCIAL_AI_GOVERNOR.md) — early financial-services AI governor (read/draft/recommend track).
- [docs/PHYSICAL_DEVICE_AI_GOVERNOR.md](docs/PHYSICAL_DEVICE_AI_GOVERNOR.md) — planning track for camera, drone, robot, IoT, and OT actions.
- [docs/CURSOR_USB_HANDOFF.md](docs/CURSOR_USB_HANDOFF.md) — offline USB handoff kit for teammates.
- [docs/MOBILE_APPROVAL_HANDOFF.md](docs/MOBILE_APPROVAL_HANDOFF.md) — Android/iOS approval handoff kit.
- [docs/HUGGINGFACE.md](docs/HUGGINGFACE.md) — publish a safe demo Space.

Engineering and integration references:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — product and module architecture.
- [docs/INTEGRATION_SPEC.md](docs/INTEGRATION_SPEC.md) — OpenClaw, ClawHub, GitHub Action, web, and MCP integration plans.
- [docs/REPORT_SCHEMA.md](docs/REPORT_SCHEMA.md) — versioned JSON output contract.
- [docs/STRATEGIC_REVIEW.md](docs/STRATEGIC_REVIEW.md) — positioning, competitive landscape, and the Core vs Agent split.
- [docs/COMPARISON.md](docs/COMPARISON.md) — ClawGuard vs the other six "ClawGuard" projects on GitHub.
- [docs/INSTALL_WRAPPER_SPEC.md](docs/INSTALL_WRAPPER_SPEC.md) — `clawguard install <url>` quarantine and approval flow (spec).
- [docs/PROJECT_REVIEW.md](docs/PROJECT_REVIEW.md) — current hardening and launch priorities.

## Positioning

ClawGuard is a companion project, not a fork or replacement. The goal is to make OpenClaw-style ecosystems safer by giving users a fast, explainable review before installing third-party skills.

## License

MIT
