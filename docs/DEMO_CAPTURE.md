# Demo Capture

Use this command to regenerate launch demo assets:

```bash
npm run demo:capture
```

The capture script starts a temporary local ClawShield web server, opens the web demo in Playwright, moves a visible cursor through the `Dependency Risk` flow, clicks `Download HTML`, and writes assets to `docs/assets`.

Generated files:

- `docs/assets/clawshield-web-demo.png`
- `docs/assets/clawshield-html-report.png`
- `docs/assets/clawshield-dependency-risk-report.html`
- `docs/assets/clawshield-demo.webm`
- `docs/assets/clawshield-demo.mp4` when `ffmpeg` is installed

The script does not install skill dependencies, run scanned code, or contact external registries. It scans local fixtures through the same web API used by the demo.

If Playwright browsers are missing, install them once:

```bash
npx playwright install chromium
```
