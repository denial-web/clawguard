# Demo Script

Use this script for a short ClawShield demo, README GIF, launch post, or maintainer walkthrough.

## One-Minute Web Demo

Setup:

```bash
npm test
npm run web -- --port 4176
```

Open:

```text
http://127.0.0.1:4176
```

Talk track:

> ClawShield is a companion security layer for OpenClaw-style skills, ClawHub installs, MCP configs, and skill dependencies. Before trusting a skill, it gives you a local risk score, policy decision, evidence, and an HTML report you can share.

Click path:

1. Open the local web demo.
2. Click `Dependency Risk`.
3. Point at the score: `100`, `Critical`, `Block`.
4. Point at required actions: `Manual Review`, `Do Not Install`, `Pin Dependencies`.
5. Point at findings:
   - Install lifecycle script.
   - Direct Git dependency.
   - Missing lockfile.
   - Unpinned dependency.
   - Suspicious dependency name.
6. Click `Download HTML`.
7. Say:

> This report is self-contained. A maintainer can attach it to an issue, PR, or internal review without running the scanner again.

## Thirty-Second ClawHub Demo

Click path:

1. Click `ClawHub Drift`.
2. Point at source drift and version drift findings.
3. Say:

> ClawShield reads local ClawHub metadata and tells you when the installed skill no longer matches the lockfile or origin metadata.

## Thirty-Second Workspace Demo

Click path:

1. Click `Workspace Override`.
2. Point at duplicate skill and override findings.
3. Say:

> OpenClaw workspace precedence matters. ClawShield shows which skill wins and whether the winning copy is riskier.

## Paste Demo

Click path:

1. Click `Load sample`.
2. Click `Scan Paste`.
3. Point at the network declaration mismatch.
4. Say:

> Even a simple pasted `SKILL.md` can be checked for declared-versus-observed behavior before a user installs it.

## Folder Demo

Click path:

1. Click `Choose File` or `Skill Folder`.
2. Select a local skill folder.
3. Click `Scan Folder`.
4. Say:

> Folder scan is the real install-review workflow: choose a skill bundle, scan everything locally, and review evidence before trust.

## Demo Close

Use this close:

> ClawShield does not replace OpenClaw or ClawHub. It is the review layer around them: local, explainable, CI-friendly, and designed to make third-party skills safer to install.
