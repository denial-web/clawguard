# ClawGuard Five-Minute Beta Tester Kit

Use this when asking a teammate, friend, or early user to try the ClawGuard Agent beta for the first time.

Goal: confirm that the published beta installs, initializes a local agent workspace, blocks dangerous protected-asset actions, and makes risky cleanup wait for approval instead of silently modifying files.

## What To Send

```text
Can you help me test ClawGuard Agent beta for 5 minutes?

ClawGuard is a governed AI agent runtime. It can inspect projects and propose actions, but risky work goes through policy, approval, backup, and audit.

Please run the commands below from a clean folder and tell me:
1. Did install and init work?
2. Did the protected database command require approval?
3. Did anything look like the agent could act without permission?
4. What was confusing?
```

## Test From A Clean Folder

```bash
mkdir -p ~/clawguard-beta-test
cd ~/clawguard-beta-test

npx --yes --package @denial-web/clawguard@beta clawguard --version
```

Expected output:

```text
1.0.0-beta.4
```

## Initialize The Agent

```bash
npx --yes --package @denial-web/clawguard@beta clawguard agent init
```

Expected result: ClawGuard creates `.clawguard.json` and `.clawguard/agent/` state folders.

## Test Protected Asset Guard

This does not connect to a real database. It only checks what ClawGuard would do if an agent tried a dangerous database command.

```bash
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"
```

Expected result:

```text
Decision: approval_required
Risk: critical
Reason: Database destructive command detected.
```

## Test Protected File Defaults

```bash
mkdir -p data backups/customer dist
printf 'DATABASE_URL=postgres://demo\n' > .env
printf 'sqlite-placeholder\n' > data/prod.sqlite
printf 'customer-backup\n' > backups/customer/prod.dump
printf 'generated-build-output\n' > dist/app.js

npx --yes --package @denial-web/clawguard@beta clawguard agent protected check data/prod.sqlite --operation write
```

Expected result:

```text
Decision: approval_required
Risk: critical
```

## Test Agent Cleanup Proposal

```bash
npx --yes --package @denial-web/clawguard@beta clawguard agent run "inspect this project and propose safe cleanup"
```

Expected result:

- ClawGuard may propose generated/cache paths like `dist/`.
- Protected files such as `.env`, `data/prod.sqlite`, and backups must not be silently deleted.
- A pending approval is normal. The agent should stop before making risky changes.

## Optional: Test Tools And Memory

```bash
npx --yes --package @denial-web/clawguard@beta clawguard agent tools list
npx --yes --package @denial-web/clawguard@beta clawguard agent memory list
```

## Useful Feedback To Ask For

Ask testers for these exact answers:

```text
Operating system:
Node version:
Command that failed, if any:
Full error message:
Did install and init work?
Did protected database deletion require approval?
Did anything look like the agent could act without permission?
Was the output understandable?
What job or workflow would you want this agent to help with?
```

## Do Not Ask For Stars First

The first goal is not stars.

The first goal is:

- 3 people can run the beta package
- 1 person confirms protected database deletion requires approval
- 1 person tests cleanup on a real throwaway project
- 1 person gives a real confusion point that improves the README
