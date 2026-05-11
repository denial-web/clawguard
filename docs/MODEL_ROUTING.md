# Model Routing

ClawGuard model routing recommends which model profile an agent should use before a task runs.

The first version is deliberately explainable. It uses task text, optional task type, privacy level, tool risk, token estimate, configured model profiles, and budget policy. A later router can ask a small or strong LLM to classify ambiguous work, but the default path should stay auditable.

## Command

```bash
clawguard model recommend \
  --task "Install a third-party skill and connect Telegram" \
  --privacy medium \
  --tool-risk high \
  --input-tokens 12000 \
  --output-tokens 2000
```

Exit codes:

- `0`: recommended model is allowed.
- `1`: manual approval or configuration is needed.
- `2`: model spend or token policy blocks the request.

## Config

```json
{
  "budgets": {
    "approvalRequestUsd": 0.05,
    "maxRequestUsd": 0.25
  },
  "models": [
    {
      "provider": "example",
      "model": "cheap-model",
      "inputUsdPer1M": 0.05,
      "outputUsdPer1M": 0.1
    },
    {
      "provider": "example",
      "model": "strong-model",
      "inputUsdPer1M": 1,
      "outputUsdPer1M": 2
    }
  ],
  "modelRouting": {
    "defaultProfile": "cheap",
    "approvalProfiles": ["premium"],
    "longContextTokens": 64000,
    "premiumContextTokens": 180000,
    "profiles": {
      "local": {
        "model": "ollama/llama3.3",
        "fallbacks": ["example/cheap-model"]
      },
      "cheap": {
        "model": "example/cheap-model",
        "fallbacks": ["example/strong-model"]
      },
      "strong": {
        "model": "example/strong-model",
        "fallbacks": ["example/premium-model", "example/cheap-model"]
      },
      "premium": {
        "model": "example/premium-model",
        "approvalRequired": true,
        "fallbacks": ["example/strong-model"]
      }
    }
  }
}
```

Use real provider/model refs and current provider pricing in your own config. The examples intentionally use placeholder provider names.

## Routing Signals

ClawGuard currently favors:

- `local` for high-privacy work.
- `cheap` for simple summarization, extraction, rewriting, translation, and classification.
- `strong` for coding, security review, skill install, agent control, architecture, and tool-heavy tasks.
- `premium` for very large context, deep research, migration, strategy, or configured premium-only work.

If model pricing matches the selected `provider/model`, ClawGuard also runs a budget check. Budget decisions can upgrade the model recommendation to `manual_review` or `block`.

## Why This Helps OpenClaw and Hermes Workflows

Agent runtimes should not need to hardcode one model for every task. ClawGuard can sit before the run and produce a recommendation:

```text
task request
      ↓
ClawGuard model recommend
      ↓
local / cheap / strong / premium
      ↓
budget and approval decision
      ↓
agent runs with selected model
```

This keeps search and automation flexible while making cost, privacy, and tool risk visible before the task starts.
