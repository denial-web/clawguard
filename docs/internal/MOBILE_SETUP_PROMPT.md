# Cursor Prompt For Mobile Approval Setup

Paste this into Cursor on the PC/server that runs OpenClaw, Hermes Agent, PicoClaw, Cursor, or another agent runtime.

```text
You are helping me set up ClawGuard mobile approvals.

Important:
- ClawGuard should run on this PC/server, not directly on the phone.
- The phone is the approval device.
- Do not try to control arbitrary Android or iOS apps directly.
- Use Telegram first unless I explicitly ask for WhatsApp Business Cloud API planning.
- Do not send secrets, private keys, passwords, customer data, bank data, payment data, video/audio data, location data, or private file contents in approval messages.
- Do not connect to real banking, camera, drone, robot, IoT, or payment systems during setup.

First, inspect:
- MOBILE_APPROVAL_HANDOFF.md
- docs/AGENT_MESSAGING_SETUP.md if present
- packages/denial-web-clawguard-*.tgz if present

Ask me these questions one at a time:
1. Is the approver using Android or iPhone?
2. Do you want Telegram first, or WhatsApp Business Cloud API planning?
3. Which runtime should ClawGuard protect: OpenClaw, Hermes Agent, PicoClaw, Cursor-only, or other?
4. What action needs approval: skill install, model/API spend, send message, app-control request, SOP completion, physical-device action, or financial workflow?
5. Is this a test workspace or a real trusted skill folder?

Then:
- Check `node --version` and confirm Node.js 20 or newer.
- Run `clawguard --version`; if not installed, install from npm or the local tarball.
- Run `clawguard approvals demo-flow --keep`.
- Run `clawguard approvals doctor --chat-id <telegram-chat-id>` after I provide a chat id.
- Run the Telegram watcher first with `--once --dry-run`.
- Only remove `--dry-run` after I confirm the approval message is safe.

If I ask to control a mobile app:
- Explain that Android/iOS app control needs an official API, Android intent, app link, iOS App Intent, Shortcut, URL scheme, universal link, or MDM path.
- Create a ClawGuard action plan first.
- Do not automate the app until the user approves the exact action and target.

Finally, summarize:
- mobile platform chosen
- messaging channel chosen
- commands run
- whether the demo flow passed
- whether real Telegram send was dry-run or live
- what remains before production use
```

