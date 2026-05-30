# ClawGuard v1.0.0-beta.3 Tester Feedback Tracker

Use this during the first ClawGuard Agent beta testing round. The goal is not praise, stars, or big architecture ideas. The goal is to learn whether real people can install the beta and whether the safety boundary is obvious.

## Current Test Target

- npm package: `@denial-web/clawguard@beta`
- published version: `1.0.0-beta.3`
- GitHub release: `v1.0.0-beta.3`
- primary guide: [FIVE_MINUTE_TESTER_KIT.md](FIVE_MINUTE_TESTER_KIT.md)
- external guide: [EXTERNAL_TESTING.md](EXTERNAL_TESTING.md)
- announcement: [BETA_TESTER_ANNOUNCEMENT.md](BETA_TESTER_ANNOUNCEMENT.md)
- issue form: `.github/ISSUE_TEMPLATE/early_tester_feedback.yml`

## Core Beta Question

```text
Did anything look like the agent could act without permission?
```

If a tester answers yes with a concrete example, treat it as a beta blocker until reviewed.

## Minimum Test Ask

Send this to three to five people:

```text
Can you help me test ClawGuard Agent beta for 5 minutes?

Run this from a clean folder:

mkdir -p ~/clawguard-beta-test
cd ~/clawguard-beta-test
npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard agent init
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"

Expected:
- version: 1.0.0-beta.3
- database deletion: approval_required, critical

Please tell me:
1. Did install/init work?
2. Did database deletion require approval?
3. Did anything look like the agent could act without permission?
4. What confused you?
5. What job or workflow would you want this agent to help with?
```

## Tracker Table

| Tester | Background | OS / Node | Commands tested | Install worked? | DB delete gated? | Acted without permission? | Main confusion | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tester 1 |  |  |  |  |  |  |  |  |
| Tester 2 |  |  |  |  |  |  |  |  |
| Tester 3 |  |  |  |  |  |  |  |  |
| Tester 4 |  |  |  |  |  |  |  |  |
| Tester 5 |  |  |  |  |  |  |  |  |

## What To Record

- exact failed command
- exact error message
- whether they ran from inside or outside the ClawGuard repo
- `node --version`
- operating system and terminal
- whether `@beta` resolved to `1.0.0-beta.3`
- whether protected database deletion returned `approval_required` and `critical`
- whether cleanup created a pending approval instead of silently changing files
- whether they understood `allow`, `approval_required`, and `block`
- whether they care more about protected assets, agent cleanup, role intelligence, memory, OpenClaw/Hermes setup, SOPs, physical devices, or model/budget control
- any sentence they use to describe ClawGuard back to you

## Triage Rules

Fix immediately:

- npm install or `npx` failure from a clean folder
- `@beta` does not resolve to `1.0.0-beta.3`
- README or tester-guide command that does not work
- protected database deletion does not require approval
- protected `.env`, database, backup, or SQL file content is revealed without approval
- cleanup modifies files without a pending approval
- scary-looking output that is normal but not explained

Create an issue:

- false positive or false negative in protected asset patterns
- unclear approval wording
- protected command exits with the right code but confusing text
- missing common protected asset type
- role-intelligence output feels shallow for a real job
- memory behavior is hard to understand

Do not build yet:

- full enterprise dashboard
- real bank/government deployment mode
- dual approval UI
- real browser click/type execution
- payment or money-movement tools
- official production database connectors
- large framework rewrite

## First Five Success Criteria

- 3 people run the version command successfully.
- 3 people confirm destructive database deletion requires critical approval.
- 1 person runs cleanup on a throwaway project and sees pending approval.
- 1 person gives a concrete confusion point that improves docs or CLI output.
- 1 person names a real job workflow they want ClawGuard Agent to understand.

## After Feedback

Prioritize in this order:

1. Fix install/docs confusion.
2. Fix any protected-asset false negative.
3. Tighten command output wording where testers hesitate.
4. Add one realistic protected-asset pattern only if testers hit it.
5. Add one practical role pack only if testers name a real job workflow.
