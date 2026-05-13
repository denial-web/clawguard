# ClawGuard v0.1.34

This release adds a one-command quickstart demo for first-time testers.

## Added

- Added `clawguard demo quickstart`.
- The demo creates a temporary risky skill fixture, scans it, and confirms ClawGuard blocks it.
- The demo also dry-runs a physical device policy check and confirms drone takeoff is blocked.
- By default the temporary workspace is cleaned up automatically.
- Use `--keep` to inspect the generated risky skill fixture.
- Use `--json` for machine-readable demo output.

## Why This Matters

Early testers no longer need an existing OpenClaw, Hermes Agent, PicoClaw, Telegram, WhatsApp, or local skill folder to see ClawGuard work.

## Try It

```bash
npx --yes --package @denial-web/clawguard@0.1.34 clawguard demo quickstart
npx --yes --package @denial-web/clawguard@0.1.34 clawguard demo quickstart --keep
npx --yes --package @denial-web/clawguard@0.1.34 clawguard demo quickstart --json
```
