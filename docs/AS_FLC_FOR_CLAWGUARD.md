# A-S-FLC For ClawGuard Agent

ClawGuard adapts A-S-FLC as a deterministic decision spine for governed agent work.

A-S-FLC should not make the agent more reckless. Its job is to make downside visible before the agent acts.

## What Carries Over

A-S-FLC's useful rule for ClawGuard is:

```text
exact positive value
- estimated negative value with conservative uncertainty buffer
= stable net decision signal
```

For agent work, that means the model can describe possible benefits, but ClawGuard still buffers the downside before choosing a route.

## Decision Routes

ClawGuard maps A-S-FLC decisions into operational routes:

| Route | Meaning |
| --- | --- |
| `LOCAL` | The agent may prepare, summarize, draft, or inspect locally. |
| `VERIFY_FIRST` | The agent must check assumptions before acting. |
| `APPROVAL_REQUIRED` | The action can affect customers, money, reputation, policy, memory, or external state. |
| `ESCALATE` | The action needs owner, legal, compliance, or specialist authority. |
| `BLOCK` | The downside is forbidden, deceptive, unsafe, or higher than the exact positive value. |

This keeps the A-S-FLC asymmetry aligned with ClawGuard's product identity: autonomy is useful only when risky actions remain governed.

## Where It Fits

The first implementation lives in:

- `src/agent/asflc.js`
- `src/agent/role-intelligence.js`
- `role-packs/small-business/cafe/marketing-manager.json`

The same spine can later support:

- memory write decisions
- tool/action routing
- campaign and business recommendations
- recipe planning
- approval escalation

## Rule For Memory

A-S-FLC must never write durable memory directly.

When a decision suggests learning something persistent, the route is:

```text
memory.propose -> approval if needed -> audit -> durable memory
```

That preserves ClawGuard's governed memory policy.

## Beta Boundary

This is not a new LLM wrapper and not a replacement for ClawGuard's existing planner. It is a reusable scoring and routing layer. Role packs provide structured domain knowledge; the A-S-FLC evaluator decides whether each role action is local, verify-first, approval-required, escalated, or blocked.
