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
