# ClawGuard v1.0.0-beta.9 Release Notes

ClawGuard v1.0.0-beta.9 extends the install wrapper beyond HTTPS tarballs: `clawhub:<slug>@<version>` references resolved from `.clawhub/lock.json` (including GitHub `tree/` → codeload normalization) and HTTPS `.zip` archives with the same quarantine, scan, and copy gate as `.tar.gz`. It also ships GitHub Action outputs for `clawguard.check.v1` and several hygiene/doc fixes since beta.8.

## What Changed

### Install wrapper v1.1

- Added `clawhub:<slug>@<version>` install. Reads `.clawhub/lock.json` (override with `--clawhub-lock <path>`), matches name/version, fetches the recorded `source` URL, and emits `source.kind: "clawhub"` in `clawguard.install.v1` JSON. Source: `src/install-url/clawhub.js`, `src/install-url/github.js`.
- Added HTTPS `.zip` extraction (stored + deflate, zero new dependencies) with zip-slip, symlink, and hardlink guards matching tar. Source: `src/install-url/zip.js`.
- Added optional `stripPrefix` for tar/zip when lock sources point at a subpath inside a GitHub repo tarball.
- Extended `schemas/clawguard-install.schema.json` with `source.kind: "clawhub"` and optional `source.clawhub` metadata.

### GitHub Action and CI

- `action.yml` now emits `clawguard.check.v1` JSON and exposes decision/risk/summary as step outputs alongside SARIF. PR #6.
- `action-smoke` workflow asserts schema shape and outputs.

### Docs and scanner hygiene

- Refreshed competitor landscape (~55 public projects), fixed `broad-permissions` false positives on benign “shell” wording, bumped `pages.yml` to checkout/setup-node v5 and Node 24. PR #8.
- Validated high-star competitor READMEs (AquaOne, JaydenBeard, Gk0Wk, SafeAgent-Beihang). PR #9.
- Fixed broken NeuZhou repo links (404 → npm); logged yourclaw outreach. PR #7.

## Still deferred

These still exit `3` with explicit error codes:

- `git+https:`, `npm:`, `oci:` (`unsupported_scheme`)
- `--dry-run` URL mode and `sha512-` integrity (spec v2)

## Useful Commands

```bash
clawguard install clawhub:my-skill@1.0.0 \
  --to ./.agents/skills/my-skill \
  --clawhub-lock ./.clawhub/lock.json \
  --policy governed --json

clawguard install https://example.com/skill.zip \
  --to ./.agents/skills/my-skill \
  --policy governed --json
```

## Validation

```bash
npm test
node --test test/install-url-cli.test.js test/install-url/
```

Expected beta.9 baseline:

- `clawguard install clawhub:…` resolves lock entries and installs on `allow` (exit `0`).
- `clawguard install https://…/skill.zip` extracts and installs on `allow`.
- `clawhub.install.v1` payload may include `source.kind: "clawhub"` and `source.clawhub` metadata.
- 364 tests pass.
