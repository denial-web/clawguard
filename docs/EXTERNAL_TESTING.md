# External Testing Guide

Use this guide to test the published ClawGuard npm package from a clean folder outside the ClawGuard source repository.

Testing outside the repo matters because npm can behave differently when `npx` is run inside a folder whose own `package.json` has the same package name.

## 1. Create a Clean Test Folder

```bash
mkdir -p ~/clawguard-test
cd ~/clawguard-test
```

## 2. Verify the Published Package

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard --version
```

Expected output:

```text
0.1.31
```

## 3. Create a Test Config

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard init --profile local-first
```

Expected result:

```text
ClawGuard init
Profile: local-first
Config: /Users/<you>/clawguard-test/.clawguard.json
```

## 4. Scan a Risky Skill

Use an absolute path to a known test skill. Adjust this path if your local clone lives somewhere else:

```bash
CLAWGUARD_REPO=/Users/hy/CascadeProjects/ClawGuard
npx --yes --package @denial-web/clawguard@0.1.31 clawguard scan "$CLAWGUARD_REPO/examples/risky-skill" --config ~/clawguard-test/.clawguard.json
```

Expected result:

```text
Risk: CRITICAL (100/100)
Policy: block
```

Also confirm the output uses the external test config:

```text
Config: /Users/<you>/clawguard-test/.clawguard.json
```

## 5. Create a Run Plan

```bash
CLAWGUARD_REPO=/Users/hy/CascadeProjects/ClawGuard
npx --yes --package @denial-web/clawguard@0.1.31 clawguard run-plan \
  --config ~/clawguard-test/.clawguard.json \
  --skill "$CLAWGUARD_REPO/examples/safe-skill" \
  --task "Install this OpenClaw skill" \
  --privacy medium \
  --tool-risk high
```

Expected result:

```text
Decision: ALLOW
Skill policy: ALLOW
Model profile: strong
Model decision: ALLOW
Budget decision: ALLOW
```

## 6. Common Mistakes

Only paste command lines into the terminal.

These are commands:

```bash
cd ~/clawguard-test
npx --yes --package @denial-web/clawguard@0.1.31 clawguard --version
node src/cli.js scan examples/risky-skill
git status
npm publish --access public
```

These are output lines, not commands:

```text
Config: /Users/hy/clawguard-test/.clawguard.json
Risk: CRITICAL (100/100)
Policy: block
+ @denial-web/clawguard@0.1.31
```

If you paste output lines into the terminal, shells like `zsh` may print `command not found`. That does not mean ClawGuard failed.

## 7. Local Development Shortcut

Inside the ClawGuard source repository, prefer local Node commands:

```bash
cd /Users/hy/CascadeProjects/ClawGuard
node src/cli.js --version
node src/cli.js scan examples/risky-skill
node src/cli.js run-plan --skill examples/safe-skill --task "Install this OpenClaw skill" --privacy medium --tool-risk high
```

Use the published `npx --package ... clawguard` form from outside the source repository or from a different OpenClaw/Hermes project.
