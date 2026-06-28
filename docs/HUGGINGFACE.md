# Hugging Face Integration

ClawGuard's main release channels are GitHub and npm. Hugging Face is best used
as a public demo and discovery surface:

- A Gradio Space for a safe, hosted safety demo.
- An optional dataset for safety eval fixtures.
- A collection later if you publish role packs, SOP packs, and demos.

The hosted Space must not pretend to govern a visitor's real local filesystem.
It should explain and demonstrate ClawGuard's safety model, then send users to
npm for real local installation.

## Prerequisites

Install and authenticate the Hugging Face CLI:

```bash
curl -LsSf https://hf.co/cli/install.sh | bash -s
hf auth login
hf auth whoami
```

Use a token from <https://huggingface.co/settings/tokens>. A write token is
enough for creating and uploading Spaces/datasets under your account.

## Publish the Demo Space

Choose your namespace and repo name:

```bash
export HF_NAMESPACE="<your-huggingface-username>"
export HF_SPACE="$HF_NAMESPACE/clawguard-safety-demo"
```

Create the Space:

```bash
hf repos create "$HF_SPACE" --type space --space-sdk gradio --exist-ok
```

Upload the local Space files:

```bash
hf upload "$HF_SPACE" hf-space --type space \
  --commit-message "Add ClawGuard safety demo Space"
```

Then open:

```text
https://huggingface.co/spaces/<your-huggingface-username>/clawguard-safety-demo
```

## What the Space Includes

The files live in `hf-space/`:

```text
hf-space/
  README.md
  app.py
  requirements.txt
```

The demo shows:

- local npm install commands,
- skill/prompt-injection risk signals,
- protected path and destructive shell previews,
- memory-policy examples such as rule downgrade and provenance mismatch.

It does not:

- read local files,
- execute shell commands,
- collect API keys or tokens,
- create issues, payments, emails, calendar events, or external writes.

## Optional Safety Eval Dataset

You can also publish the deterministic safety cases as a Hugging Face dataset.
This is useful for transparency and for comparing future ClawGuard versions.

```bash
export HF_DATASET="$HF_NAMESPACE/clawguard-safety-evals"

hf repos create "$HF_DATASET" --type dataset --exist-ok
hf upload "$HF_DATASET" safety_eval/fixtures/agent_safety.jsonl --type dataset \
  --commit-message "Add ClawGuard agent safety eval fixture"
hf upload "$HF_DATASET" safety_eval/README.md --type dataset \
  --commit-message "Add safety eval README"
```

Suggested dataset card summary:

~~~md
# ClawGuard Safety Evals

Deterministic JSONL regression cases for ClawGuard Agent safety behavior,
including protected assets, shell proposals, web/browser boundaries, GitHub
writes, and governed memory candidates.

Run locally:

```bash
npm run safety:eval
```
~~~

## Recommended Hugging Face Positioning

Use this language in the Space description:

> ClawGuard is a local governed AI agent runtime. This Space demonstrates the
> safety model, protected asset policy, and approval-gated memory behavior. For
> real use, install ClawGuard locally with npm.

Avoid saying the Space is the full product. The full product needs local
workspace access and local approval/audit files.

## Update Checklist

When publishing a new ClawGuard beta:

1. Update `hf-space/app.py` if demo examples or install commands changed.
2. Run `python3 -m py_compile hf-space/app.py`.
3. Run `npm run safety:eval`.
4. Upload `hf-space/` to the Space.
5. Upload updated `safety_eval/fixtures/agent_safety.jsonl` to the dataset if
   safety cases changed.

## Space Smoke Test

After upload, open:

```text
https://huggingface.co/spaces/<your-huggingface-username>/clawguard-safety-demo
```

The Space is good enough for public beta if these checks pass:

| Tab | Input | Expected result |
| --- | --- | --- |
| Install locally | profile `business`, protected path `data/prod.sqlite` | Shows `setup-ui`, `protected add`, `protected check`, and `agent run` commands. |
| Skill risk demo | `Safe skill` | `decision: allow`, low risk or no critical findings. |
| Skill risk demo | `Prompt injection + remote install` | `decision: block`, critical findings. |
| Protected assets | path `.env`, operation `read` | `decision: approval_required`, protected `true`. |
| Protected assets | path `data/prod.sqlite`, operation `write` | `decision: approval_required`, risk `critical`. |
| Protected assets | shell argv `psql,-c,DROP DATABASE prod` | `decision: approval_required`, risk `critical`. |
| Protected assets | shell argv `rm,-rf,.` | `decision: block`, hard-shell finding. |
| Memory policy | `Low-risk preference` | `decision: allow`. |
| Memory policy | `Rule downgrade attempt` | `decision: approval_required`. |
| Memory policy | `Exact statement provenance mismatch` | `decision: approval_required`, includes `provenance-mismatch`. |
| Memory policy | `Prompt injection memory` | `decision: block`. |

The Space is smart enough for discovery if a first-time visitor understands
three things in under one minute:

1. ClawGuard is installed locally with npm.
2. The hosted Space is only a safe demo, not the full local agent.
3. ClawGuard distinguishes allow, approval-required, and block instead of
   treating every risky action the same.
