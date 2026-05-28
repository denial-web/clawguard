# ClawGuard example fixtures

Small skill bundles and configs for local testing. Run from the repo root.

## Scanner / policy (`clawguard scan`, `clawguard check`, `clawguard gate`)

| Path | Command | Expected |
|------|---------|----------|
| `risky-skill/` | `node src/cli.js scan examples/risky-skill` | CRITICAL — harmful / high-risk content |
| `safe-skill/` | `node src/cli.js scan examples/safe-skill` | Low risk |
| `declared-api-skill/` | `node src/cli.js scan examples/declared-api-skill` | Exercises declared API metadata rules |
| `metadata-mismatch-skill/` | `node src/cli.js scan examples/metadata-mismatch-skill` | Metadata mismatch findings |
| `dependency-risky-skill/` | `node src/cli.js scan examples/dependency-risky-skill` | Risky npm dependencies |
| `dependency-safe-skill/` | `node src/cli.js scan examples/dependency-safe-skill` | Clean dependency lockfile |
| `dependency-python-skill/` | `node src/cli.js scan examples/dependency-python-skill` | Python dependency surface |
| `risky-mcp-config/` | `node src/cli.js scan examples/risky-mcp-config` | Risky MCP server config |
| `safe-mcp-config/` | `node src/cli.js scan examples/safe-mcp-config` | Safer MCP config |
| `risky-openclaw-plugin/` | `node src/cli.js scan examples/risky-openclaw-plugin` | Risky OpenClaw plugin manifest |
| `safe-openclaw-plugin/` | `node src/cli.js scan examples/safe-openclaw-plugin` | Safer plugin bundle |

## Workspace / ClawHub

| Path | Command | Expected |
|------|---------|----------|
| `openclaw-workspace/` | `node src/cli.js scan-workspace examples/openclaw-workspace` | Multi-skill workspace scan |
| `clawhub-workspace/` | `node src/cli.js scan examples/clawhub-workspace` | ClawHub lock + origin metadata |
| `clawhub-origin-without-lock/` | `node src/cli.js scan examples/clawhub-origin-without-lock` | Origin without workspace lock |

## Install gate (`clawguard install`)

Use with a local HTTP tarball/zip server (see `test/install-url-cli.test.js`) or:

| Path | Notes |
|------|--------|
| `safe-skill/` | Copy via `clawguard install ./examples/safe-skill --to <trusted> --policy personal` |
| `clawhub-workspace/.clawhub/lock.json` | Reference for `clawhub:weather-helper@…` install tests |

## SOP packs (`clawguard sop-check`)

| Path | Command |
|------|---------|
| `sop-workflows/*-complete.json` | `node src/cli.js sop-check examples/sop-workflows/<file>.json` |
| `sop-workflows/*-incomplete.json` | Same — expect validation failures on incomplete packs |

See [docs/SOP_PACKS.md](../docs/SOP_PACKS.md) for workflow semantics.
