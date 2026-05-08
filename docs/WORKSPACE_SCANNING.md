# Workspace Scanning

ClawGuard can scan an OpenClaw-style workspace and report which skills are visible by precedence.

## Supported Locations

Current precedence:

1. `<workspace>/skills`
2. `<workspace>/.agents/skills`

Higher numbers win. If two skills declare the same `name`, the skill in `skills/` wins over `.agents/skills/`.

Future phases can add explicit opt-in scanning for user/global locations such as `~/.openclaw/skills` and `~/.agents/skills`.

## Commands

```bash
npm run scan -- examples/openclaw-workspace
node src/cli.js scan-workspace examples/openclaw-workspace
```

## Checks

ClawGuard reports:

- Duplicate skill names.
- Higher-precedence skill overrides.
- Higher-precedence skill is riskier than the overridden skill.

## Name Resolution

Skill names are resolved from:

1. `name` in `SKILL.md` frontmatter.
2. First markdown H1 heading as a fallback.
3. Folder name as a final fallback.

## Security Note

A workspace-local skill can change which instructions the agent trusts. This makes duplicate names and overrides important even when both files look normal.
