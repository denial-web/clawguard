# HTML Reports

ClawGuard can generate a self-contained HTML report for humans.

## Generate A Report

```bash
npm run scan -- examples/metadata-mismatch-skill --html clawguard.html --fail-on none
```

The report includes:

- Risk score and level.
- Policy decision and required actions.
- Finding counts by severity.
- Findings grouped by severity.
- Evidence and recommendations.
- Suppressed findings.
- Skipped files.
- Scan options and config path.

## Security Notes

- The report is generated from static scan data.
- Finding evidence is HTML-escaped before rendering.
- The report does not load external scripts, fonts, or styles.
- The report is meant for review and sharing, not proof that a skill is safe.
