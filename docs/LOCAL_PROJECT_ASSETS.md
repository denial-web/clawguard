# Local Project Assets For ClawShield

This file maps useful material found in nearby local projects under `/Users/hy/CascadeProjects`.

The goal is not to blindly merge projects. The strongest path is to reuse patterns, tests, fixtures, and architecture ideas that make ClawShield more credible as a focused OpenClaw-style skill and MCP security scanner.

## Best Reuse Candidates

### 1. AegisBrain Skill Scanner

Source:

- `/Users/hy/CascadeProjects/aegisbrain/packages/skill-runtime/src/scanner.ts`
- `/Users/hy/CascadeProjects/aegisbrain/docs/SECURITY_MODEL.md`
- `/Users/hy/CascadeProjects/aegisbrain/packages/policies/governed/default.policy.json`
- `/Users/hy/CascadeProjects/aegisbrain/packages/policies/consumer/default.policy.json`

Useful ideas:

- Manifest integrity checks
- Blocked tool allowlist
- Declared risk-level validation
- Step-count limits
- Permission-scope audit
- Trust levels: `verified`, `scanned`, `untrusted`
- Security model language: default deny, fail closed, audit trail, separation of planning and execution

Best ClawShield use:

- Add structured `manifest` checks when a skill has JSON metadata.
- Add trust-level output next to the numeric risk score.
- Add policy presets: `consumer`, `governed`, and later `enterprise`.

### 2. ToolGovernor / Agent-Immune

Source:

- `/Users/hy/CascadeProjects/toolgovernor/src/agent_immune/core/output_scanner.py`
- `/Users/hy/CascadeProjects/toolgovernor/src/agent_immune/mcp_server.py`
- `/Users/hy/CascadeProjects/toolgovernor/tests/test_output_scanner.py`
- `/Users/hy/CascadeProjects/toolgovernor/docs/mcp_marketplaces.md`
- `/Users/hy/CascadeProjects/toolgovernor/SECURITY.md`

Useful ideas:

- Credential and PII detection patterns
- Base64, hex, data URI, JWT, and long-query exfiltration detection
- System-prompt leak heuristics
- Output scanning as a separate product surface
- MCP server packaging and marketplace checklist
- Stronger security policy disclosure language

Best ClawShield use:

- Import the test-case ideas into JavaScript fixtures.
- Add an optional `scan-output` command later.
- Add MCP marketplace positioning once ClawShield has an MCP server.

Security note:

- Token-looking local files exist in `toolgovernor` (`.mcpregistry_*`). They appear ignored by git status, but do not read or copy them into ClawShield.

### 3. Nexus Agent Immune Scanner

Source:

- `/Users/hy/CascadeProjects/nexus-agent/app/core/immune/scanner.py`
- `/Users/hy/CascadeProjects/nexus-agent/tests/test_mcp_proxy.py`
- `/Users/hy/CascadeProjects/nexus-agent/tests/test_audit_export.py`

Useful ideas:

- Unicode normalization for zero-width characters and confusables
- Multi-language prompt-injection patterns
- Session escalation tracking
- Tool-call boundary rule: block any non-pass verdict
- SIEM-style JSONL audit export tests
- MCP governance proxy tests

Best ClawShield use:

- Add Unicode normalization before regex scanning.
- Add multi-language prompt-injection fixtures.
- Add JSONL report export later.
- Use the MCP proxy tests as inspiration for future MCP config/tool scanning.

### 4. Sidekick-OS Governor

Source:

- `/Users/hy/CascadeProjects/Sidekick-OS/functions/src/governor/policyEngine.ts`
- `/Users/hy/CascadeProjects/Sidekick-OS/functions/src/governor/toolGate.ts`
- `/Users/hy/CascadeProjects/Sidekick-OS/functions/src/governor/auditLogger.ts`
- `/Users/hy/CascadeProjects/Sidekick-OS/functions/src/security/promptPolicy.ts`
- `/Users/hy/CascadeProjects/Sidekick-OS/.cursor/skills/firebase-iam-triage/SKILL.md`

Useful ideas:

- Policy actions: `REJECT`, `ESCALATE`, `INJECT_CONSTRAINT`, `REQUIRE_DUAL_APPROVAL`
- Tool-name to action-type mapping
- Hash-chained audit log
- Prompt role sanitization
- Real Cursor-style skill file to use as a safe/operational fixture

Best ClawShield use:

- Add policy-action terminology to ClawShield recommendations.
- Add a future `--policy governed` mode.
- Add the Firebase IAM skill as a safe fixture after removing project-specific identifiers if publishing publicly.

### 5. Minister Governor / Covernor Platform

Source:

- `/Users/hy/CascadeProjects/minister-governor-platform/src/core/governor/policies/engine.ts`
- `/Users/hy/CascadeProjects/minister-governor-platform/src/config/policies.json`
- `/Users/hy/CascadeProjects/minister-governor-platform/src/core/policy/capability.registry.ts`
- `/Users/hy/CascadeProjects/minister-governor-platform/src/core/policy/schema.validator.ts`
- `/Users/hy/CascadeProjects/minister-governor-platform/src/db/audit.logger.ts`
- `/Users/hy/CascadeProjects/minister-governor-platform/tests/unit/policy-engine.spec.ts`
- `/Users/hy/CascadeProjects/minister-governor-platform/docs/STRATEGIC_OPTIONS.md`

