# ClawGuard v0.1.23

This release adds a portable setup flow for using ClawGuard with OpenClaw, Hermes Agent, and PicoClaw on another PC.

## Added

- `clawguard setup --framework openclaw|hermes|picoclaw` to create a local guarded workspace.
- Generated `CLAWGUARD_SETUP.md` handoff instructions with copy-paste commands for the selected framework.
- `.clawguard/framework.json` metadata for the prepared runtime, paths, and recommended commands.
- PicoClaw support in guarded install commands, approval doctor output, and setup docs.
- Portable agent setup guide at `docs/PORTABLE_AGENT_SETUP.md`.

## Fixed

- Test isolation for commands that should ignore the repository-level default `.clawguard.json`.
- Safer placeholder text for Telegram setup commands so users do not paste shell redirection characters by accident.

## Verify

```sh
npm test
npx --yes --package @denial-web/clawguard@0.1.23 clawguard setup --framework openclaw
npx --yes --package @denial-web/clawguard@0.1.23 clawguard setup --framework hermes
npx --yes --package @denial-web/clawguard@0.1.23 clawguard setup --framework picoclaw
```
