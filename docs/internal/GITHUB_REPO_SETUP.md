# GitHub Repository Setup

Use this when publishing the ClawGuard repository.

## Repository Identity

Description:

```text
Governance and security scanner for OpenClaw skills, ClawHub installs, MCP configs, and skill dependencies.
```

Topics:

```text
openclaw, clawhub, mcp, security, ai-agents, scanner, governance, supply-chain
```

Short positioning:

```text
ClawGuard is an independent companion security layer for OpenClaw-style skills and MCP tool configs. It scans locally, explains risk, and helps teams decide whether to allow, review, sandbox, or block a skill before trusting it.
```

## Recommended Settings

- Make the license visible from the repository root.
- Keep [SECURITY.md](../SECURITY.md) in the repository root.
- Enable Dependabot alerts for the repository.
- Enable GitHub code scanning if SARIF upload is used.
- Protect `main` once the first stable release exists.
- Require CI before merge after the project is public.
- Add screenshots from [docs/assets](assets) near the top of the README.
- Keep issue templates and the pull request template enabled.

## First Release

Recommended tag:

```text
v0.1.0
```

Release title:

```text
ClawGuard v0.1.0 - local OpenClaw skill and MCP risk scanner
```

Release notes:

```text
Initial public preview of ClawGuard.

- Static scanning for OpenClaw-style SKILL.md files.
- Metadata mismatch checks for declared env vars, tools, config, network, and install behavior.
- MCP/plugin configuration scanning.
- OpenClaw workspace precedence scanning.
- ClawHub lockfile and origin metadata scanning.
- npm and Python dependency manifest scanning.
- CLI, JSON, SARIF, and self-contained HTML reports.
- Local web demo with paste scan, folder scan, built-in examples, JSON copy, and HTML export.
- OpenClaw plugin manifest checks for compatibility metadata, runtime code, missing compiled outputs, and sensitive host capabilities.

ClawGuard is static analysis. Findings are risk signals, not proof of malicious intent or proof of safety.
```

## Launch Post

```text
I am building ClawGuard, a companion governance/security scanner for OpenClaw-style skills, ClawHub installs, MCP configs, and skill dependencies.

It gives a local risk score, policy decision, evidence, and shareable HTML report before you trust a third-party skill.

It is static analysis, so findings are risk signals rather than proof of malicious intent. I would love safe/risky skill fixtures and feedback from people building with OpenClaw-style agents.
```
