# PPM CR and Gate — implementation of my stage-gate specification

The engineering log for this build: the run order, every verification result, the options considered
and rejected with the measurements behind each call, and the gotchas worth knowing before you hit
them yourself. Written as work happened, so it reads chronologically and records what failed
alongside what worked.

Implements a stage-gate and change-request specification I wrote
(`PPM_CR_and_Gate_Replication_Guide.docx`, not included here), built and verified against a Zurich
PDI with synthetic test data. Everything is captured in the update set
**"PPM CR and Gate Replication"**, so it can be exported to another instance.

## Run order

```bash
node server.js --run ppm-build/01_fields.js          # guide §2 + prerequisite fields
node server.js --run ppm-build/03_labels_dictionary.js  # guide §3
node ppm-build/deploy.js                            # guide §6 + §7 (12 records)
node server.js --run ppm-build/06_form_layout.js     # guide §4
node server.js --run ppm-build/08_seed.js            # test data
node server.js --run ppm-build/12_verify.js          # guide §10
node ppm-build/15_test_ajax.js                       # client-callable path
```

`00_verify_tables.js`, `02_verify_fields.js`, `05_find_sections.js`, `07`, `09`–`11`, `13`, `14`
are diagnostics, safe to re-run.

## What the guide assumed but the instance did not have

The guide's §1 lists prerequisites that "must already exist". None did, so they were built first,
with types inferred from how §4–§7 use each field:

| Built | Detail |
| --- | --- |
| `u_pm_gates` | new table, 26 custom fields, 4 choice lists |
| `u_approver_matrix` | new table, 5 custom fields, 2 choice lists |
| `pm_project` | `u_project_type` (+choices), `u_fy_approved_budget`, `u_total_approved_budget` |
| `project_change_request` | 18 custom fields (dates, currencies, approver lists) |

Everything from §2 onward is the document's own script, applied verbatim.

## Verification result — 21 of 22 checks pass

Passing: phase inheritance, gate-type derivation, state default, all four snapshot values on both
record types, single-save approval (no revert), matrix approver generation, additional-approver
regeneration, close-on-approval, budget writeback to the project, P3 date sync, and the negative
path (approval resets when Project Type is missing).

### The one gap: nothing rolls approver decisions up

