# Release notes — v1.0.0-beta.10

Documentation and packaging clarity release. No intentional behavior changes to scanner or agent gates.

## Highlights

- Unified **ClawGuard Core vs ClawGuard Agent** framing across README, `package.json`, Hugging Face Space README, and [ARCHITECTURE.md](../ARCHITECTURE.md).
- README restructure: two-path navigation, benchmarks after Core Commands, CI badge, quality section, [GLOSSARY.md](../GLOSSARY.md).
- Maintainer working docs moved to `docs/internal/` (no longer included in npm `docs/*.md` pack).
- New [CONTRIBUTING.md](../../CONTRIBUTING.md) and expanded [docs/README.md](../README.md) index.
- ESLint covers `scripts/**/*.{js,mjs}`.
- Refreshed [BETA_TESTER_ANNOUNCEMENT.md](../BETA_TESTER_ANNOUNCEMENT.md) and [FIVE_MINUTE_TESTER_KIT.md](../FIVE_MINUTE_TESTER_KIT.md) for outreach.

## Upgrade

```bash
npx --yes --package @denial-web/clawguard@beta clawguard --version
```

Expected: `1.0.0-beta.10`.

## Verify

```bash
npm test
npm run lint
```
