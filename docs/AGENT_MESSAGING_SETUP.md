# Agent Messaging Setup

Saved: 2026-05-12

Use this guide when an AI agent needs to communicate with the owner through Telegram, WhatsApp, OpenClaw-native messaging, Hermes Agent, or another channel before installing skills, spending budget, sending external data, or touching physical devices.

The safest pattern is:

```text
agent proposes action
  -> ClawGuard writes approval request
  -> message bridge sends request to owner
  -> owner replies approve / deny
  -> ClawGuard writes decision record
  -> ClawGuard applies or blocks the action
```

ClawGuard should not rely on a chat message alone as proof. The durable proof is the local `approvals.jsonl` and `decisions.jsonl` record.

## Support Matrix

| Channel | Current ClawGuard status | Best use |
| --- | --- | --- |
| Telegram direct | Supported for send, watch, and poll replies. | Fastest owner approval channel for early testers. |
| OpenClaw-native message handoff | Supported as command rendering/invocation. | Use when OpenClaw already knows how to message Telegram, WhatsApp, or another channel. |
| Hermes/PicoClaw-native message handoff | Planned through the same external command pattern. | Use when those runtimes expose a stable message-send CLI. |
| WhatsApp Cloud API | Planned direct adapter; document-first for now. | Best for business users, but requires Meta setup, webhooks, templates, and policy review. |
| Slack/Discord/Email | Planned adapters. | Team workflows after Telegram proves useful. |

## Current Telegram Flow

### 1. Create A Telegram Bot

1. Open Telegram.
2. Message `@BotFather`.
3. Run `/newbot`.
4. Save the bot token in a private password manager or local secret store.
5. Send one message to your new bot so Telegram has a chat to return.

Official reference: https://core.telegram.org/bots/api

### 2. Export The Token Locally

```bash
export TELEGRAM_BOT_TOKEN="<telegram-bot-token>"
```

Do not commit this token to GitHub, `.clawguard.json`, screenshots, logs, or docs.

### 3. Find The Chat ID

One simple way is to call Telegram `getUpdates` after messaging the bot:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
```

Look for `message.chat.id`.

For groups, add the bot to the group, send a message in the group, then call `getUpdates` again.

### 4. Check ClawGuard Approval Setup

```bash
npx --package @denial-web/clawguard clawguard approvals doctor \
  --chat-id <telegram-chat-id> \
  --check-telegram
```

### 5. Create An Approval Request

```bash
npx --package @denial-web/clawguard clawguard openclaw install ./candidate-skill \
  --to ./.agents/skills \
  --policy governed \
  --approval-out ./.clawguard/approvals.jsonl \
  --approval-mode always
```

Use `hermes install` or `picoclaw install` when testing those runtimes.

### 6. Send One Approval Message

```bash
npx --package @denial-web/clawguard clawguard approvals send \
  ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id <telegram-chat-id>
```

### 7. Run A Watcher

Use this when an agent may create more approval requests while running:

```bash
npx --package @denial-web/clawguard clawguard approvals watch \
  ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id <telegram-chat-id>
```

Dry-run first if you want to inspect what would be sent:

```bash
npx --package @denial-web/clawguard clawguard approvals watch \
  ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id <telegram-chat-id> \
  --once \
  --dry-run
```

### 8. Owner Reply Format

The owner replies in Telegram:

```text
approve <approval-id> optional reason
deny <approval-id> optional reason
```

### 9. Poll Telegram Replies Into Decisions

```bash
npx --package @denial-web/clawguard clawguard approvals poll-telegram \
  ./.clawguard/approvals.jsonl \
  --decisions ./.clawguard/decisions.jsonl
```

The poller stores the Telegram update offset beside the decisions file so the same reply is not processed twice.

### 10. Apply The Decision

```bash
npx --package @denial-web/clawguard clawguard approvals apply \
  ./.clawguard/approvals.jsonl \
  --id <approval-id> \
  --decisions ./.clawguard/decisions.jsonl
