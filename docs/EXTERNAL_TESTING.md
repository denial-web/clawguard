# External Beta Testing Guide

Use this guide to test the published ClawGuard npm beta from a clean folder outside the ClawGuard source repository.

Testing outside the repo matters because `npx` can behave differently when it runs inside a checkout whose own `package.json` has the same package name.

## 1. Create A Clean Test Folder

```bash
mkdir -p ~/clawguard-beta-test
cd ~/clawguard-beta-test
```

## 2. Verify The Published Beta

```bash
npx --yes --package @denial-web/clawguard@beta clawguard --version
```

Expected output:

```text
1.0.0-beta.1
```

## 3. Initialize Agent State

```bash
npx --yes --package @denial-web/clawguard@beta clawguard agent init
```

Expected result:

```text
ClawGuard Agent init
```

The command creates:

```text
.clawguard.json
.clawguard/agent/
```

## 4. Confirm Protected Database Commands Require Approval

```bash
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"
```

Expected result:

```text
Decision: approval_required
Risk: critical
Reason: Database destructive command detected.
```

This is the most important beta check: the agent must not be able to delete a company database just because it wants to finish another task.

## 5. Confirm Protected Files Are Gated

```bash
mkdir -p data backups/customer
printf 'DATABASE_URL=postgres://demo\n' > .env
printf 'sqlite-placeholder\n' > data/prod.sqlite
printf 'customer-backup\n' > backups/customer/prod.dump

npx --yes --package @denial-web/clawguard@beta clawguard agent protected check .env --operation read
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check data/prod.sqlite --operation write
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check backups/customer/prod.dump --operation cleanup
```

Expected result: `.env`, `data/prod.sqlite`, and backup files are protected by default and require approval before read/write/cleanup access.

## 6. Run A Safe Cleanup Proposal

```bash
mkdir -p dist
printf 'generated-build-output\n' > dist/app.js

npx --yes --package @denial-web/clawguard@beta clawguard agent run "inspect this project and propose safe cleanup"
```

Expected result:

- Generated output such as `dist/` may be proposed for cleanup.
- Protected files should be blocked or gated.
- A pending approval exit is normal.
- No risky change should happen silently.

## 7. Optional Scanner Smoke Test

If you also want to test the scanner surface:

```bash
npx --yes --package @denial-web/clawguard@beta clawguard demo quickstart
```

Expected result:

```text
Skill scan: BLOCK / CRITICAL
Device plan: BLOCK / drone drone-takeoff
```

## 8. Common Mistakes

Only paste command lines into the terminal.

These are commands:

```bash
cd ~/clawguard-beta-test
npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"
```

These are output lines, not commands:

```text
Decision: approval_required
Risk: critical
Config: /Users/<you>/clawguard-beta-test/.clawguard.json
```

If you paste output lines into the terminal, shells like `zsh` may print `command not found`. That does not mean ClawGuard failed.

## 9. Local Development Shortcut

Inside the ClawGuard source repository, prefer local Node commands:

```bash
cd /Users/hy/CascadeProjects/ClawGuard
node src/cli.js --version
node src/cli.js agent protected check --argv "psql,-c,DROP DATABASE prod"
node src/cli.js agent run "inspect this project and propose safe cleanup"
```

Use the published `npx --package ... clawguard` form from outside the source repository or from another project.
