# Cursor Setup Prompt For ClawGuard USB Kit

Paste this into Cursor after opening the USB kit folder.

```text
You are helping me install and test ClawGuard from this USB handoff kit.

Important:
- Do not run destructive commands.
- Do not edit real OpenClaw, Hermes Agent, PicoClaw, Cursor, or system folders until I approve.
- Do not send secrets, private keys, tokens, customer data, camera/audio data, or proprietary files to external APIs without asking me first.
- Prefer the local package tarball in ./packages if internet is not available.

First, inspect this folder and find:
- README_FIRST.md
- MODEL_PATH_DECISION_TREE.md
- packages/denial-web-clawguard-*.tgz

Then ask me these setup questions one at a time:
1. Do you want online npm install or offline USB tarball install?
2. Which framework should ClawGuard protect: OpenClaw, Hermes Agent, PicoClaw, Cursor-only, or other?
3. Which model path should we use: local-first, cloud-balanced/API, financial-sensitive, or physical-device safety?
4. Do you have a real trusted skill folder already, or should we create a test workspace?
5. Do you want approval messages through Telegram/WhatsApp later, or local approval logs only for now?

After I answer:
- Check `node --version` and confirm Node.js 20 or newer.
- Install or run ClawGuard using the USB tarball if offline.
- Run `clawguard --version`.
- Run `clawguard demo quickstart`.
- If I chose a framework, run `clawguard setup --framework <openclaw|hermes|picoclaw>` in a test workspace first.
- If I chose local-first, run `clawguard init --profile local-first`.
- If I chose cloud-balanced/API, run `clawguard init --profile cloud-balanced` and remind me not to paste secrets into chat.
- If I chose financial-sensitive, run `clawguard init --profile financial-sensitive` and explain that money movement and final regulated decisions are blocked in the MVP.
- If I chose physical-device safety, run a dry-run device plan only; do not connect to real devices.

Finally, summarize:
- commands run
- whether the quickstart demo passed
- where ClawGuard config was created
- what command I should run next
- any warning or blocker
```
