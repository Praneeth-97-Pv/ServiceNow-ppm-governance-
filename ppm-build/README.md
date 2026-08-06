# The build

Implementation of a stage-gate and change-request specification I wrote, built and verified against
a Zurich developer instance with synthetic test data.

This is the working log: the run order, what the specification assumed that the instance did not
have, the verification results, and the platform gotchas that cost real time. It records what did
not work alongside what did.

## Run order

```bash
node server.js --run ppm-build/01_fields.js       # prerequisite fields
node server.js --run ppm-build/02_labels_dictionary.js
node ppm-build/deploy.js                          # business rules + client scripts
node ppm-build/deploy_si.js                       # script includes
node server.js --run ppm-build/03_form_layout.js  # two-column form sections
node server.js --run ppm-build/04_dupe_check.js   # see the duplicate-field gotcha below
node server.js --run ppm-build/05_fix_dupe_fields.js
node server.js --run ppm-build/06_gate_process.js # numbering, related lists, navigation, ACLs
node server.js --run ppm-build/07_request_approval_buttons.js
node server.js --run ppm-build/08_m0_fields.js    # M0 on demands
node server.js --run ppm-build/09_m0_form.js
node server.js --run ppm-build/10_seed.js         # synthetic test data
node server.js --run ppm-build/11_verify.js       # gate + change request
node ppm-build/12_verify_ajax.js                  # client-callable path
node server.js --run ppm-build/13_verify_m0.js    # demand -> project conversion
```

Both deploy scripts are idempotent — re-running updates in place rather than duplicating.

## What the specification assumed but the instance did not have

Its prerequisites section listed things that "must already exist". None did, so they were built
first, with types inferred from how the later sections use each field:

| Built | Detail |
| --- | --- |
| `u_pm_gates` | new table, 26 custom fields, 4 choice lists |
| `u_approver_matrix` | new table, 5 custom fields, 2 choice lists |
| `pm_project` | `u_project_type` (+ choices), `u_fy_approved_budget`, `u_total_approved_budget` |
| `project_change_request` | 18 custom fields (dates, currencies, approver lists) |

## Verification

**Gate and change request — 21 of 22 checks pass.** Phase inheritance, gate-type derivation, state
default, all four snapshot values on both record types, single-save approval (no revert), matrix
approver generation, additional-approver regeneration, close-on-approval, budget writeback to the
project, P3 date sync, and the negative path (approval resets when Project Type is missing).

**Gate process — 14 of 14.** Numbering assigns and increments (`GATE0010001` → `GATE0010002`)
without disturbing the snapshot rules, all five `gate_type → phase` mappings resolve, the full
request → approve → close lifecycle runs, and admin retains access through the new ACLs.

**M0 on demands — 20 checks, 0 failures.** Non-project demand blocked, approval holds on one save,
snapshot taken from the demand's own breakdowns, two `m0` approvers generated, rollup to approved,
M0 closed, **demand converted to a project**, portfolio mapped, all three custom fields inherited,
demand state advanced, converted demand cannot re-request, plus gate and CR rollup regressions.

### The one check that failed, and why it mattered

The specification states that a gate closes when all approvals are granted. But no rule in it sets
the parent approval field when the `sysapproval_approver` records all approve.

Confirmed empirically rather than assumed: approving every approver record left the parent at
`requested` on **both** `u_pm_gates` and `project_change_request`, so it was not a field-naming
problem. The OOB rule `SNC - Run parent workflows (Approval)` only drives workflows, and neither
table has one. `Close Gate on Approval` itself worked — driving the approval field directly did
close the gate. The missing piece was only the rollup that should set it.

[`br/approval_rollup.js`](br/approval_rollup.js) closes it for all three tables: any rejected →
parent rejected; none pending and at least one approved → parent approved. It only acts while the
parent is `requested`, so it cannot loop. This is what makes the specified lifecycle work end to
end.

## M0 on demands

A gate-equivalent milestone that lives **on the demand record itself** — no new table. Same field
set, same matrix-driven approvers, same form treatment. On full approval the demand becomes a
project.

| Aspect | Gate | M0 |
| --- | --- | --- |
| Lives on | `u_pm_gates` | `dmn_demand` (20 new fields) |
| Approval field | `u_approval` | the demand's own `approval` |
| Matrix key | project type + portfolio + phase | `u_project_type` + `portfolio` + phase **`m0`** |
| Snapshot source | project's cost plans | the demand's own cost plans |
| Snapshot timing | record insert | **when approval is requested** (a demand exists long before M0) |
| On approval | state → Closed | M0 → Closed **and the demand converts to a project** |

