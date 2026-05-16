# ClawGuard Cursor USB Handoff

This guide is for a teammate who receives ClawGuard on a USB drive and wants Cursor to help set it up.

## What Is In The USB Kit

Expected folder:

```text
clawguard-usb-kit-vX.Y.Z/
├── README_FIRST.md
├── CURSOR_SETUP_PROMPT.md
├── MODEL_PATH_DECISION_TREE.md
├── TEAM_TEST_CHECKLIST.md
├── packages/
│   └── denial-web-clawguard-X.Y.Z.tgz
├── docs/
├── configs/
└── examples/
```

The npm package tarball is enough to install ClawGuard without cloning the GitHub repo.

## Minimum Requirements

- Node.js 20 or newer
- npm
- Cursor
- Optional: internet access
- Optional: OpenClaw, Hermes Agent, or PicoClaw already installed
- Optional: local model runtime such as Ollama or LM Studio
- Optional: API model key

## If The PC Has Internet

Run from any folder outside the ClawGuard source repo:

```bash
npx --yes --package @denial-web/clawguard@0.4.0 clawguard --version
npx --yes --package @denial-web/clawguard@0.4.0 clawguard demo quickstart
```

## If The PC Has No Internet

From the USB kit folder:

```bash
npm install -g ./packages/denial-web-clawguard-0.4.0.tgz
clawguard --version
clawguard demo quickstart
```

If global install is not allowed:

```bash
TARBALL="$(pwd)/packages/denial-web-clawguard-0.4.0.tgz"
npx --yes --package "$TARBALL" clawguard --version
npx --yes --package "$TARBALL" clawguard demo quickstart
```

## Ask Cursor To Help

Open Cursor in the USB kit folder, then paste the contents of `CURSOR_SETUP_PROMPT.md`.

Cursor should:

1. Check Node.js and npm.
2. Confirm whether the user wants internet install or USB tarball install.
3. Ask which framework to protect: OpenClaw, Hermes Agent, PicoClaw, Cursor-only, or other.
4. Ask which model path to use: local-first, cloud-balanced, financial-sensitive, or physical-device safety.
5. Run the quickstart demo.
6. Run `clawguard setup --framework <choice>` if the user chooses OpenClaw, Hermes Agent, or PicoClaw.
7. Avoid changing real agent folders until the user approves.

## Framework Setup Commands

OpenClaw:

```bash
clawguard setup --framework openclaw
```

Hermes Agent:

```bash
clawguard setup --framework hermes
```

PicoClaw:

```bash
clawguard setup --framework picoclaw
```

If the user already has a trusted skill folder:

```bash
clawguard setup --framework openclaw --install-dir /path/to/trusted/skills
```

Change `openclaw` to `hermes` or `picoclaw` as needed.

## Model Path Setup Commands

Local-first:

```bash
clawguard init --profile local-first
```

Cloud balanced:

```bash
clawguard init --profile cloud-balanced
```

Financial sensitive:

```bash
clawguard init --profile financial-sensitive
```

Financial critical:

```bash
clawguard init --profile financial-critical
```

Physical device dry-run:

```bash
clawguard device plan --device-class drone --action drone-takeoff --task "Take off for outdoor inspection"
```

## First Test Checklist

```bash
clawguard --version
clawguard demo quickstart
clawguard sop list
clawguard device plan --device-class drone --action drone-takeoff --task "Take off"
```

Expected:

- version prints `0.4.0`
- quickstart demo says `Ready: yes`
- risky skill scan says `BLOCK / CRITICAL`
- drone takeoff says `BLOCK`

## Safety Rules

- Do not paste real API keys, private keys, passwords, customer data, bank data, or private business files into public issues or chat.
- Do not connect ClawGuard to real drones, cameras, robots, toys, or IoT devices during first setup.
- Do not allow autonomous money movement, final KYC decisions, fraud case closure, card changes, account freezing, or loan approval.
- Treat ClawGuard as a local guardrail and evidence layer, not a replacement for legal, compliance, or security review.
