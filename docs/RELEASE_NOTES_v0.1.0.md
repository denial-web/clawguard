# ClawShield v0.1.0

Initial public preview of ClawShield, an independent local governance and security scanner for OpenClaw-style skills, ClawHub installs, MCP configs, OpenClaw plugin manifests, and skill dependencies.

## Highlights

- Static scanning for OpenClaw-style `SKILL.md` files.
- Metadata mismatch checks for declared env vars, binaries, config files, network access, and install behavior.
- ClawHub `.clawhub/lock.json` and `.clawhub/origin.json` provenance and drift checks.
- OpenClaw workspace precedence checks for duplicate and overriding skills.
- MCP and plugin config scanning for package runner commands, shell execution, broad filesystem access, secret env injection, remote URLs, and write-capable tools.
- First-class `openclaw.plugin.json` scanning for plugin compatibility metadata, runtime code execution, missing compiled outputs, and sensitive host capabilities.
- npm and Python dependency manifest scanning for install scripts, missing lockfiles, unpinned specs, direct sources, and suspicious package names.
- CLI output, JSON reports, SARIF reports, and self-contained HTML reports.
- Local web demo with paste scan, folder scan, built-in examples, JSON copy, and HTML report export.
- GitHub Action metadata for pull request and SARIF workflows.

## Example Commands

```bash
npm test
npm run scan -- examples/risky-skill --fail-on none
npm run scan -- examples/risky-mcp-config --fail-on none
npm run scan -- examples/risky-openclaw-plugin --fail-on none
npm run scan -- examples/dependency-risky-skill --html clawshield.html --fail-on none
npm run web
```

## Security Model

ClawShield is static analysis. It reads files and reports risk signals; it does not execute skill code, install dependencies, run MCP servers, or contact registries.

Findings are not proof that a skill is malicious. A clean result is not proof that a skill is safe. Use ClawShield as a review layer before install, publish, merge, or recommendation.

## Known Limits

- Static analysis can miss obfuscated or novel behavior.
- Rule severity is conservative and should be tuned with real-world fixtures.
- Public skill corpus validation is still limited because a public `openclaw/skills` archive was not available in this environment.
- ClawHub package digest and source verification are planned future work.

## Suggested GitHub Release Text

```text
Initial public preview of ClawShield.

ClawShield is an independent companion security scanner for OpenClaw-style skills, ClawHub installs, MCP configs, OpenClaw plugin manifests, and skill dependencies. It gives a local risk score, policy decision, evidence, and shareable reports before you trust a third-party skill or plugin.

This release includes CLI scans, JSON/SARIF/HTML reports, a local web demo, ClawHub metadata checks, dependency checks, workspace precedence checks, MCP/plugin config checks, and first-class openclaw.plugin.json scanning.

ClawShield is static analysis. Findings are risk signals, not proof of malicious intent or proof of safety.
```
