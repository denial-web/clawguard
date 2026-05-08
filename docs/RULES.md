# Rule Catalog

This document lists stable ClawShield rule IDs. Suppressions, SARIF output, and downstream automation should key off `ruleId`.

## Static Rules

| Rule ID | Severity | Category | Description |
| --- | --- | --- | --- |
| `remote-code-execution` | critical | execution | Detects remote content piped into interpreters. |
| `install-lifecycle-script` | high | supply-chain | Detects package lifecycle scripts. |
| `credential-access` | critical | secrets | Detects credential files, token names, and secret access instructions. |
| `destructive-shell` | high | destructive-action | Detects shell commands that can damage the host. |
| `obfuscated-execution` | high | execution | Detects eval, decoded payloads, and dynamic interpreter execution. |
| `data-exfiltration` | high | exfiltration | Detects command-line data upload or copy patterns. |
| `prompt-injection` | high | prompt-security | Detects instruction hiding, override, and exfiltration language. |
| `broad-permissions` | medium | permissions | Detects broad filesystem or tool permission requests. |
| `network-access` | low | network | Detects URLs and common network access patterns. |

## Skill Metadata Rules

| Rule ID | Severity | Category | Description |
| --- | --- | --- | --- |
| `missing-skill-metadata` | low | metadata | Detects incomplete `SKILL.md` frontmatter. |
| `undeclared-env-access` | high | metadata-mismatch | Detects env var use not declared in OpenClaw skill metadata. |
| `undeclared-binary-requirement` | medium | metadata-mismatch | Detects command-line tool use not declared in OpenClaw skill metadata. |
| `undeclared-config-access` | medium | metadata-mismatch | Detects config path use not declared in OpenClaw skill metadata. |
| `undeclared-network-access` | medium | metadata-mismatch | Detects network use not declared in OpenClaw skill metadata. |
| `undeclared-install-requirement` | high | metadata-mismatch | Detects install behavior not declared in OpenClaw skill metadata. |

## MCP and Plugin Rules

| Rule ID | Severity | Category | Description |
| --- | --- | --- | --- |
| `invalid-mcp-config` | medium | mcp-config | Detects invalid JSON in recognized MCP or plugin config files. |
| `mcp-shell-execution` | high | mcp-config | Detects shell or dynamic interpreter execution in MCP/plugin config. |
| `mcp-runtime-package-command` | high | mcp-config | Detects runtime package fetch commands such as `npx`, `uvx`, and `pnpm dlx`. |
| `mcp-remote-url` | medium | mcp-config | Detects remote URLs in MCP/plugin config. |
| `mcp-broad-filesystem-access` | high | mcp-config | Detects broad filesystem access such as home or root paths. |
| `mcp-write-capability` | high | mcp-config | Detects write-capable browser, email, calendar, Slack, or GitHub tool surfaces. |
| `mcp-unpinned-package` | medium | mcp-config | Detects unpinned package specs in runtime package commands. |
| `mcp-unknown-executable` | medium | mcp-config | Detects local or unknown executable paths in MCP/plugin config. |
| `mcp-secret-env` | high | mcp-config | Detects sensitive env vars injected into MCP/plugin tools. |
| `openclaw-plugin-missing-package-manifest` | medium | openclaw-plugin | Detects `openclaw.plugin.json` files without nearby `package.json` metadata. |
| `openclaw-plugin-missing-compat-metadata` | medium | openclaw-plugin | Detects missing `openclaw.compat.pluginApi` or `openclaw.build.openclawVersion` metadata. |
| `openclaw-plugin-code-execution` | high | openclaw-plugin | Detects plugin runtime entries that execute local code. |
| `openclaw-plugin-missing-runtime-output` | high | openclaw-plugin | Detects TypeScript plugin entries without matching compiled JavaScript output. |
| `openclaw-plugin-sensitive-capability` | high | openclaw-plugin | Detects shell, process, filesystem, or similar sensitive host capabilities. |

## Workspace Rules

| Rule ID | Severity | Category | Description |
| --- | --- | --- | --- |
| `workspace-duplicate-skill-name` | medium | workspace | Detects duplicate skill names across OpenClaw workspace skill locations. |
| `workspace-skill-override` | medium | workspace | Detects when a higher-precedence skill wins over another skill with the same name. |
| `workspace-risky-skill-override` | high | workspace | Detects when the effective higher-precedence skill has more risk than the overridden skill. |

## ClawHub Metadata Rules

| Rule ID | Severity | Category | Description |
| --- | --- | --- | --- |
| `invalid-clawhub-metadata` | medium | clawhub | Detects invalid JSON in ClawHub lock or origin metadata files. |
| `clawhub-missing-lockfile` | medium | clawhub | Detects ClawHub origin metadata without a workspace `.clawhub/lock.json`. |
| `clawhub-missing-origin` | medium | clawhub | Detects lock entries that have no matching per-skill origin metadata. |
| `clawhub-version-drift` | medium | clawhub | Detects version mismatch between lockfile, origin metadata, and local `SKILL.md`. |
| `clawhub-source-drift` | high | clawhub | Detects source mismatch between lockfile and per-skill origin metadata. |
| `clawhub-untrusted-source` | medium | clawhub | Detects ClawHub source metadata that is not an official OpenClaw/ClawHub or trusted project URL. |

## Dependency Rules

| Rule ID | Severity | Category | Description |
| --- | --- | --- | --- |
| `invalid-dependency-manifest` | medium | dependencies | Detects invalid dependency manifests that cannot be parsed for supply-chain review. |
| `dependency-install-script` | high | dependencies | Detects npm install lifecycle scripts such as `preinstall`, `install`, `postinstall`, and `prepare`. |
| `dependency-lockfile-missing` | medium | dependencies | Detects npm dependency manifests without a package lockfile in the same directory. |
| `dependency-unpinned-spec` | medium | dependencies | Detects dependency specs that are ranges, tags, wildcards, or otherwise not exact versions. |
| `dependency-direct-source` | high | dependencies | Detects dependency specs that install directly from Git, URL, GitHub shorthand, or local file sources. |
| `dependency-suspicious-name` | medium | dependencies | Detects dependency names containing security-sensitive terms such as `token`, `secret`, `credential`, `stealer`, `keylogger`, or `backdoor`. |

## Suppressions

Suppressions should use `ruleId` and should include a reason.

```json
{
  "ruleId": "network-access",
  "path": "skills/weather/SKILL.md",
  "reason": "Weather skill needs the approved weather API.",
  "expires": "2026-12-31"
}
```

Critical findings are not suppressible by default. Set `allowCritical: true` only after explicit review.
