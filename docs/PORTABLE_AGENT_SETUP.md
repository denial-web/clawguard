# Portable Agent Setup

Use this when copying ClawGuard to another PC that will run OpenClaw, Hermes Agent, PicoClaw, or more than one of them.

The recommended pattern is:

```text
agent search/discovery
        |
candidate skill folder
        |
ClawGuard setup + policy gate
        |
allow / approval request / block
        |
trusted skill folder
```

ClawGuard should guard installation and trusted-folder changes. The agent can still search, discuss, and recommend skills normally.

## 1. Requirements

- Node.js 20 or newer.
- npm available in the terminal.
- The agent runtime installed separately, if you want to test real agent execution.

Check:

```sh
node --version
npm --version
```

## 2. Prepare One Framework

Create a new workspace on the target PC:

```sh
mkdir -p ~/clawguard-agent-lab
cd ~/clawguard-agent-lab
```

Choose one framework:

```sh
npx --yes --package @denial-web/clawguard clawguard setup --framework openclaw
npx --yes --package @denial-web/clawguard clawguard setup --framework hermes
npx --yes --package @denial-web/clawguard clawguard setup --framework picoclaw
```

This writes:

- `.clawguard.json`
- `.clawguard/approvals.jsonl`
- `.clawguard/decisions.jsonl`
- `.clawguard/framework.json`
- `CLAWGUARD_SETUP.md`
- a guarded skill directory for the selected framework

Default guarded directories:

| Framework | Default guarded install directory |
| --- | --- |
| OpenClaw | `.agents/skills` |
| Hermes Agent | `.hermes/skills` |
| PicoClaw | `.picoclaw/skills` |

If the framework already has a real trusted skill folder, point ClawGuard at it:

```sh
npx --yes --package @denial-web/clawguard clawguard setup \
  --framework hermes \
  --install-dir ~/.hermes/skills
```

## 3. Guard A Candidate Skill

Put or clone the candidate skill into `./candidate-skill`, then run:

```sh
npx --yes --package @denial-web/clawguard clawguard run-plan \
  --config ./.clawguard.json \
  --skill ./candidate-skill \
  --task "Install this agent skill" \
  --privacy medium \
  --tool-risk high
```

Then install through the selected framework gate:

```sh
npx --yes --package @denial-web/clawguard clawguard openclaw install ./candidate-skill \
  --to ./.agents/skills \
  --policy governed \
  --approval-out ./.clawguard/approvals.jsonl \
  --approval-mode always
```

Use `hermes install` or `picoclaw install` instead of `openclaw install` when that is the selected framework.

## 4. Run The Bypass Monitor

The monitor is what helps prevent direct trusted-folder bypass:

```sh
npx --yes --package @denial-web/clawguard clawguard monitor ./.agents/skills \
  --approvals ./.clawguard/approvals.jsonl \
  --decisions ./.clawguard/decisions.jsonl \
  --quarantine ./.clawguard/quarantine \
  --audit-log ./.clawguard/monitor.jsonl
```

Change `./.agents/skills` to the selected framework install directory.

For strong protection, keep the trusted skill directory writable only by the ClawGuard install process where possible, and keep the monitor running while the agent is active.

## 5. Approval Messages

For the full Telegram and WhatsApp setup plan, see [Agent Messaging Setup](AGENT_MESSAGING_SETUP.md).

For Telegram approval forwarding:

```sh
TELEGRAM_BOT_TOKEN=replace-with-token npx --yes --package @denial-web/clawguard clawguard approvals watch \
  ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id replace-with-chat-id
```

For OpenClaw-native messaging, ClawGuard can render or invoke an OpenClaw message command:

```sh
npx --yes --package @denial-web/clawguard clawguard approvals send \
  ./.clawguard/approvals.jsonl \
  --via openclaw \
  --channel telegram \
  --target replace-with-chat-id \
  --dry-run
```

WhatsApp requires the WhatsApp Business Platform Cloud API, a Meta app, a WhatsApp Business Account, a phone number, a public HTTPS webhook, and message-template handling for many business-initiated messages. For now, use Telegram direct integration, OpenClaw-native WhatsApp forwarding if the runtime already supports it, or an external bridge that reads `approvals.jsonl` and writes `decisions.jsonl`.

## 6. Multiple Frameworks On One PC

Use separate workspaces or explicit install directories:

```sh
mkdir -p ~/clawguard-openclaw ~/clawguard-hermes ~/clawguard-picoclaw

cd ~/clawguard-openclaw
npx --yes --package @denial-web/clawguard clawguard setup --framework openclaw

cd ~/clawguard-hermes
npx --yes --package @denial-web/clawguard clawguard setup --framework hermes

cd ~/clawguard-picoclaw
npx --yes --package @denial-web/clawguard clawguard setup --framework picoclaw
```

This keeps approvals, decisions, policies, and trusted folders separated by runtime.

## 7. What To Give A Teammate

Send them:

- this document
- the command for their selected framework
- the generated `CLAWGUARD_SETUP.md` if you already prepared a workspace
- a small test skill to scan

Minimum teammate smoke test:

```sh
mkdir -p ~/clawguard-agent-lab
cd ~/clawguard-agent-lab
npx --yes --package @denial-web/clawguard clawguard setup --framework openclaw
npx --yes --package @denial-web/clawguard clawguard approvals demo-flow --keep
```
