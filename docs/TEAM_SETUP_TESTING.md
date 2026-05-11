# Team Setup and Testing Guide

Use this guide when asking teammates to install OpenClaw, install ClawGuard, and test the guarded skill-install workflow.

ClawGuard is an independent companion tool. It is compatible with OpenClaw-style skill workflows, but it is not affiliated with OpenClaw or Hermes Agent.

For a smaller first-time smoke test of the published npm package, start with [External Testing Guide](EXTERNAL_TESTING.md).

## 1. Requirements

- macOS, Linux, or Windows with WSL2 preferred.
- Node.js 22.16+ minimum for current OpenClaw docs; Node.js 24 is recommended.
- npm available in the terminal.
- Git installed.
- An OpenClaw-supported model/API setup for real OpenClaw usage.

Check local versions:

```bash
node --version
npm --version
git --version
```

## 2. Install OpenClaw

Recommended installer for macOS, Linux, or WSL2:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

If the team wants to install first and onboard later:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
openclaw onboard --install-daemon
```

Alternative npm install when Node is already managed:

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

Windows PowerShell:

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

Verify OpenClaw:

```bash
openclaw --version
openclaw doctor
openclaw gateway status
```

Expected result:

- `openclaw --version` prints a version.
- `openclaw doctor` reports setup status.
- `openclaw gateway status` shows whether the gateway is running.

## 3. Install and Verify ClawGuard

ClawGuard can run directly with `npx`:

```bash
npx --package @denial-web/clawguard clawguard --help
```

Optional global install:

```bash
npm install -g @denial-web/clawguard
clawguard --help
```

Verify the published package:

```bash
npm view @denial-web/clawguard version
npx --package @denial-web/clawguard clawguard approvals demo-flow --keep
```

Create a starter config:

```bash
npx --package @denial-web/clawguard clawguard init --profile local-first
```

List available profiles:

```bash
npx --package @denial-web/clawguard clawguard init --list-profiles
```

Expected demo-flow result:

- Creates a harmless temporary demo skill.
- Scans it.
- Writes a pending approval request.
- Records a local approve decision.
- Applies the decision.
- Installs the demo skill only after approval.

## 4. Basic ClawGuard Scans

Scan one skill folder:

```bash
npx --package @denial-web/clawguard clawguard scan ./path/to/skill
```

Run a policy gate:

```bash
npx --package @denial-web/clawguard clawguard gate ./path/to/skill --policy governed
```

Generate a shareable HTML report:

```bash
npx --package @denial-web/clawguard clawguard scan ./path/to/skill --html clawguard-report.html
```

Check a planned model call against budget limits:

```bash
npx --package @denial-web/clawguard clawguard budget check \
  --provider example \
  --model example-model \
  --input-tokens 12000 \
  --output-tokens 2000 \
  --input-usd-per-1m 0.25 \
  --output-usd-per-1m 1.25 \
  --approval-usd 0.01 \
  --max-usd 0.05
```

Recommend a model profile for a task:

```bash
npx --package @denial-web/clawguard clawguard model recommend \
  --task "Install a third-party skill and connect Telegram" \
  --privacy medium \
  --tool-risk high \
  --input-tokens 12000 \
  --output-tokens 2000
```

Create one combined run plan:

```bash
npx --package @denial-web/clawguard clawguard run-plan \
  --skill ./path/to/skill \
  --task "Install and run this skill" \
  --privacy medium \
  --tool-risk high \
  --input-tokens 12000 \
  --output-tokens 2000 \
  --approval-out ./.clawguard/approvals.jsonl
```

Exit code meaning for `gate`:

- `0`: allow.
- `1`: warn, manual review, sandbox required, or dual approval.
- `2`: block.

## 5. OpenClaw Skill Discovery With Guarded Install

OpenClaw can search ClawHub natively:

```bash
openclaw skills search "calendar"
```

Do not install unknown third-party skills directly into a trusted workspace during testing. First download or prepare a candidate skill folder, then run ClawGuard before copying it into the trusted skill directory.

Guarded install for OpenClaw-style workspace skills:

```bash
npx --package @denial-web/clawguard clawguard openclaw install ./candidate-skill \
  --to ./.agents/skills \
  --policy governed \
  --approval-out ./.clawguard/approvals.jsonl \
  --approval-mode always
```

For Hermes-style skill folders:

```bash
npx --package @denial-web/clawguard clawguard hermes install ./candidate-skill \
  --to ~/.hermes/skills \
  --policy governed \
  --approval-out ./.clawguard/approvals.jsonl \
  --approval-mode always
```

What this proves:

```text
OpenClaw or Hermes search/discovery
        ↓
candidate skill folder
        ↓
ClawGuard policy gate
        ↓
