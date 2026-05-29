# ClawGuard v1.0.0-beta.8 Release Notes

ClawGuard v1.0.0-beta.8 adds two cross-tool integration surfaces that the agent runtime did not expose before: `clawguard check` as a stable JSON decision contract any external agent can consume, and `clawguard install <url>` as the install-time policy gate for HTTPS tarballs with quarantine, approval, and resume. Both surfaces are formalized as JSON Schemas hosted on GitHub Pages so other tools can wire to a fixed `$id`.

## What Changed

- Added `clawguard check <path>` cross-tool decision command. Emits a stable `clawguard.check.v1` JSON projection (`decision`, `risk`, `summary`, `recommendedAction`, `policyPreset`, `findingSummary`, `findings`, `requiredActions`, `scanReportPath`) with exit codes that match `clawguard gate`. Source: `src/check.js`. Schema: `schemas/clawguard-check.schema.json`. Contract: `docs/INTEGRATION_SPEC.md`.
- Added `clawguard install <url>` URL-aware install wrapper for HTTPS `.tar.gz` and `.tgz` archives. Streams the archive into a per-run ULID quarantine, runs the existing scan + policy gate, writes a JSONL approval record on `manual_review`, and copies the verified bundle into the trusted folder on `allow`. Source: `src/install-url/`. Spec: `docs/INSTALL_WRAPPER_SPEC.md`. Schema: `schemas/clawguard-install.schema.json`.
- Added `clawguard install --resume <approval-id>` to finish a `manual_review` install after the owner has decided. Reads the retained quarantine, copies on `approve`, deletes on `deny`.
- Added `clawguard.install.v1` JSON Schema and a GitHub Pages workflow that publishes both schemas at fixed `$id` URLs: `https://denial-web.github.io/clawguard/schemas/clawguard-check.schema.json` and `https://denial-web.github.io/clawguard/schemas/clawguard-install.schema.json`. Workflow: `.github/workflows/pages.yml`. Builder: `scripts/build-pages.js`.
- Deduplicated the private-host / loopback filter into `src/install-url/host.js`; `src/agent/tools.js` web fetch and the new install fetch now share the same allowlist.
- Wrapped zlib and tar parse errors in `extractTarGz` so non-tarball or corrupt-gzip responses exit `3` with `error.code = invalid_archive` instead of a generic `exit 1`. Covered by `test/install-url-cli.test.js`.
- Scanner-first `README.md` trim (761 -> 244 lines). ClawGuard Agent material moved to a dedicated anchor at `docs/AGENT.md`.
- Added `docs/COMPARISON.md`, `docs/STRATEGIC_REVIEW.md`, `docs/PLUGIN_ID.md`, and `docs/OUTREACH.md` covering the six-project "ClawGuard" namespace honestly, recording the plugin-id non-collision constraint, and drafting compose-pattern outreach to `superglue-ai/clawguardian` and `lombax85/clawguard`.
- Added a Compose Patterns section and an Available Contracts table to `docs/INTEGRATION_SPEC.md`. Refreshed `docs/REAL_WORLD_VALIDATION.md` with a competitor-landscape survey.

## Safety Boundary

The URL install wrapper holds these properties:

- Never executes downloaded code. No `npm install`, `pip install`, postinstall scripts, or bundle binaries.
- Drops symlinks and hardlinks during extraction; they are recorded as skipped, never created on disk.
- Rejects path traversal. Any archive entry that normalizes outside `extracted/` causes `decision: block`.
- Bounded download. Streaming fetch terminates at `--max-bytes` (default 50 MB) and exits `3`.
- Validates redirects. No redirect to loopback, RFC 1918, link-local, or non-`https` destinations.
- Integrity gate. If `--integrity sha256-<base64>` or `sha256:<hex>` is supplied and the streamed digest does not match, the wrapper exits `3` before extraction.
- Destination collision. The trusted destination must be empty or non-existent; the wrapper never overwrites an existing skill folder.
- Quarantine retention is deterministic. Deleted on `block` and on fetch failure; retained on `manual_review` until decided; deleted on `allow` after copy.

## Deferred from v1.0

These exit `3` with explicit error codes; tracked for v1.1:

- Zip archives (`unsupported_archive`). Needs a vetted zero-dep zip reader or a deliberate dependency decision.
- `clawhub:` URLs (`unsupported_scheme`). Needs ClawHub origin metadata resolution.
- `git+https:`, `npm:`, `oci:` (`unsupported_scheme`). Already deferred in the spec.
- `--dry-run` URL mode and `sha512-` integrity.

## Useful Commands

```bash
clawguard check ./candidate-skill --policy governed --json
clawguard check ./candidate-skill --write-report ./scan-report.json

clawguard install https://example.com/skill.tar.gz \
  --to ./.agents/skills/my-skill \
  --policy governed \
  --integrity sha256:abcdef0123456789... \
  --max-bytes 50mb --timeout 30000 --json

clawguard install --resume appr_01JZQX... --to ./.agents/skills/my-skill \
  --decision approve --json
```

## Validation

Run the focused and full checks:

```bash
npm test
node --check src/cli.js
NPM_CONFIG_CACHE=/tmp/clawguard-npm-cache npm pack --dry-run
node --test test/check.test.js test/check-cli.test.js
node --test test/install-url-cli.test.js test/install-url/
```

Expected beta.8 baseline:

- `clawguard check` emits `schemaVersion: clawguard.check.v1` with the exit code mapped from the decision.
- `clawguard install <https url> --integrity sha256:<hex>` either installs (exit `0`), writes a `manual_review` approval (exit `1`), blocks and deletes quarantine (exit `2`), or exits `3` with one of `unsupported_scheme`, `unsupported_archive`, `blocked_host`, `redirect_non_https`, `integrity_mismatch`, `max_bytes_exceeded`, `fetch_timeout`, `fetch_network_error`, `invalid_archive`.
- `clawguard install --resume <id>` completes the copy on `approve` and removes the quarantine on `deny`.
- Both schemas resolve at their published `$id` URLs and the index page at `https://denial-web.github.io/clawguard/` lists them.
- 352 tests pass.
