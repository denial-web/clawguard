# ClawGuard v0.1.35

This release adds a USB and Cursor handoff kit for team testing.

## Added

- Added `npm run handoff:usb`.
- Generates `dist/clawguard-usb-kit-v0.1.35/`.
- Generates `dist/clawguard-usb-kit-v0.1.35.tar.gz`.
- Includes an offline npm package tarball.
- Includes a Cursor setup prompt for guided installation.
- Includes a model path decision tree for local-first, cloud/API, financial-sensitive, and physical-device safety paths.
- Includes a team checklist for first-run testing.
- Copies examples, configs, selected docs, and demo assets into the kit.

## Try It

```bash
npm run handoff:usb
```

Then copy either of these to a USB drive:

```text
dist/clawguard-usb-kit-v0.1.35/
dist/clawguard-usb-kit-v0.1.35.tar.gz
```
