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

ClawGuard already covered the main ClawHub surfaces:

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

## Third-Party Package Compatibility Test

ClawGuard can scan any public npm package that unpacks to an OpenClaw plugin or skill. Keep the package configurable so this example remains a repeatable compatibility test, not an endorsement of a specific package.

From a ClawGuard source checkout:

```bash
export CLAWGUARD_REPO="$PWD"
export PACKAGE="@xquik/tweetclaw@1.6.31"
WORKDIR="$(mktemp -d /tmp/clawguard-package-scan.XXXXXX)"
cd "$WORKDIR"
npm pack "$PACKAGE"
ARCHIVE="$(find . -maxdepth 1 -name '*.tgz' -print -quit)"
tar -xzf "$ARCHIVE"
node "$CLAWGUARD_REPO/src/cli.js" scan ./package --fail-on none
```

The example `PACKAGE` value points at TweetClaw, a public OpenClaw plugin package with an agent-facing skill, `openclaw.plugin.json`, and npm package metadata. Replace it with any package you want to check. Treat the result as scanner compatibility evidence only. It does not prove the remote package is safe, does not contact ClawHub, and does not mean ClawGuard endorses the package.

## Remaining Real-World Gaps

- Add optional digest/source verification for ClawHub plugin packages when metadata is available.
- Validate against real installed skill folders once a public archive or local ClawHub install is available.
- Add a small corpus of known-safe and known-risky public skills after manual review.
