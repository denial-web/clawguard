# ClawGuard Agent Safety Eval

This lightweight harness adapts the useful Sidekick-OS idea of a deterministic safety regression suite, without adding a server or database dependency.

Run:

```bash
npm run safety:eval
```

The default fixture lives at `safety_eval/fixtures/agent_safety.jsonl` and covers:

- agent route classification
- local/mobile action proposal validation
- argv-only shell proposal rules
- scanner detection for suspicious skill instructions

The report is written to `safety_eval/out/latest.json`.