Useful ideas:

- Capability registry that maps raw tools to high-level capabilities
- Policy engine with conditions and constraints
- Provenance-required policy for financial routing
- Dual approval for very high-risk actions
- Schema validation for LLM-proposed actions
- Serializable hash-chain audit logging

Best ClawShield use:

- Add capability categories to scanner findings: filesystem, network, credential, shell, browser, finance, communication.
- Add policy recommendations like `block`, `approve_with_constraints`, `manual_review`, `dual_approval`.
- Use the unit tests as a pattern for policy-mode tests.

### 6. Sidekick Studio Skills

Source:

- `/Users/hy/CascadeProjects/sidekick-studio/.cursor/skills/*/SKILL.md`
- `/Users/hy/CascadeProjects/sidekick-studio/.cursor/skills/security-auditor/SKILL.md`
- `/Users/hy/CascadeProjects/sidekick-studio/.cursor/mcp.json`
- `/Users/hy/CascadeProjects/sidekick-studio/packages/authz/src/policy.ts`

Useful ideas:

- Many real `SKILL.md` examples for fixture testing
- Security-auditor skill rubric
- MCP config with stdio and HTTP servers
- Workspace role/capability model

Best ClawShield use:

- Build a fixture corpus of realistic benign skills.
- Add MCP config scanning for risky commands such as `npx -y`, broad external MCPs, and missing descriptions.
- Add role/capability language later for enterprise reports.

### 7. A-S-FLC Security Guard

Source:

- `/Users/hy/CascadeProjects/a-s-flc-llm-enhancer/core/policy_guard.py`
- `/Users/hy/CascadeProjects/a-s-flc-llm-enhancer/tests/test_policy_guard.py`
- `/Users/hy/CascadeProjects/a-s-flc-llm-enhancer/training/security_query_bank.json`
- `/Users/hy/CascadeProjects/a-s-flc-llm-enhancer/SECURITY_ADAPTER.md`

Useful ideas:

- Deterministic pre-LLM guard framing
- Security query bank for evaluation data
- Scam, credential-harvesting, PII, and prompt-injection categories
- Good product language: keep secret handling and escalation in code, not model weights

Best ClawShield use:

- Use as inspiration for fixture categories and docs.
- Add an evaluation corpus later, separate from unit tests.

### 8. Khmer Chatbot Security Scripts

Source:

- `/Users/hy/CascadeProjects/khmer-chatbot-ai/security-check.py`
- `/Users/hy/CascadeProjects/khmer-chatbot-ai/quick-security-check.py`
- `/Users/hy/CascadeProjects/khmer-chatbot-ai/docs/security-checklist.md`

Useful ideas:

- Deployment-oriented checks for secrets, env files, Dockerfiles, and `.gitignore`
- Clear pass/fail CLI output
- Security checklist format

Best ClawShield use:

- Add repository hygiene checks later: `.env`, service account keys, Dockerfile root user, missing `.gitignore`.
- Keep these separate from skill scanning so the MVP stays focused.

### 9. Doc Intelligence MCP

Source:

- `/Users/hy/CascadeProjects/doc-intelligence-mcp/src/server.ts`
- `/Users/hy/CascadeProjects/doc-intelligence-mcp/package.json`
- `/Users/hy/CascadeProjects/doc-intelligence-mcp/AGENTS.md`
- `/Users/hy/CascadeProjects/doc-intelligence-mcp/API_REFERENCE.md`

Useful ideas:

- Real MCP server with 28 tools
- Tool inventory and descriptions
- Input schemas and tool metadata
- HTTP/SSE transport example

Best ClawShield use:

- Use as a realistic MCP scanning fixture.
- Extract tool inventory patterns for future MCP risk reports.

## Recommended Import Order

1. Unicode normalization and extra prompt-injection fixtures from `nexus-agent`.
2. Credential/output leak patterns and tests from `toolgovernor`.
3. Manifest/trust-level checks from `aegisbrain`.
4. Policy recommendation language from `minister-governor-platform` and `Sidekick-OS`.
5. Real benign `SKILL.md` fixtures from `sidekick-studio`.
6. MCP config scanning using `sidekick-studio/.cursor/mcp.json` and `doc-intelligence-mcp`.
7. Hash-chained audit and JSONL report ideas after the CLI is stable.

## What Not To Do

- Do not merge whole projects into ClawShield.
- Do not add Python dependencies to the current Node CLI just to reuse Python logic.
- Do not copy token files, local environment files, or project-specific secrets.
- Do not make ClawShield a full governance runtime yet.
- Do not chase enterprise approval flows before the scanner has excellent fixtures and demos.

## Strongest Product Path

ClawShield should become:

- `clawshield scan <skill-dir>`
- `clawshield scan-mcp <mcp.json>`
- `clawshield scan-output <text-file>`
- GitHub Action
- Web demo
- Explainable HTML/JSON report

The local codebase already contains enough material to make ClawShield much stronger without inventing from scratch.
