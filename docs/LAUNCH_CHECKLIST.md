# Launch Checklist

Use this before sharing ClawShield publicly.

## Product Readiness

- [x] `npm test` passes.
- [x] `npm run web` starts locally.
- [x] Paste scan works.
- [x] Folder scan works.
- [x] Example scans work for safe, risky, ClawHub, dependency, workspace, and MCP cases.
- [x] HTML report download works.
- [x] JSON copy works or fails gracefully when browser clipboard permission is blocked.
- [x] README Quick Start is accurate.
- [x] Security model and limitations are clear.

## Demo Assets

- [x] Record a short web demo video.
- [x] Capture a screenshot of the `Dependency Risk` scan.
- [x] Capture a screenshot of the downloaded HTML report.
- [x] Add screenshot or GIF links to README.
- [x] Prepare a 30-second demo script from [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md).
- [x] Add repeatable demo capture command.

## GitHub Repository

- [ ] Repo description: `Governance and security scanner for OpenClaw skills, ClawHub installs, MCP configs, and skill dependencies.`
- [ ] Topics: `openclaw`, `clawhub`, `mcp`, `security`, `ai-agents`, `scanner`, `governance`, `supply-chain`.
- [x] License is visible.
- [x] Security policy is visible.
- [x] GitHub Action example is documented.
- [x] Rule catalog is documented.
- [x] Bug report issue template is available.
- [x] Fixture submission issue template is available.
- [x] Pull request template is available.
- [x] v0.1.0 release notes are drafted.
- [x] Package metadata and npm package contents are validated.

## First Launch Post

Suggested post:

> I am building ClawShield, a companion governance/security scanner for OpenClaw-style skills, ClawHub installs, MCP configs, and skill dependencies. It gives a local risk score, policy decision, evidence, and shareable HTML report before you trust a third-party skill.

Include:

- One screenshot or GIF.
- Link to README.
- One sentence about static-analysis limitations.
- Invitation for safe/risky fixture contributions.

## Do Not Launch Until

- [x] The demo can be run by someone else from a fresh clone.
- [x] The README explains that ClawShield is independent and not affiliated with OpenClaw.
- [x] Findings are clearly described as risk signals, not proof of malicious intent.

## Remaining Before Public Launch

- Record a short GIF or video using [docs/DEMO_SCRIPT.md](DEMO_SCRIPT.md).
- Regenerate demo assets with `npm run demo:capture` after visual UI changes.
- Apply the repository description and topics in GitHub after the repo is created.
- Validate against real installed skill folders once a public skill archive or local ClawHub install is available.
