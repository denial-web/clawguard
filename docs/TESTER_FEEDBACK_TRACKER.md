# ClawGuard Tester Feedback Tracker

Use this during the first external testing round. The goal is not praise, stars, or big architecture ideas. The goal is to learn where a real person gets stuck.

## Current Test Target

- npm package: `@denial-web/clawguard@0.3.0`
- GitHub release: `v0.3.0`
- Primary guide: [FIVE_MINUTE_TESTER_KIT.md](FIVE_MINUTE_TESTER_KIT.md)
- Issue form: `.github/ISSUE_TEMPLATE/early_tester_feedback.yml`

## Minimum Test Ask

Send this to three people:

```text
Can you help me test ClawGuard for 5 minutes?

Run this from any folder outside the repo:

npx --yes --package @denial-web/clawguard@0.3.0 clawguard --version
npx --yes --package @denial-web/clawguard@0.3.0 clawguard demo quickstart

Then try one workflow from this guide:
https://github.com/denial-web/clawguard/blob/main/docs/FIVE_MINUTE_TESTER_KIT.md

Please tell me:
1. Did it run?
2. Was the output clear?
3. What confused you?
4. Which workflow matters most: OpenClaw, Hermes Agent, PicoClaw, SOPs, physical devices, approvals, or budget/model routing?
```

## Tracker Table

| Tester | Background | OS / Node | Workflow tested | Worked? | Clear? | Main confusion | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tester 1 |  |  |  |  |  |  |  |
| Tester 2 |  |  |  |  |  |  |  |
| Tester 3 |  |  |  |  |  |  |  |

## What To Record

- exact failed command
- exact error message
- whether they ran from inside or outside the ClawGuard repo
- whether `node --version` is available
- whether they understood `allow`, `manual review`, and `block`
- whether they care more about agent install safety, SOP governance, physical devices, or model/budget control
- any sentence they use to describe ClawGuard back to you

## Triage Rules

Fix immediately:

- npm install or `npx` failure from a clean folder
- README command that does not work
- confusing command order in the first five minutes
- scary-looking output that is actually normal

Create an issue:

- false positive or false negative
- missing OpenClaw/Hermes/PicoClaw folder pattern
- unclear policy decision wording
- device planner category that feels wrong
- SOP pack missing a common small-business or finance step

Do not build yet:

- full enterprise dashboard
- real drone/camera control adapters
- official bank integrations
- autonomous financial transaction workflows
- large framework rewrite

## First Three Success Criteria

- 3 people run the version command successfully
- 1 person completes `demo quickstart`
- 1 person gives a concrete confusion point that can improve docs or CLI output

## After Feedback

Prioritize in this order:

1. Fix install/docs confusion.
2. Tighten README Start Here.
3. Add one more realistic fixture or SOP only if a tester asks for it.
4. Open one helpful upstream security discussion after the onboarding is smooth.
