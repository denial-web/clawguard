# Model-agnostic governance — schema-compliance matrix

_Generated: 2026-05-29T07:35:37.961Z_

This matrix tests whether ClawGuard's governance envelope helps **independently of the underlying model**. For each base model X we run a paired comparison on the held-out-2 prompt set:

- **ClawGuard (governed envelope)** = ClawGuard live runtime wrapping X
- **Reference baseline B** = the same model X, ungoverned

Because both sides use the **same base model**, the comparison isolates what the governance contract contributes rather than which vendor's model is stronger. An LLM judge scores each response for governance-schema compliance under symmetric blinding at temperature 0.

**Judge:** anthropic / claude-opus-4-8 (held constant across all rows). Decisive comparisons exclude ties; the p-value is a two-sided binomial test on decisive wins.

| Base model | Provider | n | A wins (governed) | B wins (bare) | Ties | A win-rate | p-value | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deepseek-v4-flash` | deepseek | 15 | 8 | 5 | 2 | 53% | 0.4054 | Directionally higher schema-compliance rate for Model A (not significant) |
| `gpt-5-chat-latest` | openai | 15 | 3 | 2 | 10 | 20% | 0.6547 | Directionally higher schema-compliance rate for Model A (not significant) |

## How to read this

- **A wins** = the governed envelope produced a more schema-compliant governance response than the bare model for that prompt; **B wins** = the bare model did.
- A consistent A-advantage **across different providers** is the signal that matters: it means the improvement comes from the governance layer, not from a single model.
- Bold p-values are statistically significant (< 0.05). With n=15 per model, single-model results are directional; the **pattern across rows** is the robust finding.

## Honest framing

- This is **not** a leaderboard of model quality and not a claim that any vendor's model is worse. Every row compares a model **against itself** (governed vs ungoverned).
- The judge rewards adherence to ClawGuard's governance JSON schema, which the governed side is explicitly built to emit. Treat this as evidence the envelope is **model-portable**, not as a general capability benchmark.
- Model names are shown for reproducibility only. Do not paraphrase these results as "ClawGuard beats <vendor>".

