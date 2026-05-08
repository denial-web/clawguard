# ClawShield Threat Model

ClawShield is designed to reduce risk before a user enables an OpenClaw-style skill or MCP tool config.

## Assets

- Local files and source code
- Shell access
- Credentials and API tokens
- Browser, email, calendar, Slack, GitHub, and other connected tools
- User trust in the skill ecosystem

## Threats

- Remote code execution through install instructions or shell snippets
- Credential theft through direct file reads or environment variable access
- Data exfiltration through HTTP uploads, webhooks, `scp`, `rsync`, or raw sockets
- Prompt injection hidden inside `SKILL.md` instructions
- Package install lifecycle scripts that execute during dependency installation
- Destructive shell commands
- Overbroad tool permissions that allow unintended write or delete actions
- Obfuscated payloads using Base64, encoded PowerShell, `eval`, or dynamic runtime flags

## Current Controls

- Static scanning only; ClawShield does not execute untrusted skill code.
- No runtime dependencies in the scanner.
- Symbolic links are skipped to avoid scanning unexpected external paths.
- Files larger than 1 MB are skipped by default to reduce denial-of-service risk.
- Findings include rule ID, severity, file, line, evidence, and recommendation.
- CLI supports `--fail-on` for CI policy enforcement.
- CLI supports `--json` for automated review.

## Non-Goals

- Proving that a skill is safe
- Replacing sandboxing
- Replacing manual review for high-risk skills
- Detecting every possible malware technique
- Scanning remote repositories directly
- Authenticating skill authors

## Security Principles

- Treat third-party skills as untrusted input.
- Prefer least-privilege permissions.
- Require approval for write actions and shell execution.
- Review install scripts before running package managers.
- Run unknown skills in a sandbox or disposable environment.
- Make scanner findings explainable and easy to challenge.
