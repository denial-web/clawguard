# MCP and Plugin Config Scanning

ClawGuard scans MCP and plugin config files as part of the normal `scan` command.

## Supported Paths

Current paths:

- `.cursor/mcp.json`
- `.openclaw/mcp.json`
- `.openclaw/plugins.json`
- `mcp.json`
- `openclaw.plugin.json`

These paths matter because skills can be low-risk on paper while the tool layer they activate is powerful.

## Checks

ClawGuard currently reports:

- Runtime package commands such as `npx`, `uvx`, and `pnpm dlx`.
- Unpinned package specs used by runtime package commands.
- Shell or dynamic execution through `bash -c`, `python -c`, `node -e`, and similar patterns.
- Secret environment injection such as `GITHUB_TOKEN`, `OPENAI_API_KEY`, or other token-like names.
- Broad filesystem access such as `$HOME`, `~/`, `/`, or user home paths.
- Remote URLs.
- Write-capable browser, email, calendar, Slack, and GitHub capabilities.
- Invalid JSON in recognized config files.
- OpenClaw plugin packages with missing `package.json` metadata.
- Missing ClawHub compatibility metadata in plugin package manifests.
- Local runtime code execution through `openclaw.extensions` or `openclaw.runtimeExtensions`.
- TypeScript plugin entries without matching compiled JavaScript runtime output.
- Sensitive host capabilities such as shell, process, and filesystem access.

## Example

```bash
npm run scan -- examples/risky-mcp-config
```

Useful fixtures:

- `examples/safe-mcp-config`
- `examples/risky-mcp-config`
- `examples/openclaw-plugin-config`
- `examples/safe-openclaw-plugin`
- `examples/risky-openclaw-plugin`

## Security Model

The scanner does not start MCP servers, install packages, or execute configured commands. It reads the config as data and reports risk signals.

This keeps ClawGuard safe to run on untrusted repositories and pull requests.