allow / approval request / block
        ↓
trusted skill folder
```

## 6. Approval Workflow Test

Create an approval request:

```bash
npx --package @denial-web/clawguard clawguard openclaw install ./candidate-skill \
  --to ./.agents/skills \
  --policy governed \
  --approval-out ./.clawguard/approvals.jsonl \
  --approval-mode always
```

Check setup and suggested commands:

```bash
npx --package @denial-web/clawguard clawguard approvals doctor --chat-id 123456789
```

Record an approval manually:

```bash
npx --package @denial-web/clawguard clawguard approvals decide ./.clawguard/approvals.jsonl \
  --id <approval-id> \
  --decision approve \
  --out ./.clawguard/decisions.jsonl
```

Apply the recorded decision:

```bash
npx --package @denial-web/clawguard clawguard approvals apply ./.clawguard/approvals.jsonl \
  --id <approval-id> \
  --decisions ./.clawguard/decisions.jsonl
```

Expected result:

- If approved, ClawGuard copies the original scanned source to the original approved destination.
- If denied, ClawGuard exits blocked and copies nothing.
- If no decision exists, ClawGuard stays paused and copies nothing.

## 7. Bypass Monitor Test

After testing approval apply, ask the team to simulate a bypass by manually creating an unapproved folder inside the trusted skill directory:

```bash
mkdir -p ./.agents/skills/manual-bypass
printf "# Manual Bypass\n" > ./.agents/skills/manual-bypass/SKILL.md
```

Run monitor mode:

```bash
npx --package @denial-web/clawguard clawguard monitor ./.agents/skills \
  --approvals ./.clawguard/approvals.jsonl \
  --decisions ./.clawguard/decisions.jsonl \
  --quarantine ./.clawguard/quarantine \
  --audit-log ./.clawguard/monitor.jsonl
```

Expected result:

- Approved skills stay in the trusted skill folder.
- `manual-bypass` is reported as unapproved.
- With `--quarantine`, the unapproved folder is moved into `./.clawguard/quarantine`.
- A monitor event is appended to `./.clawguard/monitor.jsonl`.

Use `--dry-run` first if the team wants to see what would be quarantined without moving files:

```bash
npx --package @denial-web/clawguard clawguard monitor ./.agents/skills \
  --approvals ./.clawguard/approvals.jsonl \
  --decisions ./.clawguard/decisions.jsonl \
  --quarantine ./.clawguard/quarantine \
  --dry-run
```

## 8. Telegram Approval Bridge Test

Set the Telegram bot token:

```bash
export TELEGRAM_BOT_TOKEN="<telegram-bot-token>"
```

Dry-run the watcher first:

```bash
npx --package @denial-web/clawguard clawguard approvals watch ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id <telegram-chat-id> \
  --once \
  --dry-run
```

Run the watcher:

```bash
npx --package @denial-web/clawguard clawguard approvals watch ./.clawguard/approvals.jsonl \
  --via telegram \
  --chat-id <telegram-chat-id>
```

Owner replies in Telegram:

```text
approve <approval-id> optional reason
deny <approval-id> optional reason
```

Poll replies into a decision log:

```bash
npx --package @denial-web/clawguard clawguard approvals poll-telegram ./.clawguard/approvals.jsonl \
  --decisions ./.clawguard/decisions.jsonl
```

Then apply:

```bash
npx --package @denial-web/clawguard clawguard approvals apply ./.clawguard/approvals.jsonl \
  --id <approval-id> \
  --decisions ./.clawguard/decisions.jsonl
```

## 9. Team Acceptance Checklist

Ask each teammate to report:

- Operating system and terminal used.
- `node --version`
- `openclaw --version`
- `openclaw doctor` result summary.
- `npx --package @denial-web/clawguard clawguard approvals demo-flow --keep` result.
- One scan result from a safe skill.
- One scan result from a risky or test skill.
- Whether the approval request, decision log, and apply step worked.
- Whether monitor mode detected and quarantined the manual bypass folder.
- Any confusing command, error, or missing explanation.

## 10. Safety Rules for Testing

- Do not run third-party skill scripts during testing.
- Do not install unknown skills directly into a trusted OpenClaw workspace.
- Prefer `--policy governed` for team testing.
- Use `--approval-mode always` when testing autonomous install approval.
- Treat every downloaded skill as untrusted until ClawGuard and a human owner approve it.

## References

- OpenClaw install docs: https://docs.openclaw.ai/install
- OpenClaw skills docs: https://docs.openclaw.ai/tools/skills
- OpenClaw ClawHub docs: https://docs.openclaw.ai/tools/clawhub
- ClawGuard npm package: https://www.npmjs.com/package/@denial-web/clawguard
