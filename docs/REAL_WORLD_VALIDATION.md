# Real-World Validation

Last checked: 2026-05-08.

## Sources Checked

- Official ClawHub repository: https://github.com/openclaw/clawhub
- Official ClawHub skill format docs: https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md
- OpenClaw ClawHub docs: https://docs.openclaw.ai/tools/clawhub

The official `openclaw/clawhub` repository was cloned at:

```text
f14d70759dcc14b24890f5a50e1f9ce06f38eacd
```

An attempted shallow clone of `https://github.com/openclaw/skills` returned `Repository not found` from GitHub in this environment, so validation used the current ClawHub source repository, docs, schema code, and a local skill fixture modeled on the current public skill-format docs.

## Compatibility Signals

Current ClawHub docs describe:

- Skill folders with `SKILL.md` or `skill.md`.
- Per-skill install metadata at `<skill>/.clawhub/origin.json`.
- Workspace install state at `<workdir>/.clawhub/lock.json`.
- Runtime declarations under `metadata.openclaw`.
- Alias metadata namespaces: `metadata.clawdbot` and `metadata.clawdis`.
- Required env declarations through `requires.env`, `primaryEnv`, and `envVars`.
- Install specs under `metadata.openclaw.install`.
- Install kinds including `brew`, `node`, `go`, and `uv`.

## Validation Results

ClawShield already covered the main ClawHub surfaces:

- `SKILL.md` and `skill.md` frontmatter parsing.
- `.clawhub/origin.json` and `.clawhub/lock.json` scanning.
- `openclaw.plugin.json` package manifest scanning.
- Lock/origin drift detection.
- Declared env, binary, config, network, and install behavior.
- npm and Python dependency manifest checks.
- MCP and OpenClaw plugin config checks.

This validation added parser support for:

- `metadata.openclaw.envVars` map entries.
- `requiredEnv` declarations used by ClawHub config examples.
- OpenClaw plugin package compatibility fields required by current ClawHub publishing flows.
- TypeScript plugin runtime entries that need matching compiled JavaScript output.

The latest-format validation fixture now scans without undeclared metadata findings. It only reports the expected low external-network signal for the example URL.

## Remaining Real-World Gaps

- Add optional digest/source verification for ClawHub plugin packages when metadata is available.
- Validate against real installed skill folders once a public archive or local ClawHub install is available.
- Add a small corpus of known-safe and known-risky public skills after manual review.
