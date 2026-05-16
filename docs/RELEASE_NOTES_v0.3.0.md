# ClawGuard v0.3.0

This release upgrades **ClawGuard Agent** from a safe small runtime into a more useful governed agent.

The focus is practical capability without broad autonomous control: read-only git tools, task recipes, bundled procedural skills, memory search/proposals, configured read-only web access, and the first approval-gated GitHub integration.

## Added

- Added read-only `git.status`, `git.diff`, and `git.log` tools.
- Added task recipes: `project.inspect`, `release.prepare`, and `npm.package_check`.
- Added bundled governed skills: `project-cleanup`, `github-release`, and `npm-package-helper`.
- Added `clawguard agent skills show <name>`.
- Added `memory.search` and `memory.propose`; proposed memories create approval requests instead of silent writes.
- Added `clawguard agent memory search <query>`.
- Added configured read-only `web.search` and guarded `web.fetch`.
- Added GitHub tools for repo reads, local issue drafts, and approval-gated issue creation.
- Added `clawguard agent run --notify telegram --chat-id <id>` for approval and run-summary notifications.
- Expanded action proposal validation and safety eval fixtures for web, memory, and GitHub actions.

## Important

ClawGuard Agent v0.3.0 still does not ship browser clicking, form filling, payment actions, email/calendar writes, desktop control, or unrestricted app control. Browser/app actions remain proposal-only for external bridges.

External writes require approval. GitHub issue creation also requires an explicit repo allowlist in `.clawguard.json`.

## Try It

```bash
npx --yes --package @denial-web/clawguard@0.3.0 clawguard agent init
npx --yes --package @denial-web/clawguard@0.3.0 clawguard agent run --recipe project.inspect
npx --yes --package @denial-web/clawguard@0.3.0 clawguard agent skills show project-cleanup
npx --yes --package @denial-web/clawguard@0.3.0 clawguard agent memory search "release rules"
```

For local source checkout verification:

```bash
npm run safety:eval
npm test
NPM_CONFIG_CACHE=/private/tmp/clawguard-npm-cache npm pack --dry-run
```
