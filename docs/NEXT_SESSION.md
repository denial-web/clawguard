# Next Session Checkpoint

Saved: 2026-05-16

## Current Status

ClawGuard is public and ready for early external testing.

- GitHub repo: `https://github.com/denial-web/clawguard`
- npm package: `@denial-web/clawguard@0.6.0`
- GitHub release: `v0.6.0`
- Local CLI test: passed
- External npm smoke test from `~/clawguard-test`: passed
- Default `.clawguard.json`: committed
- README Start Here section: added
- External tester guide: [EXTERNAL_TESTING.md](EXTERNAL_TESTING.md)
- Launch outreach plan: [LAUNCH_OUTREACH_PLAN.md](LAUNCH_OUTREACH_PLAN.md)
- Tester feedback tracker: [TESTER_FEEDBACK_TRACKER.md](TESTER_FEEDBACK_TRACKER.md)
- SOP Packs plan: [SOP_PACKS.md](SOP_PACKS.md), including current cafe, milk tea shop, mart, toy shop, customer complaint triage, KYC intake, and fraud alert review packs, plus planned restaurant, HR/staffing, import/export, card dispute, loan-document prep, and regulatory-report drafting packs.
- Physical device governor MVP: `clawguard device plan` dry-runs policy decisions for security cameras, drones, robot toys, mobile robots, embedded IoT, and industrial OT. It does not connect to or control real devices.

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
npx --yes --package @denial-web/clawguard@0.6.0 clawguard --version
npx --yes --package @denial-web/clawguard@0.6.0 clawguard init --profile local-first
npx --yes --package @denial-web/clawguard@0.6.0 clawguard demo quickstart
npx --yes --package @denial-web/clawguard@0.6.0 clawguard scan /Users/hy/CascadeProjects/ClawGuard/examples/risky-skill --config ~/clawguard-test/.clawguard.json
npx --yes --package @denial-web/clawguard@0.6.0 clawguard device plan --device-class drone --action drone-takeoff --task "Take off for outdoor inspection"
```

Expected:

- version prints `0.6.0`
- quickstart demo blocks a temporary risky skill and blocks drone takeoff
- risky skill is `CRITICAL`
- policy decision is `block`
- explicit config path is `~/clawguard-test/.clawguard.json`
- drone takeoff is blocked by the physical device MVP

## Important npm Note

When testing from inside `/Users/hy/CascadeProjects/ClawGuard`, use:

```bash
node src/cli.js ...
```

When testing from another folder, use:

```bash
npx --yes --package @denial-web/clawguard@0.6.0 clawguard ...
```

Do not paste output lines such as `Config: ...`, `Risk: ...`, or `+ @denial-web/clawguard@0.1.27` into the terminal.

## Next Best Step

Follow [LAUNCH_OUTREACH_PLAN.md](LAUNCH_OUTREACH_PLAN.md), ask testers to try both the CLI smoke test and the local web Agent Dashboard, and collect feedback before adding broader browser/app execution.

Main goal: get first real external feedback on the OpenClaw-style install guard, the financial SOP guard, the physical-device dry-run planner, and whether the dashboard makes approvals/audit/memory/bridge state understandable.

Minimum tomorrow:

1. Ask 3 people to run the smoke test.
2. Share one short public post.
3. Track confusion and questions.
4. Ask one finance/compliance-minded tester whether the fraud-alert SOP output is understandable.
5. Ask one robotics/camera/IoT-minded tester whether the `device plan` output feels clear and conservative.
6. Open `npm run web` and confirm the Agent Dashboard is clear to someone who has not seen the internals.
7. Do not build new execution features until feedback arrives.

Use [TESTER_FEEDBACK_TRACKER.md](TESTER_FEEDBACK_TRACKER.md) to capture answers, or send testers to the GitHub "Early Tester Feedback" issue form.

## Short Public Post

```text
I built ClawGuard, a security and governance scanner for OpenClaw-style skills, ClawHub installs, MCP configs, agent tool dependencies, internal financial AI workflows, and dry-run physical device actions.

It scans risky skills before they enter trusted folders, creates approval gates, checks model/budget routing, and now includes SOP gates plus a dry-run planner for cameras, drones, robots, and IoT actions.

Try it:
npx --yes --package @denial-web/clawguard@0.6.0 clawguard scan ./path/to/skill

GitHub:
https://github.com/denial-web/clawguard

npm:
https://www.npmjs.com/package/@denial-web/clawguard
```

## Direct Tester Message

```text
Can you help me test a small open-source security tool?

Run this from any folder outside the repo:

npx --yes --package @denial-web/clawguard@0.6.0 clawguard --version

Then scan any OpenClaw-style skill folder if you have one:

npx --yes --package @denial-web/clawguard@0.6.0 clawguard scan ./path/to/skill

I only need to know:
1. Did it run?
2. Was the output clear?
3. What confused you?
```

## Current Priority

Visibility loop and tester feedback first. ClawGuard Agent v0.6.0 adds the local Agent Dashboard on top of the narrow sandboxed bridge executor for `browser.open` and `browser.extract`; continue by testing it with external users before adding any click/type/app execution.

Secondary product idea to continue later: expand ClawGuard SOP Packs and the device planner after feedback. Current starter packs cover milk tea, cafe, mart, toy shop, customer complaint triage, KYC intake, and fraud alert review workflows, and the local web demo now has Business SOP Gate options for small-business and financial workflows. Current device planning covers dry-run policy decisions only; next best additions are device manifest scanning, evidence templates, and simulator-first test fixtures.

Early success means:

- 3 external runs
- 1 useful question or issue
- 1 person confirms the output is clear
- 1 ecosystem safety discussion or docs contribution
