# ClawGuard beta tester announcement

Paste into Telegram, Discord, Slack, LinkedIn, GitHub Discussions, or a direct message.

**ClawGuard** = explainable governance for AI agents and the skills/tools they use. Two parts, usable independently:

- **Core** — scan/gate skills and MCP configs before install (`scan`, `gate`, `check`)
- **Agent** — optional governed runtime with approvals, audit, blast-radius (`agent`, `explain`)

Terms: [GLOSSARY.md](GLOSSARY.md). Full index: [README.md](README.md).

## Short version (Agent, ~5 min)

```text
Looking for early testers for ClawGuard v1.0.0-beta.10.

ClawGuard governs AI agents and third-party skills: risky actions go through policy, approval, backup, and audit — not silent execution. Blast Radius Explain shows what a shell command could damage before it runs.

5-minute test (no real DB needed):

mkdir -p ~/clawguard-beta-test && cd ~/clawguard-beta-test
npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard agent init
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"
npx --yes --package @denial-web/clawguard@beta clawguard explain -- psql -c "DROP DATABASE prod"

Expected:
- version: 1.0.0-beta.10
- DROP DATABASE: approval_required / critical
- explain: high-impact blast radius + safer alternatives

Reply with:
1. Did install work?
2. Did the DB command require approval?
3. Anything feel like it could run without permission?
4. What confused you?
```

**Evidence (honest):** on dangerous actions in our policy benchmark (n=50), ClawGuard gated 100% (0% unsafe auto-exec) and did not flip under adversarial task-pressure prose; bare LLM gatekeepers can. Details: [AGENT_POLICY_ENFORCEMENT.md](AGENT_POLICY_ENFORCEMENT.md). Install-time scanner: [SCANNER_BENCHMARK.md](SCANNER_BENCHMARK.md).

## Short version (Core scanner, ~3 min)

For people who only install skills, not a full agent:

```text
Quick ClawGuard Core test — scan a skill before install:

git clone https://github.com/denial-web/clawguard.git /tmp/clawguard
npx --yes --package @denial-web/clawguard@beta clawguard scan /tmp/clawguard/examples/risky-skill

Expected: CRITICAL risk (remote code / harmful patterns).

Optional: clawguard gate /tmp/clawguard/examples/risky-skill --policy governed

Did the risk report make sense? What would you need before trusting a ClawHub skill?
```

## Longer version (Agent)

```text
Early testers wanted for ClawGuard Agent (beta.10).

ClawGuard is explainable governance for AI agents. The optional Agent runtime can inspect projects and propose work, but file writes, shell, protected assets, memory, and external actions are supposed to pass policy, approval, backup, and audit first.

This beta tests a concrete failure mode:

"What if an agent tries to delete a database, backup, or secrets file to finish another task?"

Protected assets include .env, secrets/, data/, .db/.sqlite/.sql/.dump/.bak, backups, and destructive DB/shell patterns.

mkdir -p ~/clawguard-beta-test && cd ~/clawguard-beta-test
npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard agent init
npx --yes --package @denial-web/clawguard@beta clawguard agent protected check --argv "psql,-c,DROP DATABASE prod"
npx --yes --package @denial-web/clawguard@beta clawguard explain -- psql -c "DROP DATABASE prod"

Optional cleanup demo (after init in a throwaway folder):

mkdir -p data dist
printf 'sqlite-placeholder\n' > data/prod.sqlite
printf 'generated\n' > dist/app.js
npx --yes --package @denial-web/clawguard@beta clawguard agent run "inspect this project and propose safe cleanup"

Please report:
1. Install/init OK?
2. Destructive DB check blocked or required approval?
3. Cleanup waited for approval?
4. Output understandable?
5. What workflow would you use this for?

Do not paste real secrets or customer data in feedback.
```

## Links

- npm: `npx --yes --package @denial-web/clawguard@beta clawguard --version`
- Repo: https://github.com/denial-web/clawguard
- Five-minute kit: [FIVE_MINUTE_TESTER_KIT.md](FIVE_MINUTE_TESTER_KIT.md)
- Checklist: [BETA_TESTING_CHECKLIST.md](BETA_TESTING_CHECKLIST.md)
- Demo Space: see [HUGGINGFACE.md](HUGGINGFACE.md)
