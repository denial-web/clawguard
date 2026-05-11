# ClawGuard Launch Outreach Plan

Saved: 2026-05-11

## Current Position

ClawGuard is public and usable:

- GitHub: `https://github.com/denial-web/clawguard`
- npm: `@denial-web/clawguard@0.1.22`
- GitHub release: `v0.1.22`
- External npm smoke test: passed
- Default config: `.clawguard.json`
- Demo assets: `docs/assets/clawguard-demo.mp4` and `docs/assets/clawguard-web-demo.png`

The project is technically ready for early testers. The next problem is visibility, not more core architecture.

## Tomorrow's Goal

Get the first real external feedback from humans.

Do not optimize for stars first. Optimize for:

- 3 people running one command
- 1 useful issue or question
- 1 public post people can understand quickly
- 1 OpenClaw/Hermes-adjacent contribution or discussion that is helpful, not spammy

## First 60 Minutes

1. Open the repo and confirm latest state:

```bash
cd /Users/hy/CascadeProjects/ClawGuard
git status
npm test
```

2. Re-test published package from outside the repo:

```bash
mkdir -p ~/clawguard-test
cd ~/clawguard-test
npx --yes --package @denial-web/clawguard@0.1.22 clawguard --version
```

3. Open the main assets:

```bash
open /Users/hy/CascadeProjects/ClawGuard/docs/assets/clawguard-web-demo.png
open /Users/hy/CascadeProjects/ClawGuard/docs/assets/clawguard-demo.mp4
```

## Short Launch Post

Use this as the first public post:

```text
I built ClawGuard, a security and governance scanner for OpenClaw-style skills, ClawHub installs, MCP configs, and agent tool dependencies.

It scans risky skills before they enter trusted folders, creates approval gates, checks model/budget routing, and helps prevent unsafe autonomous installs.

Try it:
npx --yes --package @denial-web/clawguard@0.1.22 clawguard scan ./path/to/skill

GitHub:
https://github.com/denial-web/clawguard

npm:
https://www.npmjs.com/package/@denial-web/clawguard
```

## Shorter Version

Use this when the platform prefers concise posts:

```text
I shipped ClawGuard v0.1.22.

It is a security/governance scanner for OpenClaw-style skills, ClawHub installs, MCP configs, and agent tool dependencies.

Goal: block or pause risky autonomous skill installs before they enter trusted folders.

https://github.com/denial-web/clawguard
```

## Direct Tester Message

Send this to 3 people:

```text
Can you help me test a small open-source security tool?

Run this from any folder outside the repo:

npx --yes --package @denial-web/clawguard@0.1.22 clawguard --version

Then scan any OpenClaw-style skill folder if you have one:

npx --yes --package @denial-web/clawguard@0.1.22 clawguard scan ./path/to/skill

I only need to know:
1. Did it run?
2. Was the output clear?
3. What confused you?
```

## Where To Post First

Start with low-pressure places:

- personal X/Twitter
- LinkedIn or personal network
- one relevant Discord/Telegram group where you already participate
- GitHub Discussions or Issues only if you are contributing something useful

Avoid Hacker News on day one unless the README, demo video, and first tester feedback are already clean.

## OpenClaw/Hermes Contribution Strategy

Do not ask maintainers to promote ClawGuard immediately.

Better first contributions:

- improve security docs
- suggest a skill install safety checklist
- document risk categories for third-party skills
- open a discussion about governed installs and approval gates
- offer ClawGuard as one optional external scanner, not an official dependency

Suggested wording:

```text
I noticed third-party agent skills can introduce risks like remote code execution, secret access, broad filesystem access, and prompt-injection instructions.

Would a short security checklist for skill review be useful here?

I can contribute docs covering:
- inspect SKILL.md before install
- avoid remote install scripts
- declare env vars and network access
- require approval before copying into trusted skill folders
- keep an audit trail for installed skills
```

## 7-Day Checklist

- Day 1: Share short post and ask 3 people to run the smoke test.
- Day 2: Fix any install/docs confusion from tester feedback.
- Day 3: Record or trim a 20-30 second demo clip focused on `risky skill -> block`.
- Day 4: Open one useful upstream docs issue/discussion about skill-install safety.
- Day 5: Add a short security checklist doc if feedback confirms it is useful.
- Day 6: Share the demo clip with the npm command and GitHub release.
- Day 7: Review metrics: npm downloads, GitHub views, issues, stars, tester comments.

## Success Metrics

Early success is not fame yet. Early success is:

- 3 successful external runs
- 1 person says the output is understandable
- 1 person asks for a feature or reports confusion
- 1 ecosystem maintainer or developer responds to the security topic

## Do Not Do Yet

- Do not start a giant new framework.
- Do not claim official OpenClaw or Hermes affiliation.
- Do not spam maintainers.
- Do not build Hugging Face demos until the GitHub/npm onboarding is clear.
- Do not chase stars before the first 3 tester runs.

## Next Build Ideas After Feedback

Only after tester feedback:

- clearer `clawguard doctor` for npm/config setup
- one-command external demo fixture
- shorter README animated demo
- GitHub Action example repository
- optional approval bot quickstart
