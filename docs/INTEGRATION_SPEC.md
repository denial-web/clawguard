# Integration Spec

This spec defines how ClawGuard should work with OpenClaw, ClawHub, GitHub, web demos, and MCP without replacing any of them.

## Integration Principles

- Stay independent and compatible.
- Prefer read-only scanning.
- Run before trust is granted.
- Use OpenClaw and ClawHub metadata when available.
- Verify declarations against local file behavior.
- Make output easy to paste into issues, PRs, and docs.

## OpenClaw Integration

### Guarded Install With Owner Approval

Current wrapper pattern:

```bash
clawguard openclaw install ./candidate-skill \
  --to ./.agents/skills \
  --approval-out ./.clawguard/approvals.jsonl
```

This does not block OpenClaw or ClawHub discovery. Search and candidate selection can stay native. ClawGuard sits between the downloaded candidate and the trusted skill folder:

```text
native search/discovery
        ↓
candidate skill bundle
        ↓
clawguard openclaw install
        ↓
allow / approval request / block
        ↓
trusted skill folder
```

If `--approval-out` is set, non-allow decisions create a pending approval JSON payload instead of copying files. With `--approval-mode always`, even allow decisions pause for explicit owner approval. A messaging adapter can forward the `message` field to WhatsApp, Telegram, Slack, Discord, or another owner channel.

### Approval Message Delivery

Option A uses OpenClaw's native messaging command after OpenClaw is already configured by the user:

```bash
clawguard approvals send ./.clawguard/approvals.jsonl \
  --via openclaw \
  --channel telegram \
  --target 123456789
```

The adapter calls:

```bash
openclaw message send --channel telegram --target 123456789 --message "<approval message>"
```

This is the easiest path for OpenClaw users because ClawGuard does not need to own Telegram, WhatsApp, Slack, or Discord credentials.

Option B is a ClawGuard-owned Telegram sender:

```bash
TELEGRAM_BOT_TOKEN=123456:token clawguard approvals send ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id 123456789
```

That path is better when the user wants the approval channel to stay independent from the agent runtime. Use `--dry-run` first to verify the redacted endpoint and message payload before sending.

For long-running installs, ClawGuard can watch the approval queue and forward each new pending request once:

```bash
TELEGRAM_BOT_TOKEN=123456:token clawguard approvals watch ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id 123456789
```

The watcher keeps search and discovery unrestricted. It only reacts after a guarded install writes a pending approval request. By default it records sent ids in `./.clawguard/approvals.jsonl.sent.json`, so restarting the bridge does not resend the same request. Use `--once --dry-run` for setup checks and CI smoke tests.

### Skill Folder Scan

Command:

```bash
clawguard scan-skill ./skills/my-skill
```

Behavior:

- Locate `SKILL.md` or `skill.md`.
- Parse frontmatter.
- Scan supporting files.
- Detect declared versus observed mismatch.
- Produce risk score and policy decision.

### Workspace Scan

Command:

```bash
clawguard scan-workspace ~/.openclaw/workspace
```

Behavior:

- Scan `<workspace>/skills`.
- Scan `<workspace>/.agents/skills` if present.
- Report duplicate skill names.
- Report effective winning skills by precedence.
- Report project-level skill risk.
- Detect `.clawhub/lock.json` when present.

Later:

- Optionally inspect `~/.openclaw/skills` when explicitly requested.
- Optionally inspect `~/.agents/skills` when explicitly requested.
- Read OpenClaw config to understand agent skill allowlists.

### Plugin-Aware Skill Scan

Plugins can ship skills. ClawGuard should eventually parse plugin manifests and inspect bundled skill folders before the plugin is enabled.

Checks:

- Plugin-declared skills.
- Plugin capabilities.
- Install scripts or setup commands.
- Compatibility metadata.
- Required environment variables.
- Tool surface exposed by the plugin.

## ClawHub Integration

### Pre-Install Gate

Target command pattern:

```bash
clawguard clawhub inspect <slug>
clawguard clawhub install --gate <slug>
```

Behavior:

- Fetch or receive a skill bundle.
- Scan before writing into the active workspace.
- Show policy decision.
- Continue only when policy allows or the operator approves.

Network fetching should be opt-in. The first implementation can scan bundles already downloaded by `clawhub inspect` or native OpenClaw commands.

