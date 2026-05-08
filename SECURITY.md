# Security Policy

ClawGuard is a defensive scanner. Please report vulnerabilities privately before opening a public issue.

## Reporting

Open a private security advisory on GitHub, or contact the maintainer directly.

Please include:

- A short description of the issue
- Reproduction steps
- Expected impact
- Any sample skill or config needed to reproduce the issue

## Scope

In scope:

- Scanner bypasses that miss clearly dangerous skill behavior
- False negatives for credential theft, destructive shell commands, or remote execution
- Crashes caused by malformed skill files
- Incorrect JSON output that could break CI usage

Out of scope:

- Requests to scan private third-party repositories without permission
- Social engineering against maintainers or contributors
- Vulnerabilities in external package managers, AI models, or OpenClaw itself

## Disclosure

The goal is coordinated disclosure with a fix or documented mitigation before public discussion.
