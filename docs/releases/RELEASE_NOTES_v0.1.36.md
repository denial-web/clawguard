# ClawGuard v0.1.36

This release adds a mobile approval handoff kit for Android and iOS approvers.

## Added

- Added `npm run handoff:mobile`.
- Generates `dist/clawguard-mobile-kit-v0.1.36/`.
- Generates `dist/clawguard-mobile-kit-v0.1.36.tar.gz`.
- Includes `MOBILE_APPROVAL_HANDOFF.md` with Android/iOS app-control limits and safe approval paths.
- Includes `MOBILE_SETUP_PROMPT.md` for Cursor-guided mobile setup.
- Includes an offline npm package tarball, messaging docs, model-path guide, examples, configs, and test checklist.

## Important

ClawGuard mobile support means mobile approval, not arbitrary mobile app control. Real Android/iOS app control must use supported app APIs, Android intents/app links, iOS App Intents/Shortcuts/URL schemes, universal links, MDM, or an approved enterprise integration.

## Try It

```bash
npm run handoff:mobile
```

Then copy either of these to a USB drive or shared folder:

```text
dist/clawguard-mobile-kit-v0.1.36/
dist/clawguard-mobile-kit-v0.1.36.tar.gz
```

