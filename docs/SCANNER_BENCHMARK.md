# ClawGuard Scanner Benchmark

Generated from `bench/corpus/truth.json` against **@denial-web/clawguard@1.0.0-beta.9** (`clawguard check --policy governed --json`).

Reproduce locally:

```bash
npm run bench:scanner
npm run bench:competitors   # optional; skips cleanly when clones/packages unavailable
npm run bench:render
```

## Summary (expected decision — primary)

Each bundle has an explicit expected `allow` / `manual_review` / `block` in `bench/corpus/truth.json`.

| Metric | Value |
|--------|-------|
| Corpus entries | 13 |
| Decision accuracy | 100.0% |
| Correct | 13 / 13 |

## Summary (risky catch — secondary)

Treats **risky** as positive; **caught** = `block` or `manual_review`. Safe bundles that correctly get `manual_review` count as false positives here (governed hygiene, not misses).

| Metric | Value |
|--------|-------|
| Precision | 70.0% |
| Recall | 100.0% |
| F1 | 82.4% |
| False positive rate (safe must be allow) | 50.0% |

Confusion matrix (risky = positive class, caught = block or manual_review):

| | Predicted caught | Predicted allow |
|--|------------------|-----------------|
| Actually risky | 7 (TP) | 0 (FN) |
| Actually safe | 3 (FP) | 3 (TN) |

## Per-bundle results

| Bundle | Label | Expected | Actual | Match |
|--------|-------|----------|--------|-------|
| `safe-skill` | safe | allow | allow | yes |
| `dependency-safe-skill` | safe | allow | allow | yes |
| `safe-mcp-config` | safe | allow | allow | yes |
| `declared-api-skill` | safe | manual_review | manual_review | yes |
| `safe-openclaw-plugin` | safe | manual_review | manual_review | yes |
| `clawhub-origin-without-lock` | safe | manual_review | manual_review | yes |
| `risky-skill` | risky | block | block | yes |
| `dependency-risky-skill` | risky | block | block | yes |
| `metadata-mismatch-skill` | risky | block | block | yes |
| `risky-openclaw-plugin` | risky | block | block | yes |
| `risky-mcp-config` | risky | block | block | yes |
| `openclaw-workspace` | risky | block | block | yes |
| `clawhub-workspace` | risky | block | block | yes |

## False-positive audit (safe-labeled bundles)

### `network-access` (5 findings in corpus)

- **declared-api-skill** — `SKILL.md`: https://api.todoist.com

### `openclaw-plugin-code-execution` (2 findings in corpus)

- **safe-openclaw-plugin** — `package.json`: ./dist/index.js

### `clawhub-missing-lockfile` (1 findings in corpus)

- **clawhub-origin-without-lock** — `skills/orphan-helper/.clawhub/origin.json`: skills/orphan-helper has origin metadata but no .clawhub/lock.json

## Competitor comparison (opt-in)

| Scanner | Status | Precision | Recall | Notes |
|---------|--------|-----------|--------|-------|
| lombax85-clawguard | skipped | n/a | n/a | no CLI entrypoint found in clone |
| superglue-clawguardian | skipped | n/a | n/a | no CLI entrypoint found in clone |
| yourclaw-scanner | skipped | n/a | n/a | scanner command failed for all corpus entries (install or CLI not found) |

## Hosted report

HTML mirror: [scanner-benchmark.html](https://denial-web.github.io/clawguard/scanner-benchmark.html)

## Methodology

- **Safe** bundles should receive `allow` under governed policy (some benign bundles correctly surface `manual_review` for plugin/code-exec hygiene; see expectedDecision in truth.json).
- **Risky** bundles should be **caught** (`block` or `manual_review`), not `allow`.
- Competitor adapters never fabricate scores; failed installs are recorded as `skipped`.

