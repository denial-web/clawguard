# ClawGuard v1.0.0-beta.6 Release Notes

ClawGuard v1.0.0-beta.6 adds Blast Radius Explain: a deterministic, read-only explanation surface that tells users what a shell command, file operation, or agent proposal could damage before anything runs.

## What Changed

- Added `src/agent/blast-radius.js` with schema `clawguard.blastRadiusExplain.v1`.
- Added top-level CLI:
  - `clawguard explain -- psql -c "DROP DATABASE prod"`
  - `clawguard explain --argv-json '["psql","-c","SELECT 1, 2"]'`
  - `clawguard explain --path data/prod.sqlite --operation write`
  - `clawguard explain --proposal ./proposal.json`
- Enhanced `clawguard agent proposal explain ./proposal.json` with a nested blast-radius assessment.
- Reused protected asset matching and destructive shell detection for database, file, remote/system deletion, inline interpreter, and evasive shell forms.
- Added deterministic safer alternatives for risky database, file, cleanup, browser/app, GitHub, and memory proposal paths.
- Added `explain.created` audit events when `clawguard explain` runs inside an initialized agent workspace.
- Added `blast_radius` safety eval coverage.

## Safety Boundary

Blast Radius Explain is read-only. It does not execute commands, mutate files, call a model, browse the web, or start Data Broker / multi-component mode. Human-readable output is a renderer over the stable JSON decision object.

The explanation output includes raw command text and paths. Treat JSON or copied output with the same care as shell history if the command contains credentials or private paths.

## Known Limitations

Blast Radius Explain is a deterministic preflight. It does not yet:

- Resolve symlinks before checking workspace boundaries.
- Detect Unicode-lookalike command spoofing.
- Cover every container, cloud-CLI, package-publish, process-control, privilege-bit, or infrastructure-destroy verb.
- Fully parse comma-containing values passed through the simple `--argv` CSV shorthand; use `--` to pass raw argv or `--argv-json` for non-trivial commands.

For high-stakes environments, treat explain as advisory and pair it with protected-asset enforcement, approvals, backups, and audit.

## Validation

Run the focused and full checks:

```bash
node --check src/cli.js
node --check src/agent/*.js
node --check src/agent/professional-worker/*.js
node --test test/blast-radius.test.js
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```

Expected beta.6 baseline:

- Blast Radius Explain reports destructive database commands as `approval_required`, `critical`, and `unknown_high`.
- Protected file writes show protected asset matches.
- Safe read-only commands remain low-risk `allow`.
- Ambiguous/evasive shell commands block or escalate.
- Proposal explain includes blast-radius fields.
- Existing agent safety evals remain green.
