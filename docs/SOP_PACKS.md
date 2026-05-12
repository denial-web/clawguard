# SOP Packs

ClawGuard SOP Packs are a governance layer for making AI agents behave more like trained business staff.

The goal is not to replace lawyers, accountants, food safety managers, HR professionals, or compliance officers. The goal is to give agents clear operating boundaries:

- what role they are acting as
- what task they are allowed to perform
- what evidence they must collect
- what actions require human approval
- what actions are blocked
- what records must be retained
- which source links justify the checklist

Most business rules do not simply say "write an SOP." They require written plans, training, permits, logs, retention, approvals, safe practices, and inspection readiness. SOP Packs translate those requirements into agent-readable checklists and policy gates.

## Product Shape

Current commands:

```bash
clawguard sop list
clawguard sop init --pack small-business/milk-tea/closing --out milk-tea-close.json
clawguard sop init --industry cafe --out cafe-close.json
clawguard sop init --industry mart --out mart-close.json
clawguard sop check --pack small-business/milk-tea/closing ./agent-workflow.json
```

Current industry shortcuts:

```bash
clawguard sop init --industry cafe
clawguard sop init --industry milk-tea
clawguard sop init --industry mart
clawguard sop check --industry cafe ./agent-workflow.json
clawguard sop check --industry mart ./agent-workflow.json
```

Current repo structure:

```text
sop-packs/
  small-business/
    cafe/closing.json
    milk-tea/closing.json
    mart/daily-close.json
  restaurant/
  hr-staffing/
  import-export/
schemas/
  sop-pack.schema.json
src/sop/
  loader.js
  checker.js
  evidence.js
test/
  sop-pack.test.js
```

## Universal Small-Business SOP Baseline

Every small-business SOP Pack should include:

| SOP | Why it matters | Agent behavior |
| --- | --- | --- |
| License and permit register | Local business permits, health permits, sales tax, resale permits, signage, fire, or zoning may apply. | Agent may remind and assemble a checklist, but must not claim legal completion without owner confirmation. |
| Opening checklist | Prevents missed safety, cash, equipment, and readiness steps. | Agent can guide checklist completion and log evidence. |
| Closing checklist | Prevents cash, security, cleaning, refrigeration, and inventory mistakes. | Agent can require manager sign-off before marking complete. |
| Cash handling | Reduces theft, reconciliation errors, and missing deposit records. | Agent can calculate variance and escalate above threshold. |
| Inventory receiving | Confirms quantity, damage, expiry dates, supplier docs, and cost. | Agent can compare invoice to received items and flag mismatch. |
| Supplier onboarding | Helps manage product quality, payment terms, tax forms, and compliance. | Agent can collect data and require owner approval before supplier is trusted. |
| Employee onboarding | Covers offer, tax forms, I-9 where applicable, training, and policies. | Agent can prepare tasks and reminders; it must not discriminate or make final hiring decisions. |
| Timekeeping and payroll evidence | Wage/hour and employment tax records are common legal requirements. | Agent can remind, validate completeness, and flag missing hours. |
| Safety and incident log | Supports OSHA-style injury, hazard, and incident readiness. | Agent can record incidents and escalate severe events immediately. |
| Customer complaint handling | Creates consistent service recovery and product safety escalation. | Agent can draft response and escalate refunds, injury, illness, or legal threats. |
| Data privacy and access | Protects employee, customer, supplier, and payment data. | Agent should apply least privilege and avoid storing sensitive data unless required. |

## Cafe Pack

Primary workflows:

- opening espresso/bar readiness
- food and drink prep checklist
- milk and refrigerated item temperature checks
- pastry/food receiving and expiry checks
- allergen note handling
- cleaning and sanitizing
- cash drawer opening/closing
- customer complaint and refund escalation

Required evidence examples:

- opening checklist completed by shift lead
- fridge/freezer temperature log
- cleaning log
- supplier invoice or delivery note
- cash drawer reconciliation
- incident/complaint log when applicable

Blocked or approval-required agent actions:

- approve expired food use
- ignore failed temperature logs
- approve refund above owner-set threshold
- change staff schedule without manager confirmation
- mark cleaning complete without human confirmation

## Milk Tea Shop Pack

Milk tea has the same base risk as a cafe, plus high-volume ingredient prep and batch controls.

Primary workflows:

- tea brewing batch log
- tapioca/boba cooking and hold-time log
- dairy and non-dairy storage checks
- syrup/topping prep and expiry labels
- allergen and cross-contact controls
- delivery app order verification
- rush-hour queue and remake handling

Required evidence examples:

- batch start/end time
- discard time for boba or prepared toppings
- refrigeration temperature log
- allergen disclosure confirmation
- remake/refund reason

Blocked or approval-required agent actions:

- extend prepared topping hold time without manager approval
- mark allergen-sensitive order complete without human check
- substitute ingredient when allergen risk is unknown
- override product recall or supplier hold notice

## Mart / Convenience Store Pack

Primary workflows:

- daily opening/closing
- cash drawer and safe drop
- receiving and shelf stocking
- expiry date rotation
- alcohol/tobacco age-restricted sale reminder, where applicable
- lottery or regulated product handling, where applicable
- vendor delivery discrepancy
- incident, theft, or safety event report