### Post-Install Audit

Command:

```bash
clawguard scan ./skills
```

Behavior:

- Scan installed skills.
- Read `.clawhub/lock.json` if present.
- Read per-skill `.clawhub/origin.json` if present.
- Detect local drift from registry metadata when enough information exists.

Current implementation:

- Normalizes lockfile entries from `skills` or `packages` arrays and objects.
- Normalizes origin metadata from per-skill `.clawhub/origin.json` files.
- Reports missing lockfile, missing origin metadata, version drift, source drift, invalid metadata, and unusual source URLs.
- Adds a `clawhub` summary to JSON and HTML reports.

## Hermes Agent Integration

Current wrapper pattern:

```bash
clawguard hermes install ./candidate-skill \
  --to ~/.hermes/skills \
  --approval-out ./.clawguard/approvals.jsonl
```

The first integration target is the same as OpenClaw: do not interfere with search or discovery. Scan the candidate before it is copied into a trusted Hermes skill directory, and emit an approval request when policy says the owner should decide.

ClawGuard is independent and not affiliated with Hermes Agent or Nous Research.

### Metadata Comparison

ClawGuard should compare:

- Declared `requires.env` versus observed env var usage.
- Declared `primaryEnv` and `envVars` versus observed credential usage.
- Declared `requires.bins` or `requires.anyBins` versus observed shell commands.
- Declared `requires.config` versus observed config reads.
- Declared `install` specs versus package files and setup instructions.
- Declared homepage/source versus remote URLs used by the skill.

## MCP and Tool Config Integration

Initial config paths:

- `.openclaw/plugins.json`
- `.openclaw/mcp.json`
- `.cursor/mcp.json`
- `mcp.json`
- Common project-local MCP config files discovered later.

Checks:

- Unknown command sources.
- Broad filesystem access.
- Environment variable injection.
- Tools that can send messages, browse, write files, run shell, control gateway, or call external APIs.
- Unpinned package specs.
- Install commands.
- Remote endpoints.

Current implementation:

- Scans `.openclaw/plugins.json`, `.openclaw/mcp.json`, `.cursor/mcp.json`, and `mcp.json`.
- Reports runtime package commands, unpinned packages, shell execution, secret env injection, broad filesystem access, remote URLs, and write-capable external tools.

Command:

```bash
clawguard scan-mcp .cursor/mcp.json
```

## GitHub Action

Use cases:

- Scan pull requests adding or changing skills.
- Scan `SKILL.md` metadata before publishing to ClawHub.
- Upload SARIF to GitHub code scanning.
- Fail PRs based on policy preset.

Example:

```yaml
name: ClawGuard

on:
  pull_request:

permissions:
  contents: read
  security-events: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denial-web/clawguard@v1
        with:
          target: skills
          policy: governed
          sarif: clawguard.sarif
```

## Web Demo

First demo:

- Paste `SKILL.md`.
- Click scan.
- Show risk score.
- Show findings with line evidence.
- Show safer action.

Second demo:

- Upload a skill folder as zip.
- Scan files in browser where possible.
- Keep uploads local-only if feasible.

The web demo should be visual and shareable, but the security model must be clear: static analysis helps review risk, it does not prove safety.

## MCP Server

Optional later server:

Tools:

- `scan_skill`
- `scan_directory`
- `scan_mcp_config`
- `explain_finding`
- `policy_decision`

Rules:

- Read-only by default.
- No remote fetching unless explicitly enabled.
- No command execution.
- Return structured results.
- Keep evidence bounded.

## Output Compatibility

All integrations should use one shared core report schema. Surfaces can format differently, but the underlying result should be stable.

Required report fields:

- `target`
- `targetKind`
- `source`
- `score`
- `level`
- `decision`
- `findings`
- `filesScanned`
- `filesSkipped`
- `scanOptions`
- `limitations`

## First Integration Sequence

1. `SKILL.md` frontmatter parser.
2. Metadata mismatch checks.
3. Workspace scan with duplicate/effective skill reporting.
4. JSON schema for reports.
5. GitHub Action wrapper.
6. SARIF reporter.
7. Web paste demo.
8. MCP config parser.
9. ClawHub origin/lockfile parser.
10. Dependency and package lock scanner.
11. Optional ClawHub pre-install wrapper.
