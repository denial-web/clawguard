# Budget Governance

ClawGuard budget checks add a cost and token gate before an agent makes a model call.

This is intentionally provider-neutral. ClawGuard does not hardcode Gemini, OpenAI, Anthropic, local, or other provider prices because model pricing changes over time. Users should pass current pricing at the CLI or store approved pricing in `.clawguard.json`.

## CLI Pricing

```bash
clawguard budget check \
  --provider example \
  --model example-model \
  --input-tokens 12000 \
  --output-tokens 2000 \
  --input-usd-per-1m 0.25 \
  --output-usd-per-1m 1.25 \
  --approval-usd 0.01 \
  --max-usd 0.05
```

Exit codes:

- `0`: allow.
- `1`: manual review required.
- `2`: block.

## Config Pricing

```json
{
  "budgets": {
    "approvalRequestUsd": 0.05,
    "maxRequestUsd": 0.25,
    "maxTotalTokens": 100000
  },
  "models": [
    {
      "provider": "example",
      "model": "example-model",
      "inputUsdPer1M": 0.25,
      "outputUsdPer1M": 1.25
    }
  ]
}
```

Then:

```bash
clawguard budget check \
  --provider example \
  --model example-model \
  --input-tokens 12000 \
  --output-tokens 2000
```

## Audit Log

Append budget decisions for later review:

```bash
clawguard budget check \
  --provider example \
  --model example-model \
  --input-tokens 12000 \
  --output-tokens 2000 \
  --input-usd-per-1m 0.25 \
  --output-usd-per-1m 1.25 \
  --audit-log ./.clawguard/budget.jsonl
```

Each audit line uses `schemaVersion: "clawguard.budget.v1"`.

## Current Scope

This first budget gate estimates planned usage. It does not yet read live provider billing APIs or intercept every runtime call automatically. For OpenClaw, Hermes Agent, or other runtimes, wire this command before high-cost planning, search expansion, summarization, tool calls, or skill execution steps where token counts can be estimated.

Future integrations can feed actual usage telemetry into the same schema and compare it against daily, monthly, project, or user-level budgets.
