# Next Session Checkpoint

Saved: 2026-05-11

## Current Status

ClawGuard is public and ready for early external testing.

- GitHub repo: `https://github.com/denial-web/clawguard`
- npm package: `@denial-web/clawguard@0.1.23`
- GitHub release: `v0.1.23`
- Local CLI test: passed
- External npm smoke test from `~/clawguard-test`: passed
- Default `.clawguard.json`: committed
- README Start Here section: added
- External tester guide: [EXTERNAL_TESTING.md](EXTERNAL_TESTING.md)
- Launch outreach plan: [LAUNCH_OUTREACH_PLAN.md](LAUNCH_OUTREACH_PLAN.md)
- SOP Packs plan: [SOP_PACKS.md](SOP_PACKS.md), including cafe, milk tea shop, mart, toy shop, restaurant, HR/staffing, and import/export.

## Last Known Good Commands

Inside the ClawGuard repo:

```bash
cd /Users/hy/CascadeProjects/ClawGuard
node src/cli.js --version
node src/cli.js scan examples/risky-skill
node src/cli.js run-plan --skill examples/safe-skill --task "Install this OpenClaw skill" --privacy medium --tool-risk high
```

Outside the repo:

```bash
mkdir -p ~/clawguard-test
cd ~/clawguard-test
npx --yes --package @denial-web/clawguard@0.1.23 clawguard --version
npx --yes --package @denial-web/clawguard@0.1.23 clawguard init --profile local-first
npx --yes --package @denial-web/clawguard@0.1.23 clawguard scan /Users/hy/CascadeProjects/ClawGuard/examples/risky-skill --config ~/clawguard-test/.clawguard.json
```

Expected:

- version prints `0.1.23`
- risky skill is `CRITICAL`
- policy decision is `block`
- explicit config path is `~/clawguard-test/.clawguard.json`

## Important npm Note

When testing from inside `/Users/hy/CascadeProjects/ClawGuard`, use:

```bash
node src/cli.js ...
```

When testing from another folder, use:

```bash
npx --yes --package @denial-web/clawguard@0.1.23 clawguard ...
```

Do not paste output lines such as `Config: ...`, `Risk: ...`, or `+ @denial-web/clawguard@0.1.23` into the terminal.

## Tomorrow's Best Next Step

Follow [LAUNCH_OUTREACH_PLAN.md](LAUNCH_OUTREACH_PLAN.md).

Main goal: get first real external feedback.

Minimum tomorrow:

1. Ask 3 people to run the smoke test.
2. Share one short public post.
3. Track confusion and questions.
4. Do not build new features until feedback arrives.

## Short Public Post

```text
I built ClawGuard, a security and governance scanner for OpenClaw-style skills, ClawHub installs, MCP configs, and agent tool dependencies.

It scans risky skills before they enter trusted folders, creates approval gates, checks model/budget routing, and helps prevent unsafe autonomous installs.

Try it:
npx --yes --package @denial-web/clawguard@0.1.23 clawguard scan ./path/to/skill

GitHub:
https://github.com/denial-web/clawguard

npm:
https://www.npmjs.com/package/@denial-web/clawguard
```

## Direct Tester Message

```text
Can you help me test a small open-source security tool?

Run this from any folder outside the repo:

npx --yes --package @denial-web/clawguard@0.1.23 clawguard --version

Then scan any OpenClaw-style skill folder if you have one:

npx --yes --package @denial-web/clawguard@0.1.23 clawguard scan ./path/to/skill

I only need to know:
1. Did it run?
2. Was the output clear?
3. What confused you?
```

## Current Priority

Visibility loop, not more architecture.

Secondary product idea to continue later: ClawGuard SOP Packs for small-business operations. Start with the milk tea shop closing checklist because it is visual, practical, and easy to demo.

Early success means:

- 3 external runs
- 1 useful question or issue
- 1 person confirms the output is clear
- 1 ecosystem safety discussion or docs contribution
