export const REGULATED_DOMAINS = new Set([
  "finance",
  "legal",
  "tax",
  "health",
  "pricing",
  "platform_rules"
]);

export const FINDING_CODES = Object.freeze({
  UNVERIFIED_NUMBER_IN_REGULATED_DOMAIN: "UNVERIFIED_NUMBER_IN_REGULATED_DOMAIN",
  VERIFIED_WITHOUT_TRACE: "VERIFIED_WITHOUT_TRACE",
  AUTHORITY_OVERREACH: "AUTHORITY_OVERREACH",
  UNGATED_SIDE_EFFECT: "UNGATED_SIDE_EFFECT",
  BANNED_TACTIC: "BANNED_TACTIC",
  COST_CEILING_EXCEEDED: "COST_CEILING_EXCEEDED",
  HIGH_UNVERIFIED_NUMBER_COUNT: "HIGH_UNVERIFIED_NUMBER_COUNT",
  STATUS_DOWNGRADED: "STATUS_DOWNGRADED"
});

const SIDE_EFFECT_ACTION_KINDS = new Set([
  "external_write",
  "payment",
  "shell",
  "file_write"
]);

/**
 * @typedef {"assumed" | "inferred" | "verified"} ClaimStatus
 * @typedef {"low" | "medium" | "high"} Confidence
 * @typedef {"general" | "finance" | "legal" | "tax" | "health" | "platform_rules" | "pricing"} EvidenceDomain
 *
 * @typedef {object} VerificationTrace
 * @property {string} tool
 * @property {string} source
 * @property {"web" | "file" | "user" | "runtime" | string} sourceKind
 * @property {string} timestamp
 *
 * @typedef {object} RawEvidenceEntry
 * @property {string} claim
 * @property {string} basis
 * @property {ClaimStatus} status
 * @property {Confidence} confidence
 * @property {boolean} needsVerification
 * @property {EvidenceDomain} domain
 * @property {boolean} isNumeric
 *
 * @typedef {RawEvidenceEntry & {
 *   verifiedBy: VerificationTrace | null,
 *   _statusLockedBySystem: true,
 *   downgradeReason?: string
 * }} SealedEvidenceEntry
 *
 * @typedef {Record<string, VerificationTrace>} VerificationMap
 *
 * @typedef {object} ProposedAction
 * @property {"external_write" | "payment" | "file_write" | "shell" | "other" | string} kind
 * @property {string} description
 * @property {boolean} hasApprovalGate
 *
 * @typedef {object} DecisionAuthority
 * @property {string[]} canDecide
 * @property {string[]} needsApproval
 * @property {string[]} neverWithoutHuman
 *
 * @typedef {object} CriticInput
 * @property {"simple" | "multi_step_business" | "professional_role" | "high_risk" | "tool_action" | "strategy_review"} scopeClass
 * @property {string} draft
 * @property {RawEvidenceEntry[]} ledger
 * @property {VerificationMap} verifications
 * @property {ProposedAction[]} proposedActions
 * @property {DecisionAuthority=} decisionAuthority
 * @property {string[]=} bannedTactics
 * @property {number} modelCalls
 * @property {number} costEstimate
 * @property {number} costCeiling
 *
 * @typedef {"fail" | "warn"} FindingSeverity
 *
 * @typedef {object} CriticFinding
 * @property {string} code
 * @property {FindingSeverity} severity
 * @property {string} message
 * @property {unknown=} detail
 *
 * @typedef {object} CriticResult
 * @property {boolean} passed
 * @property {CriticFinding[]} findings
 * @property {SealedEvidenceEntry[]} sealedLedger
 * @property {{
 *   unverifiedNumbers: number,
 *   regulatedUnverified: number,
 *   authorityViolations: number,
 *   ungatedActions: number,
 *   bannedTacticHits: number,
 *   statusDowngrades: number
 * }} counts
 */

/**
 * Deterministically seals a model-proposed evidence ledger against runtime
 * verification traces. The model may request "verified"; only a runtime trace
 * can grant it.
 *
 * @param {RawEvidenceEntry[]} ledger
 * @param {VerificationMap} verifications
 * @returns {{ sealedLedger: SealedEvidenceEntry[], statusDowngrades: number, downgradeFindings: CriticFinding[] }}
 */
export function sealLedger(ledger = [], verifications = {}) {
  let statusDowngrades = 0;
  const downgradeFindings = [];
  const sealedLedger = normalizeArray(ledger).map((entry) => {
    const claim = String(entry?.claim ?? "");
    const trace = verifications?.[claim] ?? null;

    if (trace) {
      return {
        ...entry,
        claim,
        status: "verified",
        verifiedBy: trace,
        _statusLockedBySystem: true
      };
    }

    if (entry?.status === "verified") {
      statusDowngrades += 1;
      const sealed = {
        ...entry,
        claim,
        status: "inferred",
        verifiedBy: null,
        _statusLockedBySystem: true,
        downgradeReason: "Model requested verified status without a runtime verification trace."
      };
      downgradeFindings.push(finding(
        FINDING_CODES.STATUS_DOWNGRADED,
        "warn",
        "Model-requested verified claim was downgraded because no runtime verification trace exists.",
        { claim }
      ));
      return sealed;
    }

    return {
      ...entry,
      claim,
      verifiedBy: null,
      _statusLockedBySystem: true
    };
  });

  return {
    sealedLedger,
    statusDowngrades,
    downgradeFindings
  };
}

