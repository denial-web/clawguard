# ClawGuard v0.1.31

This release adds financial-services SOP Packs for internal AI governance pilots.

## Added

- Added `financial-services/customer-complaint-triage`.
- Added `financial-services/kyc-document-intake`.
- Added `financial-services/fraud-alert-review`.
- Added complete and incomplete example workflows for each financial SOP Pack.
- Added web demo entries for complaint triage, KYC intake, and fraud alert review.
- Added tests for financial SOP pack discovery, block decisions, allow decisions, and web-demo checks.

## Safety Posture

These packs keep agents in evidence collection, drafting, recommendation, and escalation-support mode. They intentionally block final regulated actions such as sending final complaint responses, approving KYC, freezing accounts, or closing high-risk fraud alerts without human approval.

## Try It

```bash
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop list
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop init --industry banking-complaints --out complaint-triage.json
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop init --industry banking-kyc --out kyc-intake.json
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop init --industry banking-fraud --out fraud-review.json
npx --yes --package @denial-web/clawguard@0.1.31 clawguard sop check --pack financial-services/fraud-alert-review examples/sop-workflows/fraud-alert-review-incomplete.json
```
