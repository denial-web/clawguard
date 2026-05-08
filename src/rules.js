export const rules = [
  {
    id: "remote-code-execution",
    title: "Downloads or executes remote code",
    severity: "critical",
    patterns: [
      /\bcurl\b[\s\S]{0,120}?\|\s*(?:sh|bash|zsh|python|node)\b/i,
      /\bwget\b[\s\S]{0,120}?\|\s*(?:sh|bash|zsh|python|node)\b/i,
      /\b(?:sh|bash|zsh|python|node)\s+<\s*\([^)]*\b(?:curl|wget)\b[^)]*https?:\/\/[^)]+\)/i,
      /\binvoke-webrequest\b[\s\S]{0,160}?\|\s*(?:iex|invoke-expression)\b/i
    ],
    recommendation: "Review the download source manually and run only in a sandbox."
  },
  {
    id: "install-lifecycle-script",
    title: "Defines package install lifecycle scripts",
    severity: "high",
    patterns: [
      /"(?:preinstall|install|postinstall|prepare)"\s*:\s*"[^"]+"/i,
      /'(?:preinstall|install|postinstall|prepare)'\s*:\s*'[^']+'/i
    ],
    recommendation: "Review install scripts carefully because they run during dependency installation."
  },
  {
    id: "credential-access",
    title: "References sensitive credential locations",
    severity: "critical",
    patterns: [
      /\.ssh\/(?:id_rsa|id_ed25519|config|known_hosts)/i,
      /\b(?:aws_access_key_id|aws_secret_access_key)\b/i,
      /\.aws\/credentials/i,
      /\.npmrc/i,
      /\.pypirc/i,
      /\b(?:GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|HF_TOKEN)\b/i,
      /\b(?:read|access|copy|steal|exfiltrate|upload|send)\b[\s\S]{0,80}?\b(?:passwords?|passwd|secrets?|private[_ -]?keys?)\b/i
    ],
    recommendation: "Do not grant this skill broad filesystem or environment access without review."
  },
  {
    id: "destructive-shell",
    title: "Contains destructive shell operations",
    severity: "high",
    patterns: [
      /\brm\s+-rf\s+(?:\/|\$HOME|~|\.)/i,
      /\bchmod\s+-R\s+777\b/i,
      /\bmkfs(?:\.[a-z0-9]+)?\b/i,
      /\bdd\s+if=.*\bof=\/dev\//i,
      /\b(?:shutdown|reboot)\b/i
    ],
    recommendation: "Block by default unless the exact command is expected and reviewed."
  },
  {
    id: "obfuscated-execution",
    title: "Uses obfuscated or dynamic code execution",
    severity: "high",
    patterns: [
      /\b(?:eval|Function)\s*\(/i,
      /\bbase64\b[\s\S]{0,80}?\b(?:-d|--decode)\b[\s\S]{0,80}?\|/i,
      /\bpowershell\b[\s\S]{0,120}?-(?:enc|encodedcommand)\b/i,
      /\bnode\b[\s\S]{0,80}?\b-e\b/i,
      /\bpython(?:3)?\b[\s\S]{0,80}?\b-c\b/i
    ],
    recommendation: "Avoid dynamic execution unless the exact payload is visible and reviewed."
  },
  {
    id: "data-exfiltration",
    title: "May upload local data to an external destination",
    severity: "high",
    patterns: [
      /\b(?:curl|wget)\b[\s\S]{0,120}?\b(?:--data|-d|--form|-F|--upload-file|--data-binary)\b/i,
      /\bscp\b[\s\S]{0,160}?@/i,
      /\brsync\b[\s\S]{0,160}?\b(?:ssh|@)/i,
      /\bnc\b[\s\S]{0,120}?\b(?:-w|-q|--send-only)\b/i
    ],
    recommendation: "Confirm exactly what data leaves the machine and which domain receives it."
  },
  {
    id: "prompt-injection",
    title: "Contains prompt-injection style instructions",
    severity: "high",
    patterns: [
      /ignore (?:all )?(?:previous|prior|above) instructions/i,
      /do not (?:tell|reveal|mention|disclose) (?:the user|anyone)/i,
      /hide (?:this|these) instructions/i,
      /system prompt/i,
      /developer message/i,
      /exfiltrate/i
    ],
    recommendation: "Treat as untrusted instructions and inspect the full skill content."
  },
  {
    id: "broad-permissions",
    title: "Requests broad tool or filesystem permissions",
    severity: "medium",
    patterns: [
      /\b(?:read|write|modify|delete)\b[\s\S]{0,80}?\b(?:all files|entire filesystem|home directory|\$HOME|~\/)\b/i,
      /\b(?:full|entire|all)\b[\s\S]{0,40}?\b(?:home directory|filesystem|file system)\b/i,
      /\b(?:shell|terminal|command execution)\b/i,
      /\b(?:browser|email|calendar|slack|github)\b[\s\S]{0,80}?\b(?:write|send|delete|post|create)\b/i
    ],
    recommendation: "Prefer least-privilege permissions and require approval for write actions."
  },
  {
    id: "network-access",
    title: "Uses network access or external services",
    severity: "low",
    patterns: [
      /https?:\/\/[^\s)]+/i,
      /\b(?:fetch|axios|request)\s*\(/i,
      /\b(?:webhook|api endpoint|callback url)\b/i
    ],
    recommendation: "Confirm the domain is expected and avoid sending secrets to external services."
  }
];

export const severityWeights = {
  low: 10,
  medium: 25,
  high: 45,
  critical: 70
};
