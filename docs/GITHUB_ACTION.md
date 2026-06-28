# GitHub Action

ClawGuard can run in pull requests as a policy gate, emit SARIF for GitHub code scanning, and emit the `clawguard.check.v1` JSON decision contract so downstream steps can branch on the decision without parsing SARIF.

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

      - id: clawguard
        uses: denial-web/clawguard@v1
        with:
          target: skills
          policy: governed
          fail-on: critical
          fail-on-policy: "true"
          policy-fail-on: manual_review
          sarif: clawguard.sarif
          check: "true"
          check-output: clawguard.check.json

      - name: Echo ClawGuard decision
        if: always()
        run: |
          echo "decision: ${{ steps.clawguard.outputs.decision }}"
          echo "risk: ${{ steps.clawguard.outputs.risk }}"
          echo "summary: ${{ steps.clawguard.outputs.summary }}"
          echo "recommended-action: ${{ steps.clawguard.outputs.recommended-action }}"

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: clawguard-check
          path: ${{ steps.clawguard.outputs.check-json-path }}

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
- `config`: optional `.clawguard.json` path. Default: empty.
- `sarif`: SARIF output path. Set to empty string to skip. Default: `clawguard.sarif`
- `check`: emit `clawguard.check.v1` JSON alongside SARIF. Default: `"true"`. Set to `"false"` to skip.
- `check-output`: path to write the `clawguard.check.v1` JSON when `check` is enabled. Default: `clawguard.check.json`

## Outputs

The Action exposes step outputs derived from `clawguard.check.v1` so downstream steps can branch on the decision without parsing SARIF or the JSON file:

- `decision`: `allow`, `manual_review`, or `block`. Empty when `check` is disabled.
- `risk`: `info`, `low`, `medium`, `high`, or `critical`. Empty when `check` is disabled.
- `summary`: one-line explanation. Empty when `check` is disabled.
- `recommended-action`: `auto_install`, `require_user_approval`, or `reject`. Empty when `check` is disabled.
- `check-json-path`: absolute path the `clawguard.check.v1` JSON was written to. Empty when `check` is disabled.
- `sarif-path`: absolute path the SARIF report was written to. Empty when `sarif` input is empty.

The `clawguard.check.v1` JSON shape is fixed by [schemas/clawguard-check.schema.json](../schemas/clawguard-check.schema.json) (also published at https://denial-web.github.io/clawguard/schemas/clawguard-check.schema.json).

## Decision-based branching

The Action's step outputs are designed to compose with `if:` conditions:

```yaml
- name: Require human approval on the PR
  if: steps.clawguard.outputs.decision == 'manual_review'
  uses: actions/github-script@v8
  with:
    script: |
      github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
        body: 'ClawGuard decision: manual_review. ' +
              ${{ toJSON(steps.clawguard.outputs.summary) }}
      });

- name: Block merge on critical risk
  if: steps.clawguard.outputs.decision == 'block'
  run: exit 1
```

## Notes

- The Action is read-only. It scans files already present in the checked-out workspace.
- The Action does not install scanned skill dependencies.
- Use `if: always()` for SARIF upload and artifact upload so GitHub receives results even when ClawGuard fails the policy gate.
- The check step always runs (`if: always()`) so consumers receive the `clawguard.check.v1` payload even when the scan step's policy gate fails the workflow.
