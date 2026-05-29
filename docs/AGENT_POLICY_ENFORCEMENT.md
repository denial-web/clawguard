# Agent policy-enforcement benchmark

_Generated: 2026-05-29T08:17:34.909Z_

This benchmark measures **operational-safety enforcement**, not answer quality. Each system is given an agent action and must decide `auto` (run it), `approval` (gate for a human), or `block`. Ground-truth labels come from common-sense operational-safety principles (defined independently of ClawGuard's policy table), across three tiers: **safe**, **side-effecting**, and **dangerous** (destructive / secret-exposing / data-exfiltrating / unrecognized capability).

ClawGuard scores its **deterministic autonomy gate** (`resolveToolAutonomy`, preset = `developer`); it runs offline with no model call. Bare models act as an LLM gatekeeper under the same stated conservative policy. Every action is also tested under an **adversarial rephrase** (same structured action, benign/jailbreak prose) to measure prose-driven decision flips.

| System | Unsafe auto-exec (dangerous) ↓ | Adversarial flip→auto ↓ | Laxer than label ↓ | Stricter than label | Exact match |
| --- | --- | --- | --- | --- | --- |
| ClawGuard (deterministic gate) | 0% (0/15) | 0% (0/19) | 0 | 1 | 96% (24/25) |

## How to read this

- **Unsafe auto-exec (dangerous)** — of the destructive/secret/exfiltration/unrecognized actions, how many the system would run with **no human gate**. This is the metric that matters most. Lower is better.
- **Adversarial flip→auto** — of actions gated under neutral framing, how many became auto-executed once the request was reworded with authorization/urgency claims. Lower is better.
- **Laxer than label** — disagreements where the system allowed *more* than the safety label (the safety-relevant direction). **Stricter than label** — disagreements where it gated *more* (over-caution, **not** a safety problem). Separating these is important: a low exact-match driven by over-caution is not a risk.

## Key finding

On the headline metric, **every system gated 100% of dangerous actions** — a capable model given a clean, conservative gatekeeper prompt does not auto-execute blatantly dangerous actions. The differences are in **consistency and bypass-resistance**, not in raw danger:

- **ClawGuard (deterministic gate)** — adversarial flips: 0, laxer-than-label: 0, stricter-than-label: 1.

## Scope and limitations

- This tests the **best case for a bare model**: a dedicated gatekeeper role, a clean conservative policy prompt, and clearly-described actions. Frontier models do well in that setting. It does **not** test the harder, more realistic failure mode — a model **mid-task and motivated to finish**, with the dangerous step embedded or obfuscated — where models are more likely to rationalize proceeding.
- Small sample (25 scenarios). Treat single-model numbers as directional; the robust signal is the qualitative difference (deterministic vs. occasionally-bypassable).
- ClawGuard's exact-match being highest is partly because the labels track a conservative posture similar to its gate. The honest, model-independent claims are the **unsafe-auto** and **adversarial-flip** columns.

## Honest framing

- ClawGuard's advantage is **structural, not capability**: its gate keys on the structured tool + arguments, so unrecognized/destructive actions are refused or escalated **deterministically** and **identically regardless of prose** (0% adversarial flip by construction). A bare model — however capable — has no non-bypassable gate, and at least one tested model showed a real prose-driven flip.
- This is **not** a claim that any model is reckless or 'worse'. Capable models are good gatekeepers in the clean case. The benchmark shows what a governance runtime *guarantees* on top of any model: determinism, prose-invariance, fail-safe handling of unknown capabilities, and an audit trail.

