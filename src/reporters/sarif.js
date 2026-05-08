import { ruleCatalogById } from "../rule-catalog.js";

const sarifVersion = "2.1.0";
const sarifSchema = "https://json.schemastore.org/sarif-2.1.0.json";

export function createSarifReport(scanResult) {
  const findings = scanResult.findings ?? [];

  return {
    version: sarifVersion,
    $schema: sarifSchema,
    runs: [
      {
        tool: {
          driver: {
            name: "ClawShield",
            informationUri: "https://github.com/denial-web/clawshield",
            rules: createRules(findings)
          }
        },
        invocations: [
          {
            executionSuccessful: true,
            properties: {
              target: scanResult.target,
              score: scanResult.score,
              level: scanResult.level,
              policyDecision: scanResult.policy?.decision ?? "allow",
              policyPreset: scanResult.policy?.preset ?? "personal"
            }
          }
        ],
        results: findings.map(createResult)
      }
    ]
  };
}

function createRules(findings) {
  const rules = new Map();

  for (const finding of findings) {
    if (rules.has(finding.ruleId)) {
      continue;
    }

    rules.set(finding.ruleId, {
      id: finding.ruleId,
      name: finding.ruleId,
      shortDescription: {
        text: finding.title
      },
      fullDescription: {
        text: finding.recommendation
      },
      help: {
        text: finding.recommendation,
        markdown: finding.recommendation
      },
      defaultConfiguration: {
        level: sarifLevelForSeverity(finding.severity)
      },
      properties: {
        severity: finding.severity,
        category: metadataFor(finding.ruleId).category,
        tags: metadataFor(finding.ruleId).tags
      }
    });
  }

  return [...rules.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function metadataFor(ruleId) {
  return ruleCatalogById.get(ruleId) ?? {
    category: "uncategorized",
    tags: []
  };
}

function createResult(finding) {
  return {
    ruleId: finding.ruleId,
    level: sarifLevelForSeverity(finding.severity),
    message: {
      text: `${finding.title}. ${finding.recommendation}`
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: finding.file
          },
          region: {
            startLine: finding.line,
            snippet: {
              text: finding.evidence
            }
          }
        }
      }
    ],
    properties: {
      severity: finding.severity,
      evidence: finding.evidence,
      recommendation: finding.recommendation
    }
  };
}

function sarifLevelForSeverity(severity) {
  if (severity === "critical" || severity === "high") {
    return "error";
  }

  if (severity === "medium") {
    return "warning";
  }

  return "note";
}
