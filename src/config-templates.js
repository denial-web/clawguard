const defaultAgentTemplate = {
  enabled: true,
  provider: "mock",
  model: null,
  safetyProfile: "developer",
  stateDir: ".clawguard/agent",
  auditPath: ".clawguard/agent/audit.jsonl",
  memoryPath: ".clawguard/agent/memory.jsonl",
  sessionsDir: ".clawguard/agent/sessions",
  backupsDir: ".clawguard/agent/backups",
  proposedDir: ".clawguard/agent/proposed",
  trustedSkillDirs: ["skills"],
  trustedSkillsDir: ".clawguard/agent/skills",
  approvalPath: ".clawguard/approvals.jsonl",
  decisionsPath: ".clawguard/decisions.jsonl",
  autoWriteMemory: false,
  memoryReadLimit: 50,
  memoryScope: "workspace",
  shellTimeoutMs: 10000,
  shellMaxBufferBytes: 262144,
  outputLimitBytes: 65536,
  integrations: {
    webSearch: {
      provider: null,
      apiKeyEnv: null,
      baseUrl: null
    },
    webFetch: {
      enabled: false,
      maxBytes: 65536
    },
    github: {
      allowedRepos: [],
      tokenEnv: "GITHUB_TOKEN",
      apiBase: "https://api.github.com",
      mock: false
    },
    notifications: {
      telegram: {
        chatId: null,
        botTokenEnv: "TELEGRAM_BOT_TOKEN",
        apiBase: "https://api.telegram.org"
      }
    }
  }
};

