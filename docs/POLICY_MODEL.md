# Policy Model

ClawGuard separates detection from decision-making.

Detection answers:

> What did we find?

Policy answers:

> What should happen before this skill or plugin is trusted?

## Risk Levels

`info`

Useful context. Does not imply danger.

Examples:

- Missing optional metadata.
- Skill has install requirements.
- Workspace contains duplicate skill names.

`low`

Minor risk or maintenance issue.

Examples:

- Uses common external domains.
- Declares broad tags without matching instructions.
- Reads normal config files.

`medium`

The skill can surprise the user or expand trust.

Examples:

- Undeclared binary requirement.
- Broad filesystem wording.
- Network access that matches the skill purpose but is not declared.
- Prompt instructions that ask the model to ignore unrelated context.

`high`

The skill can touch sensitive data, external systems, or powerful tools.

Examples:

- Reads environment variables or credential files.
- Sends data to external endpoints.
- Requests shell, browser, GitHub, Slack, email, calendar, or gateway capabilities.
- Uses install scripts or opaque dependency setup.

`critical`

The skill can cause serious damage or execute untrusted logic.

Examples:

- Downloads and executes remote code.
- Runs destructive shell commands.
- Silently exfiltrates secrets.
- Attempts to disable safety controls or approvals.
- Uses obfuscation to hide execution or network behavior.

## Decisions

`allow`

No blocking issues. The report may still show informational findings.

`warn`

Show the risk and allow the operator to continue.

`manual_review`

Require a human review before install, update, or merge.

`sandbox_required`

Allow only inside a sandbox or with limited tools.

`dual_approval`

Require two reviewers for high-risk enterprise workflows.

`block`

Do not install, enable, or merge.

## Presets

Personal:

- Allow `info` and `low`.
- Warn on `medium`.
- Manual review on `high`.
- Block `critical`.

Governed:

- Allow `info`.
- Warn on `low`.
- Manual review on `medium`.
- Sandbox required on `high`.
- Block `critical`.

Enterprise:

- Allow `info`.
- Warn on `low`.
- Manual review on `medium`.
- Dual approval or sandbox required on `high`.
- Block `critical`.
- Block undeclared sensitive behavior even when the base severity is lower.

## Policy Inputs

Policy should consider:

- Risk level and score.
- Finding category.
- Confidence.
- Target kind.
- Source trust.
- Whether the behavior is declared in `SKILL.md`.
- Whether the skill requires secrets.
- Whether the skill requires install commands.
- Whether sandboxing is available.
- Whether a finding is in executable code, metadata, documentation, or tests.
- Whether the repo has a known maintainer or pinned version.

## OpenClaw-Specific Checks

Policy should treat these as important:

- Workspace skill overrides a safer managed or bundled skill.
- Skill ships through a plugin and may load indirectly.
- Agent allowlists are unrestricted.
- Main session has host tool access.
- Non-main sandbox is unavailable or disabled.
- Skill asks for tools that typical sandbox defaults deny.

## ClawHub-Specific Checks

Policy should treat these as important:

- Local install differs from registry origin metadata.
- Lockfile version is old, missing, or inconsistent.
- A skill references secrets not declared under `metadata.openclaw`.
- A skill requires binaries not declared under `requires.bins` or `requires.anyBins`.
- A skill includes install specs that fetch packages or binaries.
- Plugin compatibility or source metadata is missing.

## Suppressions

Suppressions should be explicit and auditable.

Recommended suppression shape:

```json
{
  "findingId": "network-access",
  "path": "skills/weather/SKILL.md",
  "reason": "Weather skill is expected to call the weather API.",
  "expires": "2026-12-31",
  "reviewer": "security@example.com"
}
```

Rules:

- Suppressions require a reason.
- Suppressions should expire.
- Suppressions should match finding ID and path.
- Suppressions must not hide critical remote execution by default.

## Audit Events

Policy decisions should be exportable as JSONL:

```json
{
  "time": "2026-05-07T00:00:00Z",
  "target": "skills/todoist",
  "score": 68,
  "level": "high",
  "decision": "sandbox_required",
  "preset": "governed",
  "findingIds": ["credential-access", "network-access"]
}
```

This gives enterprise users a path to governance without making the first product heavy.