Required evidence examples:

- cash reconciliation
- receiving count versus invoice
- expired/damaged item disposal log
- age-check policy acknowledgement for restricted goods
- shift incident log

Blocked or approval-required agent actions:

- approve sale of age-restricted goods
- delete or alter incident records
- approve inventory shrink write-off above threshold
- accept vendor substitution without manager review
- override product recall or safety hold

## Toy Shop Pack

Toy shops have lower food risk but higher product safety, age suitability, recalls, and child-safety concerns.

Primary workflows:

- product receiving and supplier verification
- age-label and warning-label check
- product recall check
- damaged packaging handling
- return/refund processing
- customer complaint escalation for injury or choking hazard
- seasonal inventory and display safety

Required evidence examples:

- supplier invoice
- product SKU, batch, or lot where available
- age warning label confirmed
- recall check result for high-risk items
- damage or return reason

Blocked or approval-required agent actions:

- list or sell recalled products
- override missing age-warning label
- ignore injury, choking, battery, magnet, or chemical complaint
- approve child-safety claim not supported by product documentation
- delete customer safety complaint records

## Restaurant / Fast Food Chain Pack

This is the scaled version of cafe and milk tea operations.

Primary workflows:

- food receiving
- time and temperature control
- cooking, cooling, reheating, and holding
- employee illness policy
- allergen handling
- sanitation and pest control
- equipment maintenance
- franchise/brand audit
- shift handoff

Key source family:

- FDA Food Code and state/local adoption
- OSHA safety and injury reporting
- local health department rules
- franchise operating standards when applicable

## HR / Staffing Pack

Primary workflows:

- job description review
- candidate screening
- interview scoring
- background check consent
- adverse action process
- I-9 completion and retention
- anti-discrimination review
- AI hiring tool review

Blocked or approval-required agent actions:

- make final hiring or rejection decision
- screen using protected characteristics
- run background checks without required notice/authorization
- ask prohibited medical/genetic questions
- change employee status without human review

## Import / Export Pack

Primary workflows:

- supplier onboarding and due diligence
- product classification
- import document checklist
- customs broker handoff
- export control review
- sanctions screening
- forced labor supply chain review
- shipment hold and escalation

Blocked or approval-required agent actions:

- approve sanctioned party transaction
- clear high-risk shipment without compliance review
- alter customs documents
- bypass forced-labor hold
- file classification or license conclusion as final without human approval

## Legal Source Map

These sources should be linked from generated SOP Packs instead of copied wholesale:

- SBA business licenses and permits: https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits
- DOL workplace posters: https://www.dol.gov/general/topics/posters/
- DOL FLSA recordkeeping: https://www.dol.gov/general/topic/wages/wagesrecordkeeping
- IRS employment tax recordkeeping: https://www.irs.gov/businesses/small-businesses-self-employed/employment-tax-recordkeeping
- USCIS Form I-9: https://www.uscis.gov/i-9
- EEOC recordkeeping: https://www.eeoc.gov/employers/recordkeeping-requirements
- OSHA recordkeeping: https://www.osha.gov/recordkeeping/
- OSHA emergency action plans: https://www.osha.gov/etools/evacuation-plans-procedures/eap/
- FDA Food Code: https://www.fda.gov/food/retail-food-protection/fda-food-code
- FDA Employee Health Policy Tool: https://www.fda.gov/food/retail-food-protection/fda-employee-health-policy-tool
- FTC background checks and FCRA: https://www.ftc.gov/business-guidance/resources/background-checks-what-employers-need-know
- DOJ ADA AI hiring guidance: https://www.ada.gov/resources/ai-guidance/
- BIS export compliance program: https://www.bis.gov/developing-an-export-compliance-program
- CBP basic importing/exporting: https://www.cbp.gov/trade/basic-import-export
- OFAC compliance framework: https://ofac.treasury.gov/media/16331/download

## Implementation Priority

Current MVP:

- `schemas/sop-pack.schema.json`
- `sop-packs/small-business/cafe/closing.json`
- `sop-packs/small-business/milk-tea/closing.json`
- `sop-packs/small-business/mart/daily-close.json`
- `examples/sop-workflows/cafe-closing-incomplete.json`
- `examples/sop-workflows/cafe-closing-complete.json`
- `examples/sop-workflows/milk-tea-closing-incomplete.json`
- `examples/sop-workflows/milk-tea-closing-complete.json`
- `examples/sop-workflows/mart-daily-close-incomplete.json`
- `examples/sop-workflows/mart-daily-close-complete.json`
- `clawguard sop list`
- `clawguard sop init`
- `clawguard sop check`

Next implementation priorities:

1. Add starter packs for toy shop, restaurant, and fast food.
2. Add richer evidence scoring and approval gates.
3. Add HR/staffing and import/export after the small-business pack proves useful.

The fastest demo should be a milk tea shop shift close:

```text
Task: close the shop
Decision: manual_review
Missing evidence:
- boba discard time
- fridge temperature log
- cash drawer reconciliation
- manager sign-off
Blocked:
- mark close complete without human confirmation
```
