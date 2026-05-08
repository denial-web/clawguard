# ClawHub Metadata Scanning

ClawGuard can inspect local ClawHub install metadata without contacting the network.

## What It Reads

- Workspace lockfile: `.clawhub/lock.json`
- Per-skill origin metadata: `skills/<name>/.clawhub/origin.json`
- Root origin metadata: `.clawhub/origin.json`
- Local skill metadata from `skills/<name>/SKILL.md`

The parser accepts a few lockfile shapes so it can work with early or changing ClawHub metadata:

- `skills` or `packages` arrays
- `skills` or `packages` objects keyed by skill name
- Top-level objects that contain metadata-like fields such as `version`, `source`, `repo`, `url`, `path`, or `dir`

## What It Reports

ClawHub scanning adds a `clawhub` block to JSON reports:

```json
{
  "clawhub": {
    "lockfile": ".clawhub/lock.json",
    "entries": [
      {
        "name": "weather-helper",
        "version": "1.0.0",
        "source": "https://github.com/openclaw/skills/weather-helper",
        "skillDir": "skills/weather-helper"
      }
    ],
    "origins": []
  }
}
```

It also emits findings when provenance cannot be trusted:

- Invalid ClawHub JSON metadata.
- Installed origin metadata exists but the workspace lockfile is missing.
- A lock entry has no matching local origin metadata.
- Lock, origin, and local `SKILL.md` versions drift apart.
- Lock source and origin source disagree.
- Source metadata points to an untrusted or unusual location.

## Example

```bash
node src/cli.js scan examples/clawhub-workspace --fail-on none
node src/cli.js scan examples/clawhub-workspace --json --fail-on none
```

## Trust Model

This is a local provenance check, not a registry verifier. ClawGuard does not fetch ClawHub data or prove that a remote source is safe. It highlights drift and unusual sources so users can pause before installing, updating, publishing, or recommending a skill.
