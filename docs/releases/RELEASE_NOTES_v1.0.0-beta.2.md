# ClawGuard v1.0.0-beta.2 Release Notes

ClawGuard v1.0.0-beta.2 adds a local setup UI for first-time users.

## Highlights

- Added `clawguard setup-ui` to launch a localhost setup wizard.
- Added guided setup preview/apply APIs for `.clawguard.json`, agent state folders, protected asset defaults, and next commands.
- Kept normal `npm run web` read-mostly: setup writes are disabled unless launched through `clawguard setup-ui`.
- Added `--preview-only` for users who want command/config guidance without local writes.
- Added setup UI checks for destructive database commands such as `DROP DATABASE`.
- Added tests for setup state, preview, apply gating, confirmation, protected assets, and workspace escape rejection.

## Try It

```bash
npx --yes --package @denial-web/clawguard@beta clawguard setup-ui
```

Preview only:

```bash
npx --yes --package @denial-web/clawguard@beta clawguard setup-ui --preview-only
```

## Safety Boundary

The setup UI binds to `127.0.0.1`. It does not collect secrets, API keys, or tokens. Guided apply requires explicit confirmation and writes only local ClawGuard config/state in the selected workspace.