```

## OpenClaw-Native Messaging Handoff

If OpenClaw already has WhatsApp, Telegram, or another message channel configured, ClawGuard can hand the approval message to OpenClaw instead of sending directly.

Dry-run the command first:

```bash
npx --package @denial-web/clawguard clawguard approvals send \
  ./.clawguard/approvals.jsonl \
  --via openclaw \
  --channel telegram \
  --target <chat-or-user-id> \
  --dry-run
```

Then run without `--dry-run` when the OpenClaw message command is confirmed.

This pattern is important because each agent runtime may already have its own channel setup, account permissions, and contact mapping.

## WhatsApp Setup Plan

WhatsApp is more work than Telegram because official automation uses the WhatsApp Business Platform Cloud API.

Official references:

- Cloud API overview: https://developers.facebook.com/docs/whatsapp/cloud-api
- Webhooks: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
- Messages: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
- Message templates: https://developers.facebook.com/docs/whatsapp/message-templates

### WhatsApp Requirements

For production use, expect:

- Meta developer account
- Meta Business portfolio
- WhatsApp Business Account
- business phone number or test phone number
- app with WhatsApp product enabled
- access token with WhatsApp messaging permissions
- public HTTPS webhook endpoint
- verify token for webhook setup
- app secret for webhook signature verification
- message templates for business-initiated messages outside the service window
- privacy notice and owner/customer consent where required

### Recommended WhatsApp Architecture

```text
ClawGuard approvals.jsonl
  -> WhatsApp bridge service
  -> Meta Cloud API messages endpoint
  -> owner replies approve / deny
  -> Meta webhook receives reply
  -> bridge verifies signature
  -> bridge writes ClawGuard decisions.jsonl
  -> ClawGuard approvals apply
```

The bridge can be a small local service during testing, but production requires a stable HTTPS endpoint.

### WhatsApp Approval Message Shape

Keep messages short and non-sensitive:

```text
ClawGuard approval needed

Action: install-skill
Decision: manual_review
Risk: HIGH
Target: research-helper

Reply:
approve cg_123 reason
deny cg_123 reason
```

Do not send secrets, full customer data, private video/audio, full account numbers, API keys, or private file contents through WhatsApp approval messages.

### WhatsApp MVP Decision

Do not add direct WhatsApp sending to ClawGuard until these are implemented:

- redaction of approval messages
- explicit WhatsApp config validation
- webhook signature verification
- replay protection
- durable mapping from WhatsApp message id to ClawGuard approval id
- template support for business-initiated approval requests
- clear docs about WhatsApp Business Platform policies

Until then, use one of these safer options:

1. Use Telegram direct integration for early testing.
2. Let OpenClaw or Hermes send WhatsApp messages if they already have a compliant channel.
3. Build a small external WhatsApp bridge that reads `approvals.jsonl` and writes `decisions.jsonl`.

## Agent-Friendly Setup Assistant Flow

Future ClawGuard can provide an interactive assistant:

```bash
clawguard messaging setup --channel telegram
clawguard messaging setup --channel whatsapp
clawguard messaging doctor --channel telegram
clawguard messaging doctor --channel whatsapp
```

The assistant should:

- explain which channel is easiest
- ask whether the user wants direct ClawGuard sending or runtime-native sending
- verify required environment variables
- send a test approval message
- verify an owner reply
- write a local setup summary
- never store tokens unless the user explicitly chooses a secure local secret store

## Recommended Implementation Order

1. Keep Telegram direct integration as the default quick path.
2. Improve `approvals doctor` output with a link to this guide.
3. Add a generic webhook decision importer so external bridges can write decisions safely.
4. Add WhatsApp bridge example as a separate sample, not core CLI first.
5. Add direct `--via whatsapp` only after webhook verification, redaction, replay protection, and template handling exist.

## Security Rules

- Never store bot tokens or WhatsApp access tokens in Git.
- Never send full secrets, customer records, video frames, or private file contents in approval messages.
- Approval messages should contain a summary and an approval id, not raw sensitive content.
- High-risk actions should require dual approval, not one casual chat reply.
- Telegram/WhatsApp approval is a convenience channel; the local decision log is the record of authority.
- If the channel is unavailable, ClawGuard should pause, not auto-approve.