Conversion calls `DemandToProjectCreationHelper.createProject(demandId, 'pm_project')` — the same
helper the OOB *Create Project* button uses. It maps `portfolio → primary_portfolio`, links
`demand.project`, and advances the demand state. The rule then copies the three fields OOB does not
know about.

> That copy was originally planned to go through the `global.DemandConversionFieldMap` extension
> point. It is done inline in the business rule instead — fewer moving parts, and visible in one
> file.

**Guards.** M0 approval is blocked unless `type = project`, project type and portfolio are set, and
the demand is not already converted. Blocking beats approve-then-silently-skip.

## Request Approval buttons

Neither the specification nor the first build had a button — approvals fired off the Approval field
changing to Requested. That works on the gate and CR forms, where the field is visible.

**On the demand it did not: `dmn_demand.approval` was on no form at all**, so M0 approval could only
be requested by script. The verification passed while the feature was unusable from the UI.

Fixed: `approval` added to the demand's Default view, and a **Request Approval** button on
`u_pm_gates` and `project_change_request`, **Request M0 Approval** on `dmn_demand`. Each is two
lines — set the field, save. Buttons hide once approval is requested or granted; the M0 button
additionally requires an active, unconverted, `type = project` demand.

**The Approvers related list is the UI.** An earlier revision popped a JS `confirm()` listing the
approvers first. It was removed: the `sysapproval_approver.sysapproval` tab already shows exactly
who was asked and their state, and actioning rows there is what drives the rollup. A dialog
duplicating it was noise.

> That tab is **not** OOB on demands. Every other related list on `dmn_demand` predates this build;
> the approvers one was added by it. What ships OOB is a set of buttons (`Approve`, `Reject`,
> `Qualify`, `Screen`) that only flip `state` — they never touch `sysapproval_approver`, and there
> is no workflow on `dmn_demand`.

If the matrix matches nothing, the generate rules raise a real error naming what to check, instead
of a silent `gs.warn`. Previously that left a record in `requested` with an empty Approvers tab and
no feedback.

## Gotchas

### `sys_script.name` is VARCHAR(40)

`sys_script.name` and `sys_script_client.name` are **VARCHAR(40)**. A longer name is silently
truncated on save, so `deploy.js`'s `name=` match never finds it again and **every deploy creates
another copy**. This produced three copies each of two client scripts before it was caught.
`deploy.js` now fails fast if any name exceeds 40 characters. Keep names short.

### Creating a field auto-adds it to the default form section

Creating a field via `sys_dictionary` fires the platform rule **"Add New Column To Form Section"**,
which auto-appends it to the table's default form section. All 18 new `project_change_request`
fields landed in the header section, and the layout step then placed 16 of them in PCR Details as
well — 16 fields shown twice on one form.

`u_pm_gates` was unaffected: its sections were created fresh, and `buildSection` wipes before
rebuilding, so nothing was ever auto-appended there.

Fixed surgically rather than by rebuilding the OOB header, which uses an implicit two-column block
(`.split` at 6, `.end_split` at 12) that a naive rebuild would have destroyed.

**If you add more fields by script, re-run `04_dupe_check.js`** — the auto-append rule will do the
same thing again.

### Approvals on an inactive record are voided

The OOB task rule **"Moot Approvals Upon Cancellation"** (`filter_condition: active=false`) sets any
`requested` approval to `not_required` the instant it is created on an inactive record. A demand at
`active=false` would therefore accept an M0 request, generate approvers, and have them silently
voided — the rollup would never fire and no project would ever be created.

`M0 - Approval Request Validation` blocks the request on an inactive demand with an explicit
message, and the button is hidden there too. Verified both ways: approvers stay `requested` on an
active demand, and a closed demand is refused.

### Cost plan data

- `cost_plan_breakdown.estimate_to_completion` is a **virtual field** with a `calculateETCValue`
  calculation. It cannot be written (writing 999 reads back 0) and computes to 0 on this data, so
  remaining-cost snapshots are legitimately 0. Not a defect in the specification.
- `cost_plan_breakdown.actual` is `read_only=1` but script-writable — dictionary read-only blocks
  the UI only.
- **`GlideAggregate` SUM disagrees with a `getValue()` loop** on both columns. The loop-based
  `_sumBreakdowns` is correct; do not "optimise" it into an aggregate.

## Deliberately not built

- **Gate sequencing.** Nothing auto-creates the P0 → P1 → P2a → P2b → P3 set for a project, or opens
  the next gate when one closes. The specification describes a single gate's lifecycle and never
  defines a sequence, so one was not invented.
- **The OOB demand `Approve` button.** Wiring it to M0 would mean overriding out-of-box behaviour,
  which is a decision for whoever owns the instance.
