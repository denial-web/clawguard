import assert from "node:assert/strict";
import { createActionPlan } from "../src/action-governor.js";
import test from "node:test";

test("financial action plan blocks money movement", () => {
  const plan = createActionPlan({
    actionType: "money-movement",
    dataClass: "payment-data",
    task: "Transfer customer funds"
  });

  assert.equal(plan.decision, "block");
  assert.equal(plan.requiredActions.includes("do-not-execute"), true);
});

test("financial action plan requires dual approval for customer-impacting actions", () => {
  const plan = createActionPlan({
    actionType: "customer-impacting",
    dataClass: "customer-pii",
    task: "Prepare a fraud case status update"
  });

  assert.equal(plan.decision, "dual_approval");
  assert.equal(plan.requiredActions.includes("maker-checker-approval"), true);
});

test("financial action plan blocks same maker and checker for sensitive actions", () => {
  const plan = createActionPlan({
    actionType: "send-external",
    dataClass: "customer-pii",
    actor: "analyst-1",
    checker: "analyst-1",
    task: "Send customer data to an external review mailbox"
  });

  assert.equal(plan.decision, "block");
  assert.equal(plan.approvalChain.segregationOfDuties, false);
});

test("financial action plan allows low-risk internal draft work", () => {
  const plan = createActionPlan({
    actionType: "draft",
    dataClass: "internal",
    task: "Draft an internal branch handoff note"
  });

  assert.equal(plan.decision, "allow");
  assert.equal(plan.requiredActions.length, 0);
});
