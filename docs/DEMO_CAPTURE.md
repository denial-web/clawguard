# Demo Capture

Use this command to regenerate launch demo assets:

```bash
npm run demo:capture
```

The capture script starts a temporary local ClawGuard web server, opens the web demo in Playwright, moves a visible cursor through the `Dependency Risk` flow, clicks `Download HTML`, and writes assets to `docs/assets`.

Generated files:

- `docs/assets/clawguard-web-demo.png`
- `docs/assets/clawguard-html-report.png`
- `docs/assets/clawguard-dependency-risk-report.html`
- `docs/assets/clawguard-demo.webm`
- `docs/assets/clawguard-demo.mp4` when `ffmpeg` is installed

The script does not install skill dependencies, run scanned code, or contact external registries. It scans local fixtures through the same web API used by the demo.

If Playwright browsers are missing, install them once:

```bash
npx playwright install chromium
```
