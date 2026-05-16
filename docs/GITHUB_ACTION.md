# GitHub Action

ClawGuard can run in pull requests as a policy gate and emit SARIF for GitHub code scanning.

## Example Workflow

```yaml
name: ClawGuard

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read
  security-events: write

jobs:
  scan:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v5

      - uses: denial-web/clawguard@v1
        with:
          target: skills
          policy: governed
          fail-on: critical
          fail-on-policy: "true"
          policy-fail-on: manual_review
          sarif: clawguard.sarif

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: clawguard.sarif
```

## Inputs

- `target`: path to scan. Default: `.`
- `policy`: `personal`, `governed`, or `enterprise`. Default: `governed`
- `fail-on`: risk level that fails the workflow. Default: `critical`
- `fail-on-policy`: whether policy decisions fail the workflow. Default: `true`
- `policy-fail-on`: policy decision threshold. Default: `manual_review`
- `config`: optional `.clawguard.json` path
- `sarif`: optional SARIF output path. Default: `clawguard.sarif`

## Notes

- The action is read-only. It scans files already present in the checked-out workspace.
- The action does not install scanned skill dependencies.
- Use `if: always()` for SARIF upload so GitHub receives results even when ClawGuard fails the policy gate.