§8.1 states *"All approvals granted — State moves to Closed"*, but no rule in the document sets
`u_approval` (or the CR's `approval`) when the `sysapproval_approver` records are all approved.
Confirmed empirically: approving every approver record leaves the parent at `requested`, on **both**
`u_pm_gates` and `project_change_request` — so it is not a `u_approval` naming problem. The OOB
rule `SNC - Run parent workflows (Approval)` only drives workflows, and neither table has one.

`Close Gate on Approval` itself works — driving `u_approval` to `approved` directly closes the gate.
The missing piece is only the rollup that should set it. Likely a Workflow or Flow on the original
instance, outside this document's "scripts only" scope.

A minimal business rule that would close the gap (**not applied** — it is not in the document):

```javascript
// sysapproval_approver | after | insert+update | order 200
(function executeRule(current, previous) {
    var TABLES = { 'u_pm_gates': 'u_approval', 'project_change_request': 'approval' };
    var field = TABLES[current.source_table + ''];
    if (!field) { return; }

    var parent = new GlideRecord(current.source_table + '');
    if (!parent.get(current.document_id + '')) { return; }

    var pending = new GlideAggregate('sysapproval_approver');
    pending.addQuery('document_id', current.document_id + '');
    pending.addQuery('state', 'requested');
    pending.addAggregate('COUNT');
    pending.query(); pending.next();

    var rejected = new GlideAggregate('sysapproval_approver');
    rejected.addQuery('document_id', current.document_id + '');
    rejected.addQuery('state', 'rejected');
    rejected.addAggregate('COUNT');
    rejected.query(); rejected.next();

    var approvedValue = current.source_table == 'u_pm_gates' ? 'approved' : 'approved';
    var rejectedValue = current.source_table == 'u_pm_gates' ? 'rejected' : 'rejected';

    if (parseInt(rejected.getAggregate('COUNT')) > 0) { parent.setValue(field, rejectedValue); }
    else if (parseInt(pending.getAggregate('COUNT')) === 0) { parent.setValue(field, approvedValue); }
    else { return; }
    parent.update();
})(current, previous);
```

## Gate process scaffolding (`18_gate_process.js`)

The guide describes gate *behaviour* but never the plumbing that makes a gate reachable. Without
this, §8.1's "Gate created from a project" is impossible in the UI. Added, following the OOB PPM
conventions found on `pm_project` / `project_change_request`:

| Item | Detail |
| --- | --- |
| Auto-numbering | `sys_number` for `u_pm_gates`, prefix `GATE`, 7 digits, from 10000 — plus a `Gate - Number` business rule at order **5** (ahead of Defaults at 10) |
| Gates related list | `u_pm_gates.u_parent` added to **all six** `pm_project` views (Default, Waterfall, WBS, Advanced, Business Case, Planning Console) |
| Navigation | "Project Gates" application menu with All Gates / Open Gates / Awaiting Approval / Create New Gate / Approver Matrix |
| ACLs | 8 record ACLs, all with `admin_overrides` |

ACL roles:

- `u_pm_gates` — read: `it_project_manager`, `it_portfolio_manager`, `it_project_user`, `sn_ppm_read`;
  write/create: the two manager roles; delete: `it_portfolio_manager`
- `u_approver_matrix` — same read set; write/create/delete: `it_portfolio_manager` only

Verified by `19_process_test.js` — **14/14 pass**: numbering assigns and increments
(`GATE0010001` → `GATE0010002`) without disturbing the snapshot rules, all five
`gate_type → phase` mappings resolve correctly, the full request → approve → close lifecycle runs,
and admin retains access through the new ACLs.

### Still not built

- **Approver rollup** — see the gap above. Not applied; it is not in the document.
- **Gate sequencing** — nothing auto-creates the P0 → P1 → P2a → P2b → P3 set for a project, or
  opens the next gate when one closes. The document describes a single gate's lifecycle only
  (§8.1) and never defines a sequence, so this was not invented.

## Duplicate fields on the PCR form (`22_fix_dupes.js`)

Creating a field via `sys_dictionary` fires the platform rule **"Add New Column To Form Section"**,
which auto-appends it to the table's default form section. So all 18 new
`project_change_request` fields landed in the header section, and §4.5 then placed 16 of them in
PCR Details as well — 16 fields shown twice on one form.

`u_pm_gates` was unaffected: its sections were created fresh and `buildSection` wipes before
rebuilding, so nothing was ever auto-appended there.

Fixed surgically rather than by rebuilding the OOB header, which uses an implicit two-column block
(`.split` at 6, `.end_split` at 12) that a naive rebuild would have destroyed:

- deleted the 16 duplicated elements from the header
- kept `u_additional_approvers` + `u_approval_not_required` there (they are not in the §4.5 Details
  layout) and paired them in a split block, mirroring the §4.3 Gate header
- moved the `activity.xml` formatter to the end so the stream stays last

Header is now 23 elements, and a cross-section check reports no duplicates on
`project_change_request` or `u_pm_gates`.

> `pm_project` has a pre-existing duplicate of `impacted_business_units` (Default view: unnamed
> section pos 19, Details section pos 12, created 2023 and March 2026). Not caused by this build
> and left untouched.

**If you add more fields by script, re-run `20_dupe_check.js`** — the auto-append rule will do the
same thing again.

## M0 process on demands (`30_m0_fields.js`, `36_m0_form.js`, `37/38_m0_verify.js`)

A gate-equivalent milestone that lives **on the demand record itself** — no new table. Same field
set, same matrix-driven approvers, same form treatment. On full approval the demand becomes a
project.

| Aspect | Gate | M0 |
| --- | --- | --- |
| Lives on | `u_pm_gates` | `dmn_demand` (20 new fields) |
| Approval field | `u_approval` | the demand's own `approval` |
| Matrix key | project_type + portfolio + phase | `u_project_type` (new) + `portfolio` + phase **`m0`** |
| Snapshot source | project's cost plans | the demand's own cost plans |
| Snapshot timing | record insert | **when approval is requested** (a demand exists long before M0) |
| On approval | State → Closed | M0 → Closed **and demand converts to a project** |

**Conversion** calls `DemandToProjectCreationHelper.createProject(demandId, 'pm_project')` — the same
helper the OOB *Create Project* button uses. It maps `portfolio → primary_portfolio`, links
`demand.project`, and advances the demand state. The rule then copies the three fields OOB does not
know about (`u_project_type`, `u_fy_approved_budget`, `u_total_approved_budget`).

> I originally planned to use the `global.DemandConversionFieldMap` extension point for that copy
> and instead did it inline in the business rule — fewer moving parts, and visible in one file.

**Guards.** M0 approval is blocked unless `type = project`, project type and portfolio are set, and
the demand is not already converted. Blocking beats approve-then-silently-skip.

**Rules added** — `sysapproval_approver`: Approval Rollup to Parent Record (after, 200).
`dmn_demand`: M0 - Snapshot Financials on Request (before, 10), M0 - Approval Request Validation
(before, 90), Generate M0 Approvals from Matrix (after, 100), M0 - Convert Demand to Project
(after, 110), M0 - Close on Approval (before, 200). Plus two client scripts and an M0 Details
section (40 elements) with the Approvers related list on three views.

### The rollup is now built

`approval_rollup.js` closes the gap flagged earlier, for **all three** tables: any rejected → parent
rejected; none pending and at least one approved → parent approved. It only acts while the parent
is `requested`, so it cannot loop. Verified: Gate and CR now roll up automatically, which makes the
guide's §8.1 lifecycle work end to end for the first time.

### Verification — 20 checks, 0 failures

Non-project demand blocked · approval holds on one save · snapshot 150,000 from the demand's own
breakdowns · two `m0` approvers generated · rollup → approved · M0 → closed · **demand
`DMND0001172` → project `PRJ0010002`** · portfolio mapped · all three custom fields inherited ·
demand state Qualified → Completed (9) · converted demand cannot re-request · Gate and CR rollup
regressions.

## Request Approval buttons (`41_request_approval_buttons.js`)

Neither the guide nor the original build had a button — approvals fired off the Approval field
changing to Requested. That works on the Gate and CR forms, where the field is visible.

**On the demand it did not: `dmn_demand.approval` was on no form at all**, so M0 approval could only
be requested by script. The verification passed while the feature was unusable from the UI.

Fixed:

- `approval` added to the demand's Default view, next to the M0 fields
- **Request Approval** button on `u_pm_gates` and `project_change_request`,
  **Request M0 Approval** on `dmn_demand`. Each is two lines — set the approval field, save:

  ```javascript
  g_form.setValue('approval', 'requested');
  g_form.save();
  ```

- Buttons hide once approval is requested or granted; the M0 button additionally requires an
  active, unconverted, `type = project` demand.

**The Approvers related list is the UI.** An earlier revision of these buttons popped a JS
`confirm()` listing the approvers first — that was removed. The `sysapproval_approver.sysapproval`
tab already shows exactly who was asked and their state, and actioning rows there is what drives the
rollup. A dialog duplicating it was noise.

> For the record: that tab is **not** OOB on demands. Every other related list on `dmn_demand`
> dates from 2021/2024; the approvers one was added by this build on 2026-07-31. What ships OOB is
> a set of buttons (`Approve`, `Reject`, `Qualify`, `Screen`) that only flip `state` — they never
> touch `sysapproval_approver`, and there is no workflow on `dmn_demand`.

If the matrix matches nothing, the generate rules now raise a real error message naming what to
check, instead of a silent `gs.warn`. Previously that left a record in `requested` with an empty
Approvers tab and no feedback.

### Guard: approvals on a closed demand are voided

The OOB task rule **"Moot Approvals Upon Cancellation"** (`filter_condition: active=false`) sets any
`requested` approval to `not_required` the instant it is created on an inactive record. A demand at
state 9 / `active=false` would therefore accept an M0 request, generate approvers, and have them
silently voided — the rollup would never fire and no project would ever be created.

`M0 - Approval Request Validation` now blocks the request on an inactive demand with an explicit
message, and the button is hidden there too. Verified both ways: approvers stay `requested` on an
active demand, and a closed demand is refused.

## Gotcha: 40-character name limit

`sys_script.name` and `sys_script_client.name` are **VARCHAR(40)**. A longer name is silently
truncated on save, so `deploy.js`'s `name=` match never finds it again and **every deploy creates
another copy**. This produced three copies each of two client scripts before it was caught.
`deploy.js` now fails fast if any name exceeds 40 characters. If you add records, keep names short.

## Data notes

- `cost_plan_breakdown.estimate_to_completion` is a **virtual field** with a `calculateETCValue`
  calculation. It cannot be written (writing 999 reads back 0) and computes to 0 on this demo data,
  so all remaining-cost snapshots are legitimately 0. Not a defect in the guide.
- `cost_plan_breakdown.actual` is `read_only=1` but script-writable — matching the guide's §9 note
  that dictionary read-only blocks the UI only.
- `GlideAggregate` SUM disagrees with a `getValue()` loop on both columns. The guide's loop-based
  `_sumBreakdowns` is the correct approach; do not "optimise" it into an aggregate.
- Test project **PRJ0010022** was seeded: `u_project_type=strategic`, FY budget 500000 (now 777000
  after the verification CR approved), total budget 2000000, plus one current-FY breakdown with
  `actual=75000`.

## Records left on the instance

Verification gate `41027927831e4b10b5ea5e65eeaad38d` and CR `d1027927831e4b10b5ea5e65eeaad3d8`
were left in place for inspection, along with 5 `u_approver_matrix` rows.

---

# Zero labor cost from time cards (separate feature)

Rate model keeps driving **planned** cost. For users on a flagged time sheet policy, submitted time
records hours but generates **no** labor cost — actuals come from expense lines and cost plans only.

Captured in its own update set, **"PPM Zero Labor Cost"** (4 records). Kept out of the CR set
deliberately; that set is back to exactly 161.

```bash
node server.js --run ppm-build/43_zero_labor_cost_build.js   # field + patch + policy
node server.js --run ppm-build/44_zero_labor_cost_test.js    # A/B proof, 7 checks
```

`40`–`42` are the read-only investigation that led here; `45` fixes update set capture.

## Why it is not configuration

Two OOB levers look like they'd do this without code. Both zero **planned** cost as well, so both
are dead ends:

- **`resource_plan.rate_override` + `resource_rate = 0`** — `RMRates.getDailyRates()` (line 27)
  honours the override on the planning path too.
- **A "Zero Cost" rate type with a 0 rate line** — the planning path derives rate type from the
  *same* time sheet policy. `RMRateModelApi.deriveRateType()` (line 89) does
  `rateModelParams.rate_type = timesheetPolicy.defaultRateType()`. Proven empirically in
  `42_prove_ratetype_shared.js`: both paths return rate type `be4717fe0b623200bcdced3ab4673a1f`
  for the same user.

Note `rate_model.rate_type` is **false** on "Group -> User -> Role", so rate type is ignored by the
engine today (`RateModelEngine.getRate` only filters on it when the model's flag is on).

## What was built

| Record | Detail |
| --- | --- |
| `time_sheet_policy.u_zero_labor_cost` | new boolean, mirrors the OOB `update_resource_plan` pattern |
| `TaskRateAPI.getRateForTimecard()` | guarded early return of a zero `DailyRates`, + `_zeroLaborCostPolicy()` helper |
| "Zero Labor Cost Policy" | cloned from the default policy, flag on. **Data — not in the update set.** |

`TaskRateAPI` is the only actuals-only rate feed: its sole caller is `TimeCardProcessHandler`.
Planning runs `RMRates` → `RMRateModelApi` and never reaches it. That is what makes one cut point
enough to zero both consumers — the expense line and the allocation daily — without touching plans.

## Verified

`44_zero_labor_cost_test.js`, same user and project, policy toggled between two weeks:

| | control (default policy) | treatment (zero policy) |
| --- | --- | --- |
| actuals rate/hr | 110 | **0** |
| expense line | 1 line, 4400 | 1 line, **0** |
| allocation daily cost | 4400 | **0** |
| allocation daily hours | 40 | **40** |
| planned rate/hr while on the policy | — | **110** |

## Gotchas

- **The zero rate must span the whole week.** Returning an empty rate array makes `DailyRates`
  fall back to `com.snc.time_card.default_rate`, which is **50** here — not 0. The guard builds an
  explicit zero range via `RateUtils.getRateObjectArrayFromRate`.
- **Do not use `glide.cost_mgmt.calc_actual_cost`** to achieve this. It gates *all* expense-line
  rollup, so it would also kill the non-labor actuals this design keeps.
- **`gs.getSession().set('sys_update_set', ...)` does not work in a background script.** The build
  script set it and the changes still landed in whichever set the session was on. `45_fix_update_set.js`
  moves them. Check capture after every scripted build.
- **The new field auto-added itself to the form section** (platform rule "Add New Column To Form
  Section"), which put a stray `Form Layout` record in the CR set. Moved. Same gotcha as §Gotchas above.
- Expense lines are still written, at **0**. That keeps the audit trail, the `cost_plan` link and
  symmetric recall. Suppressing them entirely is a different design.

## Proven end to end (46_planned_vs_actual_test.js)

The earlier gap is closed. With real allocations in place the resource plan and project numbers are
now measured, not inferred. Same user, same rate model, identical flow, policy the only variable:

| | control (default policy) | zero policy |
| --- | --- | --- |
| `resource_plan.planned_cost` | 4400 | **4400** |
| actual rate/hr | 110 | **0** |
| `resource_plan.actual_hours` | 40 | **40** |
| `resource_plan.actual_cost` | 4400 | **0** |
| expense line total | 4400 | **0** |
| `pm_project.work_cost` (actual cost) | 4400 | **0** |

Planned cost is identical across arms — the rate model still prices the user at 110/hr for planning.
Actual cost is fully zeroed. Hours are untouched.

**Expense lines are created `pending`, and `getTotalExpenseLineActualCost` sums only `processed`.**
So `pm_project.work_cost` reads 0 in *both* arms until something flips the state — the OOB
"Process Expense Allocation" job normally does. The test now flips it explicitly; without that step
the project-level assertion passes trivially and proves nothing.

`allocated_cost` reads 8800 against 40 planned hours in both arms. That is a harness artifact of
calling `createRequestedAllocations()` + `allocate()` directly instead of going through the OOB
state machine; it double counts. Same in both arms, so it does not affect the result — but do not
quote allocated_cost from this test.

## Options considered and rejected

Research (ServiceNow community + the instance) surfaced three alternatives:

| Option | OOB records modified | Zeroes project actual | Zeroes res. plan actual | Keeps planned cost |
| --- | --- | --- | --- | --- |
| **A — zero the rate in `TaskRateAPI`** (built) | 1 script include | yes, $0 line | yes | **yes** |
| **B — new BR aborting the expense line insert** | none, upgrade safe | yes, no line | **no** | yes |
| **C — zero the resource rates in the rate model** | none | yes | yes | **no** |
| **D — leave expense lines `pending`** | none | yes | no | yes |

- **C is what a ServiceNow employee recommends in the community thread** ("set the cost of all the
  internal resources as zero in the rate model", no customization). It does not work here: planning
  and actuals share the rate model *and* the rate type, so it zeroes planned cost too. That thread's
  requirement did not include preserving planned cost. Ours does. Proven in `42`.
- **B is the strongest alternative** — a new before-insert BR on `fm_expense_line` that aborts when
  `time_card` is populated and the user's policy carries the flag. Nothing OOB is touched, so it
  survives upgrades cleanly. Its gap is that `resource_plan.actual_cost` still carries labor cost,
  because that is written by `ResourceActuals` from the rate, not from the expense line. Worth taking
  if project financials are the only thing that matters.
- **D** depends on outrunning the "Process Expense Allocation" job. Not pursued.

There is no system property that gates labor expense generation — the full sweep of `sys_properties`
matching labor/expense/time_card/cost_mgmt/rate turned up nothing usable.

## Test records left on the instance

Project `a304da2f83128b10b5ea5e65eeaad3a8` ("ZLC-TEST zero labor cost project"), its resource plan,
two time cards and two expense lines. `44_zero_labor_cost_test.js` wipes and recreates them on rerun.

---

## Two implementations, measured head to head

The constraint that decides this: **other groups on the instance must be untouched**, and the
platform team gates on how close to OOTB it is.

| | **A — patch `TaskRateAPI`** | **E — new business rule only** |
| --- | --- | --- |
| OOB records modified | **1 script include** | **none** |
| New records | 1 field | 1 field, 1 script include, 1 BR |
| `resource_plan.planned_cost` | 4400 | 4400 |
| actual rate/hr | 0 | 110 (unchanged) |
| `resource_plan.actual_cost` | **0** | **4400 — not zeroed** |
| expense line | **0** | **0** |
| `pm_project.work_cost` | **0** | **0** |
| actual hours | 40 | 40 |
| isolation suite | **18/18 pass** | project financials pass |

Both keep planned cost intact and both zero the project financials. They differ on exactly one
number: the resource plan's actual cost.

### Why E cannot reach the resource plan

`ResourceActuals.updateAllocationDailyWithActuals()` and `createAllocationDailyWithActuals()` both
call **`setWorkflow(false)`** before writing, so business rules on `resource_allocation_daily` never
fire for time-card-driven actuals. A rule there was built, measured, and **deactivated**: it did
nothing, and it dragged — it fires on every row of a 46k-row table doing two queries each, which
made the isolation suite time out. Confirmed empirically, not assumed.

That leaves the rate lookup inside `TaskRateAPI` as the only place to intercept the resource plan
number, and that is OOB code. **There is no zero-modification way to zero `resource_plan.actual_cost`.**

### Which to take

**E, if the platform team gates on OOTB purity** — and the residual may actually be desirable.
`resource_plan.actual_cost` is a resource-management figure, not a project financial. Leaving it
populated means resource managers still see what the labor was worth for capacity and utilization
reporting, while Actual Cost / EAC / ETC on the project correctly exclude it. Worth confirming that
reading with whoever owns resource reporting before treating it as a defect.

**A, if the two numbers must agree.** One OOB script include becomes customer-updated and needs
review at every upgrade.

## Isolation — the constraint that matters most

`47_isolation_test.js`, 18 checks, all passing under Option A:

| scenario | result |
| --- | --- |
| user with **no policy assigned** (majority on this instance) | normal cost, 2000 |
| user explicitly on the default policy | normal cost, 2000 |
| user on the other existing policy, flag off | normal cost, 2000 |
| user on the zero policy | 0 |
| **mixed project**, normal + zero user together | project actual = **2000**, the normal user only |
| project with **no rate model** (rate card path) | normal 2000, zero 0 |
| recall on the zero policy | nets to 0, no stray lines |

The mixed-project row is the one to show the dev team: two users on one project, one charging
normally and one not, and the project total is exactly the normal user.

## Housekeeping

- `49_cleanup_testdata.js` purges everything tagged `ZLC-TEST` / `PVA-TEST` / `ISO-TEST`. Run it —
  deleting allocation dailies is slow and the HTTP call may time out while the script keeps going
  server side. Re-run until the counts read 0.
- A `java.lang.NullPointerException` surfaces from the OOB rule *"Rollup estimated cost to
  Project/Demand"* on `cost_plan_breakdown` when the fixtures create cost plans. Pre-existing,
  not caused by either option, but it is noise in the logs.

## Isolation under Option E — 16/18, and the 2 "failures" are test artifacts

| scenario | rate/hr | expense | plan.actual_cost | project actual |
| --- | --- | --- | --- | --- |
| no policy assigned (majority) | 50 | 2000 | 2000 | 2000 |
| explicit default policy | 50 | 2000 | 2000 | 2000 |
| other policy, flag off | 50 | 2000 | 2000 | 2000 |
| **zero labor cost policy** | 50 | **0** | 2000 | **0** |
| **mixed project** | — | normal 2000 / zero 0 | — | **2000, normal user only** |
| no rate model (rate card path) | 50 | **0** | — | — |
| recall on the zero policy | — | nets to **0** | — | — |

The two failing checks assert `rate === 0`, which is Option A's *mechanism*. Under E the rate is
deliberately left alone (50) and the zeroing happens downstream at the expense line — so those are
the test asserting the wrong implementation, not a defect. Every business-outcome check passes.

**Isolation is total under E**: the three non-flagged variants are byte-identical to unmodified
behaviour, because the rule returns immediately unless the time card's user sits on a flagged policy.

The mixed-project result holds under E too — project actual cost is exactly the normal user's 2000.
And the rate-card path (no rate model) is covered, because the rule keys off the expense line's
`time_card` reference rather than off how the rate was resolved.

---

# Option F — classify labor lines into a third state (RECOMMENDED)

Rather than zeroing the amount, park the line in a state that nothing picks up and nothing sums.
The amount stays **real**, so the project keeps a full audit trail of what the labor was worth —
it simply never reaches Actual Cost.

| state | daily "Process Expense Allocation" job | actual-cost rollups |
| --- | --- | --- |
| `pending` | picks it up, processes it | — |
| `processed` | — | **sums it** |
| **`excluded`** (new) | **never sees it** | **never sums it** |

```bash
node server.js --run ppm-build/53_third_state_build.js   # choice + BR
node server.js --run ppm-build/54_third_state_test.js    # 10 checks
```

## Why not simply leave them `pending`

`ExpenseAllocator.processRules()` sets `state = "processed"` **unconditionally** at line 137, and
the daily job re-queries every `pending` row. Parking lines in `pending` means fighting that job
forever, with its working set growing without bound. A third state sidesteps it: the job's query
never matches, so there is no churn and nothing to fight.

## Safety precondition — verified, not assumed

`52_third_state_safety.js` scans every script in the instance that touches `fm_expense_line`.
**Thirteen consumers sum money and all thirteen filter `state=processed`** — `Update Planned Task
Actual Cost`, `Project Actual Cost Rollup`, `Update Program Actual Cost`, `Update actuals on
investment record`, `PPMFundManager`, `ActualCostCalculationHelper`, `ExpenseLinesHelper`,
`FinancialsWidgetUtil`, and others. Introducing a third state therefore cannot leak into any of them.

Two scan hits needed manual clearing:
- **`DemandActualUtil`** — safe. It filters `state=processed` inside `addEncodedQuery`, which the
  regex missed. Relevant to the M0 demand path.
- **`Update Contract Lifetime Cost`** — a genuine unfiltered `SUM` over expense lines, but scoped to
  `source_id` = contract. Time card lines point at the project or demand, so it never sees them.

`state` is already `choice=1`, `max_length=40`, so a third value needs no dictionary change.

## Verified — 10/10

| | control (no policy) | excluded (flagged policy) |
| --- | --- | --- |
| `resource_plan.planned_cost` | 2000 | **2000** |
| expense line amount | 2000 | **2000 — preserved, not zeroed** |
| expense line state | `pending` -> `processed` | **`excluded`** |
| daily job picked up | 1 line | **0 lines** |
| `pm_project.work_cost` | 2000 | **0** |
| actual hours | 40 | 40 |
| **mixed project, both users** | \multicolumn | project actual = **2000, normal user only** |

## Footprint — the reason to prefer this

| | A — patch `TaskRateAPI` | E — zero the amount | **F — third state** |
| --- | --- | --- | --- |
| OOB records modified | 1 script include | none | **none** |
| New records | 1 field | 1 field, 1 SI, 1 BR | **1 field, 1 SI, 1 BR, 1 choice** |
| expense line value | 0 | 0 | **preserved** |
| audit trail of labor value | lost | lost | **kept** |
| `pm_project.work_cost` | 0 | 0 | **0** |
| `resource_plan.actual_cost` | 0 | 2000 | **2000** |
| planned cost | intact | intact | **intact** |

F beats E on the audit trail and beats A on upgrade safety. All three leave planned cost alone.

## The one number F does not reach

`resource_plan.actual_cost` still reads the full labor value (2000), because it is written by
`ResourceActuals` from the rate, not from the expense line — and `setWorkflow(false)` in that class
makes it unreachable from any business rule. Identical to Option E. Only Option A zeroes it, and
only by patching OOB code.

Whether that is a defect depends on who consumes it. It is a resource-management figure, not a
project financial: leaving it populated means resource managers still see the labour value for
capacity and utilisation while the project's Actual Cost / EAC / ETC correctly exclude it. Confirm
that reading with whoever owns resource reporting.

---

# Option G — label-driven (FINAL DESIGN)

Supersedes A, E and F. The policy carries a label, the label is stamped onto the expense line, and
a rule acts on the label.

```
time_sheet_policy.u_labor_expense_label = "non_chargeable"
        |  the user's policy carries the label
        v
fm_expense_line.u_labor_expense_label          <- stamped at insert
        |  only when category = "labor" and the line came from a time card
        v
state = "excluded"                              <- "anything with this label"
        |
        v  daily job only queries "pending"; rollups only sum "processed"
never picked up, never counted -- amount left intact
```

```bash
node server.js --run ppm-build/56_label_driven_build.js
node server.js --run ppm-build/57_label_driven_test.js   # 11 checks
```

## Why stamp instead of re-deriving

The label becomes a **historical fact on the record**. If a user moves off the policy later, past
expense lines keep the classification they were raised under. It is also directly filterable and
reportable, instead of requiring a walk back through time card -> user -> policy on every read.

## How labor is identified

`fm_expense_line.category` is a choice field with exactly three values — `labor`, `hardware`,
`software`. `TaskRateProcessor._createExpenseLine()` hardcodes `exp.setCategory("labor")` when
raising a line from a time card. That is the only OOB labor marker; there is no separate flag.

## Deliberately NOT scoped to projects

Resource hours are not planned or submitted against demands in this process, so a project-only
condition would guard a case that does not occur. Demands receive the same treatment; the test
records this as informational rather than asserting it, so the behaviour is known if the process
ever changes.

## Verified — 11/11

| scenario | label | state | amount | project actual |
| --- | --- | --- | --- | --- |
| project + labelled user | `non_chargeable` | **`excluded`** | **2000, preserved** | **0** |
| project + normal user | — | `pending` -> `processed` | 2000 | 2000 |
| project **task** + labelled | `non_chargeable` | `excluded` | 2000 | — |
| **mixed project** | — | — | — | **2000, normal user only** |
| demand (informational) | `non_chargeable` | `excluded` | 2000 | not asserted |

Daily job picked up **0** lines for labelled users, **1** for normal ones. Project tasks inherit the
treatment, which matters because most time lands on tasks rather than the project header.

## Footprint

| record | type |
| --- | --- |
| `time_sheet_policy.u_labor_expense_label` | new field |
| `fm_expense_line.u_labor_expense_label` | new field |
| 3 choices (2 label, 1 `state=excluded`) | new |
| `PPMLaborExpenseLabel` | new script include |
| `PPM Stamp Labor Label` | new BR, before insert, order 140 |
| `PPM Exclude Labelled Labor` | new BR, before insert/update, order 150 |

**Zero OOB records modified.** The second rule is gated on a cheap field check
(`JSUtil.notNil(current.u_labor_expense_label)`) so it costs almost nothing on rows it does not apply to.

## Still open

- `resource_plan.actual_cost` continues to carry the labor value, as with E and F. Only Option A
  reaches it, and only by patching OOB code. See the Option F section for the reasoning on whether
  that is a defect.
- Superseded rules `PPM Labor Cost Excluded` and `PPM Zero Labor Cost - *` are left **inactive** on
  the instance rather than deleted, so the earlier options can be compared. Delete before export.

## Edge cases — 12/12 (59_edge_cases_test.js)

The paths most likely to hide a defect, all passing:

| case | result |
| --- | --- |
| **recall of an EXCLUDED line** | negative counterpart is also stamped and excluded — project actual stays **0**, does not go negative |
| recall of a normal line (control) | nets back to 0 correctly |
| user moved **off** the policy | existing lines **keep** the label and stay excluded |
| user moved **onto** the policy | only **new** lines are labelled; earlier ones untouched |
| project with no rate model | labelled and excluded correctly |

The recall case was the real risk: `_recallExpenseLine` raises a **negative** line, and had it been
processed while the original was excluded, project actual cost would have gone negative. It is
stamped on insert like any other line, so it is excluded too.

The two policy-movement cases are what justify stamping rather than re-deriving — the label is a
historical fact, not a live lookup.

## Rollout tooling (60_rollout_tooling.js)

- **Backfill**, dry run by default (`COMMIT = false`). Finds labor expense lines that already exist
  for labelled users, reports how many and how much value would leave actual cost, and lists the
  affected projects. Setting `COMMIT = true` applies the label and state with workflow **on**, so the
  OOB rollup recomputes project actual cost. **This rewrites historical financials — confirm with
  finance before running it.**
- **Saved report** `Non-chargeable labor by project` on `fm_expense_line`, filtered
  `state=excluded^u_labor_expense_labelISNOTEMPTY`, grouped by task, SUM of amount. Makes the
  excluded value discoverable in the UI instead of only by query.
  *Note:* the OOB rule "Report roles updated - is_publish field" resets `is_published` to false when
  roles are empty, so the report is currently visible only to its creator. Set roles or publish it
  by hand if it needs to be shared.

## Option H — OOB Rate Type as the label: rejected, with measurements

Using `time_sheet_policy.default_rate_type` (OOB) as the label would need **zero custom fields**.
`rate_model.rate_type` is false, so the engine ignores rate type and planning would be safe.
Rejected on three measured grounds:

1. **The control becomes user-escapable.** `defaultRateType()` only returns a value when
   `allow_multiple_rate_types = true`, and `Restrict Ratetype Update` only blocks changes when that
   flag is **off**. Enabling what the design needs is exactly what lets users change their rate type
   and escape the exclusion.
2. **Audit amounts would be wrong.** Both labor rate cards have an empty `rate_type`, so a new rate
   type matches neither, `getRateCardWithRateType()` returns null, and the rate falls back to
   `com.snc.time_card.default_rate` = 50 instead of the real 75/100 on rate-card projects.
3. **Hidden dependency.** It only works while `rate_model.rate_type` stays false. Anyone ticking that
   box later breaks planning and actuals for those users with no visible link to this feature.

Also `fm_expense_line.rate_type` is empty on **all 132,848 rows** — it is never populated in practice,
so the rule would dot-walk to the time card anyway, losing the stamped-history property.

**Conclusion: the current design is at the meaningful OOTB line.** The distinction platform teams
enforce is *do not modify OOB records*, which this satisfies completely. Two `u_` fields on OOB
tables is the sanctioned extension pattern and is categorically different from patching
`TaskRateAPI`. Trading them for an escapable control, wrong audit values and a hidden dependency
would be a worse design, not a purer one.

## Deliberately NOT merged

The two rules could be collapsed into one to halve per-insert overhead. Not done: the second rule's
condition is a single field check (`JSUtil.notNil(current.u_labor_expense_label)`), so the saving is
negligible, and keeping them separate preserves the "anything carrying a label" semantic — a second
label with different treatment can be added without touching the stamping rule.
