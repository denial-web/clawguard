# Architecture Roadmap

This roadmap turns the current ClawShield starter into a complete, strong, secure companion project.

## Phase 0: Current Foundation

Status: started

Already present:

- Static CLI scanner.
- Explainable findings.
- JSON output.
- CI fail threshold.
- File-size limit.
- Symlink skipping.
- Safe and risky example skills.
- Unit tests.
- Threat model.
- Security reporting policy.

Finish before public announcement:

- Add at least 20 fixtures.
- Add at least 20 tests.
- Add rule documentation.
- Add config file support.
- Add stable report schema.

## Phase 1: OpenClaw Skill Intelligence

Goal: make ClawShield understand real OpenClaw-style skill structure.

Build:

- `SKILL.md` and `skill.md` detection.
- YAML frontmatter parser.
- `metadata.openclaw` normalizer.
- Required field checks.
- Runtime requirement extraction.
- Declared versus observed mismatch rules.

Rules:

- Env var used but not declared.
- Binary used but not declared.
- Config path read but not declared.
- Install requirement mentioned but not declared.
- Broad permission language without clear purpose.
- Skill name/version/description missing.

Success demo:

```bash
clawshield scan examples/risky-skill
```

Report should say not only "risky pattern found", but also "the skill did not declare this requirement".

## Phase 2: Workspace and Precedence

Goal: scan what OpenClaw will actually load.

Status: started

Build:

- `scan-workspace` command.
- Workspace `skills/` scanner.
- Project `.agents/skills` scanner.
- Duplicate skill-name detection.
- Effective skill precedence report.
- Optional managed/global scan when explicitly passed.

Already present:

- `scan-workspace` alias.
- Workspace `skills/` discovery.
- Project `.agents/skills` discovery.
- Duplicate skill-name findings.
- Higher-precedence override findings.
- Riskier winning-skill override findings.

Success demo:

```bash
clawshield scan-workspace ~/.openclaw/workspace
```

Output should explain which duplicate skill wins and whether the winning copy has higher risk.

## Phase 3: Policy Engine

Goal: turn findings into decisions.

Build:

- Presets: personal, governed, enterprise.
- Decisions: allow, warn, manual review, sandbox required, dual approval, block.
- `.clawshield.json` config.
- Suppressions with reason and optional expiry.
- Policy check command for saved reports.

Success demo:

```bash
clawshield scan ./skills --policy governed --fail-on-policy
```

## Phase 4: Reports and CI

Goal: make ClawShield easy to adopt by maintainers.

Build:

- Stable JSON schema.
- SARIF reporter.
- GitHub Action.
- PR annotation examples.
- HTML report.
- JSONL audit output.

Success demo:

- Add ClawShield to a sample skill repo.
- Open a PR with a risky skill.
- Show SARIF annotations and failed policy gate.

## Phase 5: MCP and Plugin Config Scanner

Goal: cover the second half of the OpenClaw/ClawHub surface: tools and plugins.

Status: started

Build:

- `.openclaw/plugins.json` parser.
- `.openclaw/mcp.json` parser.
- `.cursor/mcp.json` parser.
- Generic `mcp.json` parser.
- Plugin capability rule pack.
- Environment injection risk checks.
- Package/source trust checks.

Already present:

- Config path detection for `.cursor/mcp.json`, `.openclaw/mcp.json`, `.openclaw/plugins.json`, and `mcp.json`.
- JSON parsing with invalid-config findings.
- Runtime package command checks.
- Unpinned package checks.
- Secret env checks.
- Broad filesystem checks.
- Shell execution checks.
- Remote URL checks.
- Write-capability checks.

Success demo:

```bash
clawshield scan-mcp .cursor/mcp.json
```

Output should explain which tools are powerful and what approval/sandbox action is recommended.

## Phase 6: ClawHub Metadata

Goal: connect local scans to registry context.

Status: started

Build:

- `.clawhub/lock.json` parser.
- `.clawhub/origin.json` parser.
- Version/source reporting.
- Local drift detection.
- Metadata comparison.
- Optional `clawhub inspect` adapter.

Already present:

- `.clawhub/lock.json` detection and parsing.
- Per-skill `.clawhub/origin.json` detection and parsing.
- Version drift findings across lockfile, origin metadata, and local `SKILL.md`.
- Source drift findings across lockfile and origin metadata.
- Missing lockfile and missing origin findings.
- Untrusted or unusual source findings.
- JSON, CLI, and HTML report summaries for ClawHub metadata.

Success demo:

```bash
clawshield scan examples/clawhub-workspace --fail-on none
```

Output should show version/source context and mismatches.

## Phase 7: Web Demo

Goal: create the visibility engine.

Status: started

Build:

- Paste `SKILL.md` scanner.
- Folder or zip scanner.
- Visual risk score.
- Shareable report.
- Demo GIF script.

Already present:

- Local no-dependency web server.
- Paste `SKILL.md` scan flow.
- Built-in examples for static, metadata, workspace, ClawHub, dependency, and MCP risk.
- Policy selector.
- Visual score, policy decision, required actions, finding counts, metadata summaries, and finding cards.
- Copy JSON action.

Success demo:

> Upload OpenClaw skill -> ClawShield scans -> Risk score -> Risk explanation -> Safer install recommendation.

This should be the first viral surface.

## Phase 8: MCP Server and Install Gate

Goal: make ClawShield available inside agent workflows.

Build:

- Read-only MCP server.
- `scan_skill` tool.
- `scan_mcp_config` tool.
- `policy_decision` tool.
- Optional install wrapper.

Success demo:

An agent can ask ClawShield to review a skill before recommending installation.

## Phase 9: Authority Assets

Goal: turn the project into a visible ecosystem security resource.

Build:

- `awesome-openclaw-security` companion repo.
- Security articles.
- Demo videos.
- OpenClaw/ClawHub PRs for docs and safer defaults.
- Fixture corpus from public safe/risky examples.
- Public rule documentation.

## Build Order Recommendation

Do this next:

1. Polish dependency/package lock scanning against real installed examples.
2. Add web paste demo.
3. Add demo GIF script and launch README assets.
4. Add optional ClawHub pre-install wrapper.
5. Prepare upstream OpenClaw/ClawHub docs PRs.
6. Create the first public security checklist.

This sequence gives the fastest path to a credible public release.
