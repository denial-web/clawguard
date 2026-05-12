# ClawGuard v0.1.28

This release adds a visual SOP demo to the local web app, making the business-governance side of ClawGuard easier to understand without reading terminal output.

## Added

- Added a web API for SOP demo pack discovery.
- Added a web API for running SOP checks against built-in example workflows.
- Added a **SOP Demos** panel for cafe, milk tea, mart, and toy shop workflows.
- Added a **Business SOP Gate** result panel with missing evidence, approval, threshold, and blocked-action counts.
- Added command previews for reproducing the same SOP check in the CLI.
- Added web tests for SOP pack listing and toy shop SOP check behavior.

## Try It

```bash
npm run web -- --port 4174
```

Then open:

```text
http://127.0.0.1:4174
```

Choose **Toy Shop Close** in the SOP Demos panel to see ClawGuard block a close with missing recall checks, warning-label checks, manager approval, and an open safety complaint.

