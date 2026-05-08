# ClawShield Project Review

This review is focused on making ClawShield strong, secure, and credible as a public companion tool for OpenClaw-style skills and MCP configs.

## What Is Already Strong

- The project has a sharp purpose: scan skills before users trust them.
- The first product surface is small and useful: `clawshield scan <path>`.
- The scanner is static-only. It does not execute untrusted skill code.
- The scanner has no runtime dependencies, which reduces supply-chain risk.
- Findings are explainable: rule ID, severity, file, line, evidence, and recommendation.
- The CLI supports JSON output, so it can become a GitHub Action or CI gate.
- The README uses the right positioning: companion project, not OpenClaw replacement.
- The repo includes safe and risky example skills for demos and tests.

## Most Important Security Properties

- Never execute scanned files.
- Never install dependencies from scanned projects.
- Avoid following symlinks into unexpected paths.
- Bound file size and work per scan.
- Keep every finding explainable.
- Prefer clear false positives over silent false negatives, but keep noisy rules under control.
- Make CI behavior configurable with a fail threshold.

## Improvements Already Added

- File-size guard with a 1 MB default limit.
- Symlink skipping.
- Unreadable file reporting instead of whole-scan failure.
- Multiple findings per rule while avoiding overlapping duplicate evidence.
- `--fail-on` CLI threshold for CI usage.
- `--max-file-size` CLI option.
- More rules for install lifecycle scripts, obfuscated execution, and data exfiltration.
- OpenClaw `SKILL.md` frontmatter parsing.
- First metadata mismatch checks for undeclared env vars, binaries, config paths, network access, and install behavior.
- `.clawshield.json` policy/config support.
- Policy decisions for personal, governed, and enterprise presets.
- Suppressions with required reasons and critical-finding guardrails.
- SARIF reporter for GitHub code scanning.
- Composite GitHub Action metadata.
- MCP/plugin config scanning for `.cursor/mcp.json`, `.openclaw/mcp.json`, `.openclaw/plugins.json`, and `mcp.json`.
- MCP/plugin findings for runtime package commands, unpinned packages, secret env injection, broad filesystem access, shell execution, remote URLs, and write-capable tools.
- Versioned JSON report schema.
- Rule metadata catalog with stable rule IDs.
- Self-contained HTML report generation.
- OpenClaw workspace skill precedence scanning for `skills/` and `.agents/skills/`.
- ClawHub lockfile and per-skill origin metadata scanning.
- ClawHub version drift, source drift, missing origin, missing lockfile, invalid metadata, and unusual source rules.
- Dependency manifest and lockfile scanning for npm and Python skill bundles.
- Dependency findings for install scripts, missing lockfiles, unpinned specs, direct sources, suspicious names, and invalid manifests.
- CI workflow with read-only GitHub token permissions.
- Lockfile for deterministic npm metadata.
- Threat model documentation.

## Highest-Value Next Features

1. GitHub Action Hardening

   Add end-to-end workflow examples, upload SARIF in this repo's own CI, and test the action from a clean checkout.

2. Real Fixture Corpus

   Add many safe and risky fixtures so rule quality improves without guessing.

3. SARIF Report

   Generate GitHub code scanning output for pull request annotations.

4. HTML Report Polish

   Add visual screenshots, print styling, and optional report branding once the demo flow is ready.

5. Web Demo

   Build "paste SKILL.md -> get risk score" first. Folder upload can come later.

6. Rule Metadata Refinement

   Add confidence, CWE-style tags where useful, and richer examples for each rule.

## Product Direction

The best version of ClawShield is not a giant framework. It is a trusted review layer:

- Fast local CLI
- CI gate
- GitHub Action
- Web demo
- Security checklist
- OpenClaw ecosystem docs and examples

The strongest identity is:

> The simple security scanner developers run before trusting an agent skill.

## Launch Bar

Before public launch, ClawShield should have:

- At least 20 tests
- At least 20 fixtures
- A demo GIF
- A GitHub Action example
- A threat model
- A short limitations section
- A clear non-affiliation statement
- A security reporting policy
