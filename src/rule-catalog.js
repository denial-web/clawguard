export const ruleCatalog = [
  {
    id: "remote-code-execution",
    title: "Downloads or executes remote code",
    defaultSeverity: "critical",
    category: "execution",
    source: "static",
    tags: ["remote-code", "shell", "supply-chain"],
    description: "Detects patterns that download remote content and pipe it into an interpreter."
  },
  {
    id: "install-lifecycle-script",
    title: "Defines package install lifecycle scripts",
    defaultSeverity: "high",
    category: "supply-chain",
    source: "static",
    tags: ["package-manager", "install-script"],
    description: "Detects package lifecycle scripts that execute during dependency installation."
  },
  {
    id: "credential-access",
    title: "References sensitive credential locations",
    defaultSeverity: "critical",
    category: "secrets",
    source: "static",
    tags: ["credentials", "secrets"],
    description: "Detects references to credential files, token names, or instructions to access secrets."
  },
  {
    id: "destructive-shell",
    title: "Contains destructive shell operations",
    defaultSeverity: "high",
    category: "destructive-action",
    source: "static",
    tags: ["shell", "filesystem"],
    description: "Detects shell commands that can delete, overwrite, or disrupt the host."
  },
  {
    id: "obfuscated-execution",
    title: "Uses obfuscated or dynamic code execution",
    defaultSeverity: "high",
    category: "execution",
    source: "static",
    tags: ["obfuscation", "dynamic-execution"],
    description: "Detects eval-style execution, decoded payload execution, and short inline interpreter execution."
  },
  {
    id: "data-exfiltration",
    title: "May upload local data to an external destination",
    defaultSeverity: "high",
    category: "exfiltration",
    source: "static",
    tags: ["network", "upload"],
    description: "Detects common command-line patterns for uploading or copying local data elsewhere."
  },
  {
    id: "prompt-injection",
    title: "Contains prompt-injection style instructions",
    defaultSeverity: "high",
    category: "prompt-security",
    source: "static",
    tags: ["prompt-injection", "instruction-hijack"],
    description: "Detects instructions that try to hide behavior, override higher-priority instructions, or exfiltrate context."
  },
  {
    id: "broad-permissions",
    title: "Requests broad tool or filesystem permissions",
    defaultSeverity: "medium",
    category: "permissions",
    source: "static",
    tags: ["least-privilege", "tool-access"],
    description: "Detects broad filesystem or external tool permission language."
  },
  {
    id: "network-access",
    title: "Uses network access or external services",
    defaultSeverity: "low",
    category: "network",
    source: "static",
    tags: ["network", "external-service"],
    description: "Detects URLs and common programmatic network access."
  },
  {
    id: "missing-skill-metadata",
    title: "Missing recommended OpenClaw skill metadata",
    defaultSeverity: "low",
    category: "metadata",
    source: "skill-metadata",
    tags: ["openclaw", "skill-frontmatter"],
    description: "Detects incomplete SKILL.md frontmatter for registry and user review."
  },
  {
    id: "undeclared-env-access",
    title: "Uses environment secrets not declared in skill metadata",
    defaultSeverity: "high",
    category: "metadata-mismatch",
    source: "skill-metadata",
    tags: ["openclaw", "secrets", "frontmatter-mismatch"],
    description: "Detects env var use that is not declared in OpenClaw skill metadata."
  },
  {
    id: "undeclared-binary-requirement",
    title: "Uses a command-line tool not declared in skill metadata",
    defaultSeverity: "medium",
    category: "metadata-mismatch",
    source: "skill-metadata",
    tags: ["openclaw", "binary", "frontmatter-mismatch"],
    description: "Detects command-line tool usage that is not declared in OpenClaw skill metadata."
  },
  {
    id: "undeclared-config-access",
    title: "Reads config paths not declared in skill metadata",
    defaultSeverity: "medium",
    category: "metadata-mismatch",
    source: "skill-metadata",
    tags: ["openclaw", "config", "frontmatter-mismatch"],
    description: "Detects config file usage that is not declared in OpenClaw skill metadata."
  },
  {
    id: "undeclared-network-access",
    title: "Uses network access not declared in skill metadata",
    defaultSeverity: "medium",
    category: "metadata-mismatch",
    source: "skill-metadata",
    tags: ["openclaw", "network", "frontmatter-mismatch"],
    description: "Detects network access that is not declared in OpenClaw skill metadata."
  },
  {
    id: "undeclared-install-requirement",
    title: "Mentions install behavior not declared in skill metadata",
    defaultSeverity: "high",
    category: "metadata-mismatch",
    source: "skill-metadata",
    tags: ["openclaw", "install", "frontmatter-mismatch"],
    description: "Detects install or setup behavior that is not declared in OpenClaw skill metadata."
  },
  {
    id: "invalid-mcp-config",
    title: "MCP or plugin config is not valid JSON",
    defaultSeverity: "medium",
    category: "mcp-config",
    source: "mcp",
    tags: ["mcp", "json"],
    description: "Detects invalid JSON in recognized MCP or OpenClaw plugin config files."
  },
  {
    id: "mcp-shell-execution",
    title: "MCP or plugin config can execute shell code",
    defaultSeverity: "high",
    category: "mcp-config",
    source: "mcp",
    tags: ["mcp", "shell", "execution"],
    description: "Detects MCP or plugin commands that can execute shell or dynamic interpreter code."
  },
  {
    id: "mcp-runtime-package-command",
    title: "MCP or plugin config runs a package manager command",
    defaultSeverity: "high",
    category: "mcp-config",
    source: "mcp",
    tags: ["mcp", "package-manager", "supply-chain"],
    description: "Detects runtime package fetch commands such as npx, uvx, and pnpm dlx."
  },
  {
    id: "mcp-remote-url",
    title: "MCP or plugin config references a remote URL",
    defaultSeverity: "medium",
    category: "mcp-config",
    source: "mcp",
    tags: ["mcp", "network"],
    description: "Detects remote URLs in MCP or plugin configs."
  },
  {
    id: "mcp-broad-filesystem-access",
    title: "MCP or plugin config grants broad filesystem access",
    defaultSeverity: "high",
    category: "mcp-config",
    source: "mcp",
    tags: ["mcp", "filesystem", "least-privilege"],
    description: "Detects broad filesystem arguments such as home directory or root access."
  },
  {
    id: "mcp-write-capability",
    title: "MCP or plugin config exposes write-capable tools",
    defaultSeverity: "high",
    category: "mcp-config",
    source: "mcp",
    tags: ["mcp", "external-tools", "write-access"],
    description: "Detects browser, email, calendar, Slack, or GitHub write-capable tool surfaces."
  },
  {
    id: "mcp-unpinned-package",
    title: "MCP or plugin config uses an unpinned package",
    defaultSeverity: "medium",
    category: "mcp-config",
    source: "mcp",
    tags: ["mcp", "package-manager", "pinning"],
    description: "Detects runtime package command package names without a pinned version."
  },
  {
    id: "mcp-unknown-executable",
    title: "MCP or plugin config uses a local or unknown executable path",
    defaultSeverity: "medium",
    category: "mcp-config",
    source: "mcp",
    tags: ["mcp", "local-executable"],
    description: "Detects local executable paths in MCP or plugin configs."
  },
  {
    id: "mcp-secret-env",
    title: "MCP or plugin config injects sensitive environment variables",
    defaultSeverity: "high",
    category: "mcp-config",
    source: "mcp",
    tags: ["mcp", "secrets", "environment"],
    description: "Detects sensitive environment variable names or token-like values passed into MCP tools."
  },
  {
    id: "openclaw-plugin-missing-package-manifest",
    title: "OpenClaw plugin manifest has no package.json metadata",
    defaultSeverity: "medium",
    category: "openclaw-plugin",
    source: "mcp",
    tags: ["openclaw", "plugin", "metadata"],
    description: "Detects openclaw.plugin.json files that are not paired with package.json metadata."
  },
  {
    id: "openclaw-plugin-missing-compat-metadata",
    title: "OpenClaw plugin package is missing ClawHub compatibility metadata",
    defaultSeverity: "medium",
    category: "openclaw-plugin",
    source: "mcp",
    tags: ["openclaw", "plugin", "compatibility", "clawhub"],
    description: "Detects missing openclaw.compat.pluginApi or openclaw.build.openclawVersion metadata."
  },
  {
    id: "openclaw-plugin-code-execution",
    title: "OpenClaw plugin package executes local runtime code",
    defaultSeverity: "high",
    category: "openclaw-plugin",
    source: "mcp",
    tags: ["openclaw", "plugin", "code-execution"],
    description: "Detects OpenClaw plugin package runtime entries that execute local code."
  },
  {
    id: "openclaw-plugin-missing-runtime-output",
    title: "OpenClaw plugin TypeScript entry has no compiled runtime output",
    defaultSeverity: "high",
    category: "openclaw-plugin",
    source: "mcp",
    tags: ["openclaw", "plugin", "build", "runtime"],
    description: "Detects TypeScript plugin entries that do not have matching committed JavaScript runtime output."
  },
  {
    id: "openclaw-plugin-sensitive-capability",
    title: "OpenClaw plugin manifest declares sensitive host capabilities",
    defaultSeverity: "high",
    category: "openclaw-plugin",
    source: "mcp",
    tags: ["openclaw", "plugin", "capabilities", "host-access"],
    description: "Detects shell, process, filesystem, or similar sensitive host capability declarations."
  },
  {
    id: "workspace-duplicate-skill-name",
    title: "Workspace contains duplicate skill names",
    defaultSeverity: "medium",
    category: "workspace",
    source: "workspace",
    tags: ["openclaw", "workspace", "precedence"],
    description: "Detects duplicate skill names across OpenClaw workspace skill locations."
  },
  {
    id: "workspace-skill-override",
    title: "Higher-precedence workspace skill overrides another skill",
    defaultSeverity: "medium",
    category: "workspace",
    source: "workspace",
    tags: ["openclaw", "workspace", "precedence"],
    description: "Detects when a higher-precedence skill folder wins over another skill with the same name."
  },
  {
    id: "workspace-risky-skill-override",
    title: "Winning workspace skill is riskier than the skill it overrides",
    defaultSeverity: "high",
    category: "workspace",
    source: "workspace",
    tags: ["openclaw", "workspace", "risk"],
    description: "Detects when the effective higher-precedence skill has more risk findings than the overridden skill."
  },
  {
    id: "invalid-clawhub-metadata",
    title: "ClawHub metadata is not valid JSON",
    defaultSeverity: "medium",
    category: "clawhub",
    source: "clawhub",
    tags: ["clawhub", "json", "metadata"],
    description: "Detects invalid JSON in ClawHub lock or origin metadata files."
  },
  {
    id: "clawhub-missing-lockfile",
    title: "ClawHub origin metadata exists without a lockfile",
    defaultSeverity: "medium",
    category: "clawhub",
    source: "clawhub",
    tags: ["clawhub", "lockfile", "provenance"],
    description: "Detects ClawHub origin metadata without a workspace .clawhub/lock.json."
  },
  {
    id: "clawhub-missing-origin",
    title: "ClawHub lock entry is missing local origin metadata",
    defaultSeverity: "medium",
    category: "clawhub",
    source: "clawhub",
    tags: ["clawhub", "origin", "provenance"],
    description: "Detects lock entries that have no matching per-skill origin metadata."
  },
  {
    id: "clawhub-version-drift",
    title: "ClawHub metadata version differs from local skill state",
    defaultSeverity: "medium",
    category: "clawhub",
    source: "clawhub",
    tags: ["clawhub", "version", "drift"],
    description: "Detects version mismatch between lockfile, origin metadata, and local SKILL.md."
  },
  {
    id: "clawhub-source-drift",
    title: "ClawHub lock source differs from origin metadata",
    defaultSeverity: "high",
    category: "clawhub",
    source: "clawhub",
    tags: ["clawhub", "source", "drift"],
    description: "Detects source mismatch between lockfile and per-skill origin metadata."
  },
  {
    id: "clawhub-untrusted-source",
    title: "ClawHub metadata references an untrusted or unusual source",
    defaultSeverity: "medium",
    category: "clawhub",
    source: "clawhub",
    tags: ["clawhub", "source", "trust"],
    description: "Detects ClawHub source metadata that is not an official OpenClaw/ClawHub or trusted project URL."
  },
  {
    id: "invalid-dependency-manifest",
    title: "Dependency manifest is not valid",
    defaultSeverity: "medium",
    category: "dependencies",
    source: "dependencies",
    tags: ["dependencies", "manifest", "json"],
    description: "Detects invalid dependency manifests that cannot be parsed for supply-chain review."
  },
  {
    id: "dependency-install-script",
    title: "Dependency manifest defines an install lifecycle script",
    defaultSeverity: "high",
    category: "dependencies",
    source: "dependencies",
    tags: ["dependencies", "install-script", "supply-chain"],
    description: "Detects npm install lifecycle scripts such as preinstall, install, postinstall, and prepare."
  },
  {
    id: "dependency-lockfile-missing",
    title: "Dependency manifest has no matching lockfile",
    defaultSeverity: "medium",
    category: "dependencies",
    source: "dependencies",
    tags: ["dependencies", "lockfile", "determinism"],
    description: "Detects npm dependency manifests without a package-lock, pnpm-lock, or yarn lockfile in the same directory."
  },
  {
    id: "dependency-unpinned-spec",
    title: "Dependency version is not pinned",
    defaultSeverity: "medium",
    category: "dependencies",
    source: "dependencies",
    tags: ["dependencies", "pinning", "supply-chain"],
    description: "Detects dependency specs that are ranges, tags, wildcards, or otherwise not exact versions."
  },
  {
    id: "dependency-direct-source",
    title: "Dependency is installed from a direct URL or Git source",
    defaultSeverity: "high",
    category: "dependencies",
    source: "dependencies",
    tags: ["dependencies", "git", "url", "supply-chain"],
    description: "Detects dependency specs that install directly from Git, URL, GitHub shorthand, or local file sources."
  },
  {
    id: "dependency-suspicious-name",
    title: "Dependency name contains suspicious security-sensitive terms",
    defaultSeverity: "medium",
    category: "dependencies",
    source: "dependencies",
    tags: ["dependencies", "name-review", "supply-chain"],
    description: "Detects dependency names containing terms such as token, secret, credential, stealer, keylogger, or backdoor."
  }
];

export const ruleCatalogById = new Map(ruleCatalog.map((rule) => [rule.id, rule]));
