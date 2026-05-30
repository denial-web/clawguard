# Contributing to ClawGuard

Thanks for helping improve ClawGuard. This repo has two product parts you can work on independently:

- **ClawGuard Core** — static scanner, policy gate, install wrapper, monitor (`src/scanner`, gate paths in `src/cli.js`, GitHub Action).
- **ClawGuard Agent** — governed runtime (`src/agent/`).

See [docs/GLOSSARY.md](docs/GLOSSARY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for terminology.

## Setup

```bash
git clone git@github.com:denial-web/clawguard.git
cd clawguard
npm install
```

## Quality bar

```bash
npm test          # Node test runner (full suite)
npm run lint      # ESLint: src/, scripts/, selected bench/test paths
```

CI runs the same checks on push (`.github/workflows/ci.yml`).

When changing scanner or gate behavior, add or extend tests under `test/`. When changing the autonomy gate, see `test/agent-gate-bypass.test.js` and `test/agent-policy-enforcement.test.js`.

## Benchmarks (optional)

```bash
npm run bench                      # scanner benchmark
npm run bench:agent:policy:combined  # policy enforcement (clean + pressure)
npm run bench:agent:full           # agent schema benchmark (may need agent serve)
```

Reports live under `docs/` (e.g. `SCANNER_BENCHMARK.md`, `AGENT_POLICY_ENFORCEMENT.md`). Regenerating overwrites those files — commit only when you intend to refresh published numbers.

## Project layout

| Path | Role |
| --- | --- |
| `src/cli.js` | CLI entry (large; refactor deferred) |
| `src/agent/` | Agent runtime, autonomy gate, blast-radius |
| `src/scanner/` | Core static analysis |
| `scripts/` | Benchmark runners, build helpers |
| `bench/` | Labeled corpus and agent-policy scenarios |
| `test/` | Tests |
| `docs/` | Public documentation |
| `docs/internal/` | Maintainer working docs (not shipped on npm) |

## Documentation

- Public index: [docs/README.md](docs/README.md)
- Do not link maintainer docs from user-facing README sections; they live in `docs/internal/`.

## Pull requests

- One logical change per PR when possible.
- Keep framing consistent: ClawGuard = umbrella; Core = scan/gate; Agent = optional runtime.
- No need to edit `.cursor/plans/` files.

## License

By contributing, you agree your contributions are licensed under the project MIT license.
