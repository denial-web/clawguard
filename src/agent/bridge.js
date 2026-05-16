export function getAgentBridgeSpec() {
  return {
    schemaVersion: "clawguard.agentBridgeSpec.v1",
    purpose: "External browser/app executors can propose one action at a time; ClawGuard validates, approval-gates, and audits before any bridge executes.",
    flow: [
      "bridge creates agent-action proposal JSON",
      "clawguard agent proposal validate <proposal.json>",
      "clawguard agent proposal explain <proposal.json>",
      "clawguard agent proposal run <proposal.json>",
      "bridge executes only approved action ids",
      "bridge returns execution result for audit"
    ],
    proposalTools: [
      "browser.open",
      "browser.extract",
      "browser.click_proposed",
      "browser.type_proposed",
      "app.open_proposed",
      "app.action_proposed"
    ],
    hardBoundaries: [
      "No blanket bridge permission.",
      "No password, token, seed phrase, payment, or credential entry.",
      "No payment, purchase, transfer, destructive, submit, send, or delete action without high-risk approval.",
      "No localhost or private URL access unless explicitly high-risk allowed.",
      "No hidden or ambiguous selectors.",
      "No real browser or desktop control inside ClawGuard core in v0.4."
    ],
    executionContract: {
      approvedActionIdRequired: true,
      oneActionPerApproval: true,
      bridgeMustReturn: {
        actionId: "string",
        ok: "boolean",
        status: "completed|blocked|error",
        summary: "string",
        artifacts: "array"
      }
    }
  };
}

