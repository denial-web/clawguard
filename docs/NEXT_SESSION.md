# Next Session Checkpoint

Saved: 2026-05-21

## Current Status

ClawGuard v1.0.0-beta.7 is prepared for release and locally smoke-tested.

- GitHub repo: `https://github.com/denial-web/clawguard`
- npm package: `@denial-web/clawguard@beta`
- Current beta version: `1.0.0-beta.7`
- GitHub release: `v1.0.0-beta.7`
- Hugging Face Space: `https://denialkhmbot-clawguard-safety-demo.hf.space`
- npm beta smoke test: pending after publish
- Blast Radius Explain smoke test: passed
- Doctrine Lab export smoke test: passed
- Setup UI smoke test: passed
- Hugging Face runtime fix: pushed and uploaded

## Last Known Good Commands

Inside the ClawGuard repo:

```bash
cd /Users/hy/CascadeProjects/ClawGuard
node src/cli.js --version
node src/cli.js explain -- psql -c "DROP DATABASE prod"
node src/cli.js explain -- git status
node src/cli.js agent doctrine export --out /tmp/clawguard-doctrine-import.json
node --test test/blast-radius.test.js
node --test test/agent-beta7-channel.test.js
node --test test/agent-doctrine-lab.test.js
npm run safety:eval
npm test
```

Outside the repo:

```bash
npx --yes --package @denial-web/clawguard@beta clawguard --version
npx --yes --package @denial-web/clawguard@beta clawguard explain -- psql -c "DROP DATABASE prod"
npx --yes --package @denial-web/clawguard@beta clawguard explain -- git status
npx --yes --package @denial-web/clawguard@beta clawguard setup-ui
```

Expected:

- version prints `1.0.0-beta.7`
- destructive database explain returns `approval_required`, `critical`, and `protected-shell-execution`
- read-only `git status` explain returns `allow` and `low`
- setup UI binds to `127.0.0.1` and reports protected asset defaults
- Doctrine Lab export writes a local import payload with `source=clawguard` and `source_runtime=clawguard:beta7`

## Current Priority

Beta.7 is the Inter-Component Channel Threat Model plus the Doctrine Lab safety-trace export path. Do not build Data Broker or multi-component mode until the channel threat model is accepted.

Primary artifact:

- [INTER_COMPONENT_CHANNEL_THREAT_MODEL.md](INTER_COMPONENT_CHANNEL_THREAT_MODEL.md)

Supporting contract:

- [inter-component-message.schema.json](../schemas/inter-component-message.schema.json)

## Next Best Step

Publish beta.7, then use Doctrine Lab to review exported safety traces and keep hardening the beta.7 channel tests.

Recommended order:

1. Send [INTER_COMPONENT_CHANNEL_THREAT_MODEL.md](INTER_COMPONENT_CHANNEL_THREAT_MODEL.md) to Opus for review.
2. Add negative tests for forged provenance and planner-to-executor bypass.
3. Add expected-fail test scaffolds for Data Broker composition attacks.
4. Decide the beta.8 Data Broker shape list and query-budget model.
5. Keep business-agent/role-worker upgrades deferred until the governance channel is harder to bypass.

## Product Positioning

Use this framing:

```text
ClawGuard is separation of duties for AI agents.
LLMs propose. Policy decides. Security vetoes. Execution obeys policy only.
```

Do not lead with "more autonomous than Hermes/Manus." Lead with governed autonomy, blast-radius explanation, protected assets, approval gates, deterministic critic checks, and audit.

## Known Follow-Ups

- Add explicit destructive command families to Blast Radius Explain: `terraform destroy`, `git push --force`, cloud deletes, package publish/unpublish, process control, privilege-bit changes.
- Resolve symlink workspace boundary checks before high-security claims.
- Decide whether `auditReady` should mean "auditable output" or "audit event written."
- Unify `manual_review` and `approval_required` vocabulary.
- Design approval batching and staleness rules before multi-component mode.
