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
npx --yes --package @denial-web/clawguard@0.3.0 clawguard --version
```

Expected output:

```text
0.3.0
```

## 3. Create a Test Config

```bash
npx --yes --package @denial-web/clawguard@0.3.0 clawguard init --profile local-first
```

Expected result:

```text
ClawGuard init
Profile: local-first
Config: /Users/<you>/clawguard-test/.clawguard.json
```

## 4. Run The One-Command Demo

This does not require a local OpenClaw or Hermes skill. ClawGuard creates a temporary risky skill fixture, blocks it, dry-runs a physical-device policy check, and cleans up.

```bash
npx --yes --package @denial-web/clawguard@0.3.0 clawguard demo quickstart
```

Expected result:

```text
Skill scan: BLOCK / CRITICAL
Device plan: BLOCK / drone drone-takeoff
```

## 5. Scan a Risky Skill

Use an absolute path to a known test skill. Adjust this path if your local clone lives somewhere else:

```bash
CLAWGUARD_REPO=/Users/hy/CascadeProjects/ClawGuard
npx --yes --package @denial-web/clawguard@0.3.0 clawguard scan "$CLAWGUARD_REPO/examples/risky-skill" --config ~/clawguard-test/.clawguard.json
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

## 6. Create a Run Plan

```bash
CLAWGUARD_REPO=/Users/hy/CascadeProjects/ClawGuard
npx --yes --package @denial-web/clawguard@0.3.0 clawguard run-plan \
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

## 7. Dry-Run A Physical Device Plan

This does not connect to or control a real device. It only checks the policy decision ClawGuard would make before a device-capable agent action.

```bash
npx --yes --package @denial-web/clawguard@0.3.0 clawguard device plan --device-class drone --action drone-takeoff --task "Take off for outdoor inspection"
npx --yes --package @denial-web/clawguard@0.3.0 clawguard device plan --device-class security-camera --action record-media --data-class video-audio --task "Enable recording on storefront camera"
```

Expected result:

```text
Decision: BLOCK
Decision: MANUAL REVIEW
```

## 8. Common Mistakes

Only paste command lines into the terminal.

These are commands:

```bash
cd ~/clawguard-test
npx --yes --package @denial-web/clawguard@0.3.0 clawguard --version
node src/cli.js scan examples/risky-skill
git status
npm publish --access public
```

These are output lines, not commands:

```text
Config: /Users/hy/clawguard-test/.clawguard.json
Risk: CRITICAL (100/100)
Policy: block
+ @denial-web/clawguard@0.3.0
```

If you paste output lines into the terminal, shells like `zsh` may print `command not found`. That does not mean ClawGuard failed.

## 9. Local Development Shortcut

Inside the ClawGuard source repository, prefer local Node commands:

```bash
cd /Users/hy/CascadeProjects/ClawGuard
node src/cli.js --version
node src/cli.js scan examples/risky-skill
node src/cli.js run-plan --skill examples/safe-skill --task "Install this OpenClaw skill" --privacy medium --tool-risk high
```

Use the published `npx --package ... clawguard` form from outside the source repository or from a different OpenClaw/Hermes project.