/**
 * Runs the deterministic Professional Worker critic gate.
 *
 * @param {CriticInput} input
 * @returns {CriticResult}
 */
export function runCritic(input = {}) {
  const { sealedLedger, statusDowngrades, downgradeFindings } = sealLedger(input.ledger, input.verifications);
  const proposedActions = normalizeArray(input.proposedActions);
  const findings = [...downgradeFindings];
  const counts = {
    unverifiedNumbers: 0,
    regulatedUnverified: 0,
    authorityViolations: 0,
    ungatedActions: 0,
    bannedTacticHits: 0,
    statusDowngrades
  };

  for (const entry of sealedLedger) {
    const unverifiedNumber = Boolean(entry.isNumeric) && entry.status !== "verified";
    const regulated = REGULATED_DOMAINS.has(entry.domain);

    if (unverifiedNumber) {
      counts.unverifiedNumbers += 1;
    }

    if (unverifiedNumber && regulated) {
      counts.regulatedUnverified += 1;
      if (entry.needsVerification === false) {
        findings.push(finding(
          FINDING_CODES.UNVERIFIED_NUMBER_IN_REGULATED_DOMAIN,
          "fail",
          "Unverified numeric claim in a regulated domain was presented without requiring verification.",
          { claim: entry.claim, domain: entry.domain }
        ));
      }
    }

    if (entry.status === "verified" && !entry.verifiedBy) {
      findings.push(finding(
        FINDING_CODES.VERIFIED_WITHOUT_TRACE,
        "fail",
        "Verified claim has no runtime verification trace.",
        { claim: entry.claim }
      ));
    }
  }

  for (const action of proposedActions) {
    if (SIDE_EFFECT_ACTION_KINDS.has(action?.kind) && action.hasApprovalGate !== true) {
      counts.ungatedActions += 1;
      findings.push(finding(
        FINDING_CODES.UNGATED_SIDE_EFFECT,
        "fail",
        "Side-effect action is missing an approval gate.",
        { kind: action?.kind, description: action?.description ?? "" }
      ));
    }
  }

  const authorityViolations = findAuthorityViolations(proposedActions, input.decisionAuthority);
  counts.authorityViolations = authorityViolations.length;
  for (const violation of authorityViolations) {
    findings.push(finding(
      FINDING_CODES.AUTHORITY_OVERREACH,
      "fail",
      "Proposed action matches a never-without-human authority boundary without an approval gate.",
      violation
    ));
  }

  const bannedTacticHits = findBannedTactics(input.draft, input.bannedTactics);
  counts.bannedTacticHits = bannedTacticHits.length;
  for (const hit of bannedTacticHits) {
    findings.push(finding(
      FINDING_CODES.BANNED_TACTIC,
      "fail",
      "Draft contains a banned tactic.",
      hit
    ));
  }

  if (isFiniteNumber(input.costEstimate) && isFiniteNumber(input.costCeiling) && input.costEstimate > input.costCeiling) {
    findings.push(finding(
      FINDING_CODES.COST_CEILING_EXCEEDED,
      "fail",
      "Professional worker request exceeded the configured cost ceiling.",
      { costEstimate: input.costEstimate, costCeiling: input.costCeiling }
    ));
  }

  if (counts.unverifiedNumbers >= 3) {
    findings.push(finding(
      FINDING_CODES.HIGH_UNVERIFIED_NUMBER_COUNT,
      "warn",
      "Draft contains three or more unverified numeric claims.",
      { unverifiedNumbers: counts.unverifiedNumbers }
    ));
  }

  return {
    passed: !findings.some((item) => item.severity === "fail"),
    findings,
    sealedLedger,
    counts
  };
}

function findAuthorityViolations(actions, decisionAuthority) {
  const terms = normalizeArray(decisionAuthority?.neverWithoutHuman)
    .map((term) => normalizeText(term))
    .filter(Boolean);
  if (terms.length === 0) {
    return [];
  }

  const violations = [];
  for (const action of actions) {
    if (action?.hasApprovalGate === true) {
      continue;
    }

    const description = normalizeText(action?.description ?? "");
    const matchedTerm = terms.find((term) => description.includes(term));
    if (matchedTerm) {
      violations.push({
        term: matchedTerm,
        kind: action?.kind,
        description: action?.description ?? ""
      });
    }
  }
  return violations;
}

function findBannedTactics(draft, bannedTactics) {
  const draftRaw = String(draft ?? "").toLowerCase();
  const draftNormalized = normalizeText(draftRaw);
  const hits = [];

  for (const tactic of normalizeArray(bannedTactics)) {
    const raw = String(tactic ?? "").trim().toLowerCase();
    if (!raw) {
      continue;
    }

    const normalized = normalizeText(raw);
    const variants = new Set([
      raw,
      raw.replace(/_/g, " "),
      raw.replace(/-/g, " "),
      raw.replace(/[_-]/g, " "),
      normalized
    ]);

    if ([...variants].some((variant) => draftRaw.includes(variant) || draftNormalized.includes(normalizeText(variant)))) {
      hits.push({ tactic: raw });
    }
  }

  return dedupeByKey(hits, (hit) => hit.tactic);
}

function finding(code, severity, message, detail) {
  return {
    code,
    severity,
    message,
    ...(detail === undefined ? {} : { detail })
  };
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function dedupeByKey(items, keyFn) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}
