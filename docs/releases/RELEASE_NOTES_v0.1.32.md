# ClawGuard v0.1.32

This release adds the first dry-run **Physical Device AI Governor** CLI.

## Added

- Added `clawguard device plan`.
- Added physical device action classification for:
  - security cameras
  - drones
  - talking robot toys
  - mobile robots
  - embedded IoT devices
  - industrial/OT-adjacent devices
- Added default dry-run decisions:
  - allow observation, local analysis, planning, and recommendations
  - manual review for recording, PTZ, robot speech/display, and ground robot motion
  - dual approval for firmware updates and sensitive external sends
  - block drone arm/takeoff/offboard-style control, safety bypass, and harmful behavior
- Added `schemas/clawguard-device-skill.schema.json` for future device-control skill manifests.
- Added tests for device policy decisions, CLI exit codes, and schema validity.

## Try It

```bash
npx --yes --package @denial-web/clawguard@0.1.32 clawguard device plan --device-class drone --action drone-takeoff --task "Take off for outdoor inspection"
npx --yes --package @denial-web/clawguard@0.1.32 clawguard device plan --device-class security-camera --action record-media --data-class video-audio --task "Enable recording on storefront camera"
npx --yes --package @denial-web/clawguard@0.1.32 clawguard device plan --device-class embedded-iot --action firmware-update --data-class firmware --task "Flash new firmware to an ESP32 relay controller"
```

## Safety Posture

This release does not control real hardware. It only classifies proposed physical-device actions, returns allow/review/dual-approval/block decisions, and lists required safety evidence.
