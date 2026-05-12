# ClawGuard Five-Minute Tester Kit

Use this when asking a teammate, friend, or early user to try ClawGuard for the first time.

Goal: confirm that ClawGuard installs, scans a risky skill, lists SOP packs, and can prepare a guarded workspace for OpenClaw, Hermes Agent, or PicoClaw.

## What To Send

```text
Can you help me test ClawGuard for 5 minutes?

ClawGuard is a security and governance gate for OpenClaw-style skills, ClawHub installs, MCP configs, agent tools, and small-business SOP workflows.

Please run the commands below and tell me:
1. Did the install command work?
2. Was the risk output clear?
3. Which framework do you want to protect: OpenClaw, Hermes Agent, or PicoClaw?
4. What part confused you?
```

## Test From A Clean Folder

```bash
mkdir -p ~/clawguard-test
cd ~/clawguard-test

npx --yes --package @denial-web/clawguard@0.1.31 clawguard --version
```

Expected output:

```text
0.1.31
```

## Create A Local Policy Config

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard init --profile local-first
```

This creates:

```text
.clawguard.json
```

## Test The Built-In Approval Demo

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard approvals demo-flow --keep
```

Expected result:

```text
Decision: allow
Installed:
```

This proves the basic loop works:

```text
candidate skill
  -> scan
  -> approval request
  -> owner decision
  -> install only after approval
```

## Pick A Framework To Protect

Choose one.

For OpenClaw:

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard setup --framework openclaw
```

For Hermes Agent:

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard setup --framework hermes
```

For PicoClaw:

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard setup --framework picoclaw
```

The setup command creates a local `CLAWGUARD_SETUP.md` file with the exact guarded install commands for that machine.

If the user already has a real trusted skill folder, use:

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard setup --framework openclaw --install-dir /path/to/trusted/skills
```

Change `openclaw` to `hermes` or `picoclaw` when needed.

## Test SOP Packs

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop list
```

Expected packs:

```text
financial-services/customer-complaint-triage
financial-services/fraud-alert-review
financial-services/kyc-document-intake
small-business/cafe/closing
small-business/mart/daily-close
small-business/milk-tea/closing
small-business/toy-shop/daily-close
```

Create and check a toy shop close workflow:

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop init --industry toy-shop --out toy-shop-close.json
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop check --industry toy-shop toy-shop-close.json
```

The first generated workflow is intentionally incomplete, so a block or manual-review result is normal.

Try a financial-governor SOP check:

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop init --industry banking-fraud --out fraud-review.json
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop check --industry banking-fraud fraud-review.json
```

## Useful Feedback To Ask For

Ask testers for these exact answers:

```text
Operating system:
Node version:
Command that failed, if any:
Full error message:
Was the output understandable?
Would this help before installing an agent skill?
Which workflow matters most to you: OpenClaw, Hermes Agent, PicoClaw, SOPs, budget/model routing, or approvals?
```

## Do Not Ask For Stars First

The first goal is not stars.

The first goal is:

- 3 people can run the package
- 1 person tries setup with OpenClaw, Hermes Agent, or PicoClaw
- 1 person understands why a risky install should pause or block
- 1 person gives a real confusion point that can improve the README
