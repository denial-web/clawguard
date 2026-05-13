# ClawGuard Mobile Approval Handoff

Use this guide when the agent runs on a PC, server, or workstation, but the human approver uses an Android phone or iPhone.

## What Works Today

ClawGuard can request approval on mobile by sending a compact approval message to a supported channel. The durable approval record stays in local ClawGuard files:

```text
agent proposes action
  -> ClawGuard writes approvals.jsonl
  -> Telegram or native runtime bridge sends a phone notification
  -> owner replies approve / deny on mobile
  -> ClawGuard writes decisions.jsonl
  -> ClawGuard applies or blocks the action
```

Recommended first path:

- Run ClawGuard on the machine where OpenClaw, Hermes Agent, PicoClaw, Cursor, or the target automation is installed.
- Use Telegram on Android or iOS for approval messages.
- Use WhatsApp only through an approved WhatsApp Business Cloud API bridge or through an agent runtime that already supports WhatsApp safely.
- Use local decision logs as the source of truth, not screenshots or chat messages alone.

## Important Mobile Limits

ClawGuard is not a native Android or iOS app yet.

It cannot directly control arbitrary mobile apps. Android and iOS both sandbox apps and only allow cross-app control through supported mechanisms:

- Android: intents, app links, accessibility services, device-owner or MDM controls, or the target app's API.
- iOS: App Intents, Shortcuts actions, URL schemes, universal links, MDM controls, or the target app's API.
- WhatsApp, Telegram, banking apps, camera apps, or business apps must expose an official API, bot interface, shortcut, URL scheme, or enterprise management path before ClawGuard can safely ask to control them.

For first release, treat mobile as an approval endpoint, not as the ClawGuard runtime.

## Android Support

Best Android path:

1. Install Telegram on the phone.
2. Create or join the ClawGuard approval chat.
3. Run the ClawGuard watcher on the PC/server:

```bash
export TELEGRAM_BOT_TOKEN="<telegram-bot-token>"
clawguard approvals watch ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id <telegram-chat-id>
```

4. Run the poller on the same PC/server:

```bash
clawguard approvals poll-telegram ./.clawguard/approvals.jsonl \
  --decisions ./.clawguard/decisions.jsonl
```

5. Apply a specific approved action:

```bash
clawguard approvals apply ./.clawguard/approvals.jsonl \
  --id <approval-id> \
  --decisions ./.clawguard/decisions.jsonl
```

Advanced Android path:

- Termux may run Node.js and the ClawGuard CLI on Android for testing, but this is not the recommended team setup.
- Android app control should use target app APIs or Android intents only after a ClawGuard approval.
- Do not use Accessibility Services to bypass user consent or app permissions.

## iOS Support

Best iOS path:

1. Install Telegram on the iPhone.
2. Join or message the ClawGuard approval bot.
3. Keep ClawGuard running on a Mac, PC, or server.
4. Approve or deny from Telegram:

```text
approve <approval-id> reason
deny <approval-id> reason
```

Advanced iOS path:

- Use Shortcuts or App Intents only for apps that explicitly expose safe actions.
- Do not expect an npm CLI install to work as a normal iPhone app install.
- iOS app control must go through a native app, Shortcuts action, URL scheme, universal link, MDM profile, or official API.

## Control Some App Safely

Use this policy before any app-control integration:

| App-control target | Default decision | Safe path |
| --- | --- | --- |
| Send Telegram approval message | allow if token/chat are configured | Telegram bot API |
| Send WhatsApp approval message | manual review | WhatsApp Business Cloud API bridge |
| Open a URL in a mobile app | manual review | universal link / app link with explicit user tap |
| Trigger Android app action | manual review | Android intent to documented action |
| Trigger iOS app action | manual review | App Intent, Shortcut, URL scheme, or universal link |
| Control banking/payment app | block in MVP | official bank API plus legal/compliance approval |
| Control camera, drone, robot, IoT | block real actuation in MVP | simulation and operator approval only |
| Use accessibility automation | block by default | only enterprise-approved accessibility use |

ClawGuard should always ask:

- What app will be controlled?
- What exact action will be requested?
- Does the app provide an official interface for that action?
- Can the user approve or cancel before the action happens?
- Is rollback or recovery possible?
- Is customer, payment, camera, location, child, or employee data involved?

## Mobile Approval Smoke Test

Run this on the PC/server:

```bash
clawguard approvals demo-flow --keep
```

Then test a real Telegram dry run:

```bash
clawguard approvals doctor --chat-id <telegram-chat-id>

clawguard approvals watch ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id <telegram-chat-id> \
  --once \
  --dry-run
```

Only remove `--dry-run` after the approval text is safe and redacted.

## Official References

- Android intents and intent filters: https://developer.android.com/guide/components/intents-filters
- Android app links: https://developer.android.com/training/app-links
- Apple App Intents: https://developer.apple.com/documentation/appintents
- Apple Universal Links: https://developer.apple.com/ios/universal-links/
- Telegram Bot API: https://core.telegram.org/bots/api
- WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
- WhatsApp Cloud API messages: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

