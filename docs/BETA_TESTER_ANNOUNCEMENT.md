# ClawGuard Agent Beta Tester Announcement

Paste this into Telegram, Discord, Slack, LinkedIn, GitHub Discussions, or a direct message.

## Short Version

```text
I just published ClawGuard Agent v1.0.0-beta.9.

It is a governed AI agent runtime: it can inspect projects and propose work, but risky actions go through policy, approval, backup, audit, and now Blast Radius Explain before execution.

The important beta test: if an agent tries to touch protected assets like .env files, databases, customer backups, or destructive DB commands, ClawGuard should require approval or block it.

Can you test it for 5 minutes?

mkdir -p ~/clawguard-beta-test
cd ~/clawguard-beta-test
npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard agent init
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"
npx --yes --package @denial-web/clawguard@beta clawguard explain -- psql -c "DROP DATABASE prod"

Expected:
- version: 1.0.0-beta.9
- protected database deletion: approval_required, critical
- blast radius: unknown_high row impact with safer alternatives

Please tell me:
1. Did it install?
2. Did the database deletion check require approval?
3. Did anything look like the agent could act without permission?
4. What confused you?
```

Optional context (do not frame as “beating ChatGPT”): we also publish a **governance-schema compliance** benchmark — ClawGuard’s JSON envelope vs a reference baseline under the same contract. See [AGENT_BENCHMARK_v1.0.0-beta.9.md](AGENT_BENCHMARK_v1.0.0-beta.9.md). Primary install-time signal remains [SCANNER_BENCHMARK.md](SCANNER_BENCHMARK.md).

## Longer Version

```text
I am looking for early testers for ClawGuard Agent v1.0.0-beta.9.

ClawGuard is an AI agent runtime built around governed autonomy. The agent can inspect projects, use memory, follow role-aware procedures, and propose useful work. But risky actions are not supposed to execute directly: file writes, shell execution, protected assets, memory writes, and external actions go through policy, approval, backup, and audit.

This beta focuses on a real safety problem:

"What if an AI agent tries to delete a company database, customer backup, or system file just to finish another task?"

ClawGuard now has local protected asset policy for:
- .env files
- secrets and credentials
- data/ and database/ folders
- .db, .sqlite, .sql, .dump, .bak files
- backups
- custom company assets
- destructive DB/system commands

Please test from a clean folder:

mkdir -p ~/clawguard-beta-test
cd ~/clawguard-beta-test

npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard agent init
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"
npx --yes --package @denial-web/clawguard@beta clawguard explain -- psql -c "DROP DATABASE prod"

Optional cleanup demo:

mkdir -p data dist
printf 'sqlite-placeholder\n' > data/prod.sqlite
printf 'generated-build-output\n' > dist/app.js
npx --yes --package @denial-web/clawguard@beta clawguard agent run "inspect this project and propose safe cleanup"

What I need to know:
1. Did install/init work?
2. Did destructive database deletion require critical approval?
3. Did cleanup stop before modifying files?
4. Was the output understandable?
5. What job or workflow would you want this kind of governed agent to help with?

Please do not paste real secrets, customer data, or private company files into feedback.
```

## Links

- npm beta command: `npx --yes --package @denial-web/clawguard@beta clawguard --version`
- GitHub release: https://github.com/denial-web/clawguard/releases/tag/v1.0.0-beta.9
- Beta testing checklist: `docs/BETA_TESTING_CHECKLIST.md`
- Tester guide: `docs/FIVE_MINUTE_TESTER_KIT.md`
- External testing guide: `docs/EXTERNAL_TESTING.md`
