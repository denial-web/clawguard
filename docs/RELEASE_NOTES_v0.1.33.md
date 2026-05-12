# ClawGuard v0.1.33

Patch release for the npm CLI entry point.

## Fixed

- Fixed the npm `bin` path so `npx --package @denial-web/clawguard@0.1.33 clawguard ...` links the `clawguard` command correctly.

## Includes

- The v0.1.32 physical device dry-run planner:
  - `clawguard device plan`
  - conservative policy decisions for cameras, drones, robot toys, mobile robots, embedded IoT, and industrial OT
  - `clawguard.deviceSkill.v1` schema
  - tests for blocked drone actions, firmware dual approval, camera recording review, and local observation

## Try It

```bash
npx --yes --package @denial-web/clawguard@0.1.33 clawguard --version
npx --yes --package @denial-web/clawguard@0.1.33 clawguard device plan --device-class drone --action drone-takeoff --task "Take off for outdoor inspection"
npx --yes --package @denial-web/clawguard@0.1.33 clawguard device plan --device-class security-camera --action record-media --data-class video-audio --task "Enable recording on storefront camera"
```
