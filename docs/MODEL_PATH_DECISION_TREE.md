# ClawGuard Model Path Decision Tree

Use this when helping a teammate choose how an AI agent should think before installing skills, running tools, spending tokens, or touching sensitive workflows.

ClawGuard does not provide the model. It helps choose and gate the model path.

## Ask These Questions First

1. What framework are you protecting?
   - OpenClaw
   - Hermes Agent
   - PicoClaw
   - Cursor-only workflow
   - Other

2. What data might the agent see?
   - public demo data
   - internal notes
   - customer or employee data
   - payment, banking, KYC, fraud, or compliance data
   - camera, audio, child, location, robot, drone, or IoT data

3. What will the agent do?
   - read only
   - draft or recommend
   - install a skill
   - write local files
   - send messages externally
   - operate or configure a physical device
   - affect customer/account/payment/regulated decisions

4. What is available on this machine?
   - Node.js 20 or newer
   - internet access
   - local model runtime such as Ollama or LM Studio
   - API keys for cloud models
   - budget limit per task

## Recommended Paths

### Path A: Local-First

Choose this when:

- data is private or sensitive
- the team is testing locally
- internet/API keys are not ready
- speed and cost control matter more than top model quality

ClawGuard setup:

```bash
clawguard init --profile local-first
clawguard run-plan --skill ./candidate-skill --task "Install and run this skill" --privacy high --tool-risk medium
```

Cursor instruction:

```text
Use the local-first path. Prefer local models for private analysis. Do not send skill contents, customer data, secrets, camera data, or business files to external APIs unless the user explicitly approves.
```

### Path B: Cloud Balanced

Choose this when:

- data is not highly sensitive
- the user wants stronger reasoning
- API keys are available
- the task involves coding, setup, or integration

ClawGuard setup:

```bash
clawguard init --profile cloud-balanced
clawguard run-plan --skill ./candidate-skill --task "Install and run this skill" --privacy medium --tool-risk high
```

Cursor instruction:

```text
Use the cloud-balanced path. Ask before sending private files or secrets to any API. Use ClawGuard run-plan before installing skills or running tool-heavy workflows.
```

### Path C: Enterprise / Financial Sensitive

Choose this when:

- data includes customer, employee, payment, KYC, fraud, legal, HR, or compliance content
- the agent can write files, send external messages, or change workflow state
- the team needs audit logs and approval

ClawGuard setup:

```bash
clawguard init --profile financial-sensitive
clawguard action plan --type customer-impacting --data-class customer-pii --task "Review this customer support case"
clawguard action plan --type money-movement --data-class payment-data --task "Transfer customer funds"
```

Cursor instruction:

```text
Use the financial-sensitive path. Read, draft, and recommend are allowed only with evidence. Customer-impacting actions require approval. Money movement and final regulated decisions are blocked in this ClawGuard MVP.
```

### Path D: Physical Device Safety

Choose this when:

- the agent may work with cameras, microphones, drones, robots, toys, IoT, or industrial devices
- the task could affect the physical world

ClawGuard setup:

```bash
clawguard device plan --device-class drone --action drone-takeoff --task "Take off for outdoor inspection"
clawguard device plan --device-class security-camera --action record-media --data-class video-audio --task "Enable recording on storefront camera"
```

Cursor instruction:

```text
Use the physical-device safety path. Do not connect to or control real devices. Simulation, privacy review, operator approval, emergency stop, manual override, and rollback evidence must exist before any real-world action.
```

## Quick Decision Table

| Situation | Model Path | ClawGuard Profile | Default Decision |
| --- | --- | --- | --- |
| Public demo or simple read-only test | Local or cheap API | local-first | allow if low risk |
| Skill install with tool access | Strong API or reviewed local model | cloud-balanced | scan and review |
| Customer data or HR data | Local-first or approved private API | financial-sensitive | review / dual approval |
| Payment or banking action | No autonomous model action | financial-critical | block |
| Camera/audio/child/location data | Local-first first | physical-device-mvp | privacy review |
| Drone/robot movement | Simulator only | physical-device-mvp | block real actuation |

## Rule Of Thumb

If the model might see private data, spend money, install skills, write files, send messages, or affect the physical world, run a ClawGuard plan first.