export const configTemplates = {
  "local-first": {
    description: "Prefer local models for privacy and keep cloud usage tightly budgeted.",
    config: {
      policy: "governed",
      failOn: "critical",
      failOnPolicy: true,
      policyFailOn: "manual_review",
      maxFileSizeBytes: "1mb",
      maxFindingsPerRulePerFile: 5,
      budgets: {
        approvalRequestUsd: 0.02,
        maxRequestUsd: 0.10,
        maxTotalTokens: 100000
      },
      models: [
        {
          provider: "example",
          model: "cheap-model",
          inputUsdPer1M: 0.05,
          outputUsdPer1M: 0.10
        },
        {
          provider: "example",
          model: "strong-model",
          inputUsdPer1M: 1,
          outputUsdPer1M: 2
        }
      ],
      modelRouting: {
        defaultProfile: "local",
        approvalProfiles: ["premium"],
        longContextTokens: 64000,
        premiumContextTokens: 180000,
        profiles: {
          local: {
            model: "ollama/llama3.3",
            description: "Private local model for everyday work.",
            fallbacks: ["example/cheap-model"]
          },
          cheap: {
            model: "example/cheap-model",
            description: "Low-cost cloud model for non-private simple work.",
            fallbacks: ["example/strong-model"]
          },
          strong: {
            model: "example/strong-model",
            description: "Stronger model for coding, security, and tool-heavy work.",
            fallbacks: ["example/cheap-model"]
          },
          premium: {
            model: "example/premium-model",
            description: "Premium model, gated by approval.",
            approvalRequired: true,
            fallbacks: ["example/strong-model"]
          }
        }
      },
      agent: defaultAgentTemplate,
      suppressions: []
    }
  },
  "cloud-balanced": {
    description: "Balanced cloud-first setup with approval before premium spend.",
    config: {
      policy: "governed",
      failOn: "critical",
      failOnPolicy: true,
      policyFailOn: "manual_review",
      maxFileSizeBytes: "1mb",
      maxFindingsPerRulePerFile: 5,
      budgets: {
        approvalRequestUsd: 0.10,
        maxRequestUsd: 0.50,
        maxTotalTokens: 180000
      },
      models: [
        {
          provider: "example",
          model: "cheap-model",
          inputUsdPer1M: 0.05,
          outputUsdPer1M: 0.10
        },
        {
          provider: "example",
          model: "strong-model",
          inputUsdPer1M: 1,
          outputUsdPer1M: 2
        },
        {
          provider: "example",
          model: "premium-model",
          inputUsdPer1M: 3,
          outputUsdPer1M: 8
        }
      ],
      modelRouting: {
        defaultProfile: "cheap",
        approvalProfiles: ["premium"],
        longContextTokens: 64000,
        premiumContextTokens: 180000,
        profiles: {
          local: {
            model: "ollama/llama3.3",
            description: "Optional local model for private work.",
            fallbacks: ["example/cheap-model"]
          },
          cheap: {
            model: "example/cheap-model",
            description: "Low-cost model for simple everyday tasks.",
            fallbacks: ["example/strong-model"]
          },
          strong: {
            model: "example/strong-model",
            description: "Strong model for coding, security, and tool-heavy work.",
            fallbacks: ["example/premium-model", "example/cheap-model"]
          },
          premium: {
            model: "example/premium-model",
            description: "Premium model for hard or long-context tasks.",
            approvalRequired: true,
            fallbacks: ["example/strong-model"]
          }
        }
      },
      agent: defaultAgentTemplate,
      suppressions: []
    }
  },
  "enterprise-strict": {
    description: "Strict governance with conservative budgets and premium approval.",
    config: {
      policy: "enterprise",
      failOn: "high",
      failOnPolicy: true,
      policyFailOn: "warn",
      maxFileSizeBytes: "1mb",
      maxFindingsPerRulePerFile: 5,
      budgets: {
        approvalRequestUsd: 0.03,
        maxRequestUsd: 0.20,
        maxInputTokens: 120000,
        maxOutputTokens: 20000,
        maxTotalTokens: 140000
      },
      models: [
        {
          provider: "example",
          model: "cheap-model",
          inputUsdPer1M: 0.05,
          outputUsdPer1M: 0.10
        },
        {
          provider: "example",
          model: "strong-model",
          inputUsdPer1M: 1,
          outputUsdPer1M: 2
        },
        {
          provider: "example",
          model: "premium-model",
          inputUsdPer1M: 3,
          outputUsdPer1M: 8
        }
      ],
      modelRouting: {
        defaultProfile: "cheap",
        approvalProfiles: ["strong", "premium"],
        longContextTokens: 32000,
        premiumContextTokens: 120000,
        profiles: {
          local: {
            model: "ollama/llama3.3",
            description: "Local model for private low-risk work.",
            fallbacks: ["example/cheap-model"]
          },
          cheap: {
            model: "example/cheap-model",
            description: "Low-cost model for simple low-risk work.",
            fallbacks: ["example/strong-model"]
          },
          strong: {
            model: "example/strong-model",
            description: "Strong model, approval-gated in enterprise mode.",
            approvalRequired: true,
            fallbacks: ["example/cheap-model"]
          },
          premium: {
            model: "example/premium-model",
            description: "Premium model, approval-gated in enterprise mode.",
            approvalRequired: true,
            fallbacks: ["example/strong-model"]
          }
        }
      },
      agent: {
        ...defaultAgentTemplate,
        safetyProfile: "business"
      },
      suppressions: []
    }
  },
  "financial-internal": {
    description: "Financial AI governance for internal read, draft, recommendation, and low-risk employee workflows.",
    config: {
      policy: "enterprise",
      failOn: "high",
      failOnPolicy: true,
      policyFailOn: "manual_review",
      maxFileSizeBytes: "1mb",
      maxFindingsPerRulePerFile: 5,
      budgets: {
        approvalRequestUsd: 0.02,
        maxRequestUsd: 0.10,
        maxTotalTokens: 100000
      },
      models: [
        {
          provider: "example",
          model: "bank-private-model",
          inputUsdPer1M: 0.25,
          outputUsdPer1M: 1
        }
      ],
      modelRouting: {
        defaultProfile: "local",
        approvalProfiles: ["strong", "premium"],
        longContextTokens: 32000,
        premiumContextTokens: 120000,
        profiles: {
          local: {
            model: "local/private-financial-model",
            description: "Private model profile for internal financial workflows.",
            fallbacks: ["example/bank-private-model"]
          },
          strong: {
            model: "example/bank-private-model",
            description: "Approved strong model for sensitive internal work.",
            approvalRequired: true,
            fallbacks: ["local/private-financial-model"]
          },
          premium: {
            model: null,
            description: "Premium model is intentionally unconfigured until approved by the institution.",
            approvalRequired: true,
            fallbacks: ["example/bank-private-model"]
          }
        }
      },
      actionGovernance: {
        profile: "financial-internal",
        blockedActions: ["money-movement"],
        dualApprovalActions: ["customer-impacting"],
        reviewActions: ["write-local", "install-skill", "send-external"],
        sensitiveDataClasses: ["customer-pii", "payment-data", "credentials", "regulatory"]
      },
      agent: {
        ...defaultAgentTemplate,
        safetyProfile: "strict"
      },
      suppressions: []
    }
  },
  "financial-sensitive": {
    description: "Financial AI governance for customer data, regulatory material, and sensitive operational workflows.",
    config: {
      policy: "enterprise",
      failOn: "medium",
      failOnPolicy: true,
      policyFailOn: "warn",
      maxFileSizeBytes: "1mb",
      maxFindingsPerRulePerFile: 5,
      budgets: {
        approvalRequestUsd: 0.01,
        maxRequestUsd: 0.05,
        maxInputTokens: 80000,
        maxOutputTokens: 12000,
        maxTotalTokens: 92000
      },
      models: [
        {
          provider: "example",
          model: "bank-private-model",
          inputUsdPer1M: 0.25,
          outputUsdPer1M: 1
        }
      ],
      modelRouting: {
        defaultProfile: "local",
        approvalProfiles: ["strong", "premium"],
        longContextTokens: 32000,
        premiumContextTokens: 100000,
        profiles: {
          local: {
            model: "local/private-financial-model",
            description: "Default for sensitive financial data.",
            fallbacks: ["example/bank-private-model"]
          },
          strong: {
            model: "example/bank-private-model",
            description: "Approved strong model, gated by owner approval.",
            approvalRequired: true,
            fallbacks: ["local/private-financial-model"]
          },
          premium: {
            model: null,
            description: "Premium or public cloud model requires explicit bank approval.",
            approvalRequired: true,
            fallbacks: ["example/bank-private-model"]
          }
        }
      },
      actionGovernance: {
        profile: "financial-sensitive",
        blockedActions: ["money-movement"],
        dualApprovalActions: ["send-external", "customer-impacting"],
        reviewActions: ["read", "draft", "recommend", "write-local", "install-skill"],
        sensitiveDataClasses: ["customer-pii", "payment-data", "credentials", "regulatory"]
      },
      agent: {
        ...defaultAgentTemplate,
        safetyProfile: "strict"
      },
      suppressions: []
    }
  },
  "financial-critical": {
    description: "Financial AI governance for critical workflows; blocks money movement and final regulated decisions by default.",
    config: {
      policy: "enterprise",
      failOn: "low",
      failOnPolicy: true,
      policyFailOn: "warn",
      maxFileSizeBytes: "1mb",
      maxFindingsPerRulePerFile: 5,
      budgets: {
        approvalRequestUsd: 0,
        maxRequestUsd: 0.02,
        maxInputTokens: 40000,
        maxOutputTokens: 8000,
        maxTotalTokens: 48000
      },
      models: [
        {
          provider: "example",
          model: "bank-private-model",
          inputUsdPer1M: 0.25,
          outputUsdPer1M: 1
        }
      ],
      modelRouting: {
        defaultProfile: "local",
        approvalProfiles: ["local", "strong", "premium"],
        longContextTokens: 24000,
        premiumContextTokens: 80000,
        profiles: {
          local: {
            model: "local/private-financial-model",
            description: "Private model, still approval-gated for critical workflows.",
            approvalRequired: true,
            fallbacks: []
          },
          strong: {
            model: "example/bank-private-model",
            description: "Approved strong model, approval-gated.",
            approvalRequired: true,
            fallbacks: ["local/private-financial-model"]
          },
          premium: {
            model: null,
            description: "Premium model unavailable until explicitly configured.",
            approvalRequired: true,
            fallbacks: ["example/bank-private-model"]
          }
        }
      },
      actionGovernance: {
        profile: "financial-critical",
        blockedActions: ["money-movement", "customer-impacting"],
        dualApprovalActions: ["send-external", "write-local", "install-skill"],
        reviewActions: ["read", "draft", "recommend"],
        sensitiveDataClasses: ["customer-pii", "payment-data", "credentials", "regulatory"]
      },
      agent: {
        ...defaultAgentTemplate,
        safetyProfile: "strict"
      },
      suppressions: []
    }
  }
};

export const defaultConfigTemplateProfile = "local-first";

export function getConfigTemplate(profile = defaultConfigTemplateProfile) {
  const template = configTemplates[profile];

  if (!template) {
    throw new Error(`Unknown init profile: ${profile}. Use one of: ${Object.keys(configTemplates).join(", ")}`);
  }

  return structuredClone(template);
}
