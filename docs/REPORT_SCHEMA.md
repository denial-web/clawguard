# JSON Report Schema

ClawGuard JSON output is versioned with `schemaVersion`.

Current schemas:

- Full scan report: `1.0.0` — [schemas/clawguard-report.schema.json](../schemas/clawguard-report.schema.json). Emitted by `clawguard scan --json`.
- Decision projection: `clawguard.check.v1` — [schemas/clawguard-check.schema.json](../schemas/clawguard-check.schema.json). Emitted by `clawguard check --json`. See the "ClawGuard Check Contract" section in [INTEGRATION_SPEC.md](INTEGRATION_SPEC.md).
- Install wrapper payload: `clawguard.install.v1` — [schemas/clawguard-install.schema.json](../schemas/clawguard-install.schema.json). Emitted by `clawguard install <url> --json` and `clawguard install --resume <id> --json`. Spec: [INSTALL_WRAPPER_SPEC.md](INSTALL_WRAPPER_SPEC.md).

This page documents the full scan report. For the smaller decision contract third-party agents should call, see [INTEGRATION_SPEC.md](INTEGRATION_SPEC.md).

## Generate JSON

```bash
npm run scan -- examples/metadata-mismatch-skill --json
```

## Stable Fields

The `1.0.0` report contract includes:

- `schemaVersion`
- `target`
- `score`
- `level`
- `filesScanned`
- `filesSkipped`
- `skippedFiles`
- `findings`
- `suppressedFindings`
- `summary`
- `policy`
- `workspace` when workspace skills are discovered
- `clawhub` when ClawHub lock or origin metadata is discovered
- `dependencies` when dependency manifests or lockfiles are discovered
- `options`
- `configPath` when emitted by the CLI

## Finding Fields

Each finding includes:

- `ruleId`
- `title`
- `severity`
- `recommendation`
- `file`
- `line`
- `evidence`

Suppressed findings include:

- `suppressed: true`
- `suppressionReason`

## ClawHub Fields

When ClawHub metadata is present, the `clawhub` block includes:

- `lockfile`
- `entries`
- `origins`

Each entry contains normalized `name`, `version`, `source`, and `skillDir` fields.

## Dependency Fields

When dependency metadata is present, the `dependencies` block includes:

- `manifests`
- `lockfiles`

Each manifest contains normalized `ecosystem`, `file`, `directory`, `name`, `dependencyCount`, and `scriptCount` fields. Each lockfile contains `file`, `ecosystem`, and `directory`.

## Compatibility Policy

Within schema version `1.0.0`:

- Existing required fields should not be removed.
- Enum values should not be renamed.
- New optional fields may be added.
- New rule IDs may be added, but must be documented in [docs/RULES.md](RULES.md).
- Breaking output changes should increment the schema version.
