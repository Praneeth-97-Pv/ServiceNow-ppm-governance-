# servicenow-ppm-governance

Stage-gate approvals, change-request control and demand intake, built on **ServiceNow SPM** —
plus the MCP server used to build and verify it against a live instance.

> **Built on a personal ServiceNow developer instance (PDI) with synthetic test data.** No employer
> data, configuration or credentials are present in this repository. The specification it implements
> is my own.

## What this is

Two things that grew together:

**1. A PPM governance model** ([`ppm-build/`](ppm-build/)) — a stage-gate lifecycle with a driven
approval matrix, snapshot-based change control on project financials, and an M0 qualification gate
on demands that converts an approved demand into a project. Roughly 6,000 lines of business rules,
client scripts, script includes and the deployment tooling that installs them idempotently.

**2. A ServiceNow MCP server** ([`server.js`](server.js)) — the tool that built it. Exposes the
instance to an AI agent as typed tools (query, describe, create, update, aggregate, background
script), with a read-only mode, response truncation and a `--doctor` connection check. Everything in
`ppm-build/` was written, deployed and verified through it. See
[`docs/mcp-server.md`](docs/mcp-server.md).

## What got built

| Area | Detail |
|---|---|
| **Stage gates** | `u_pm_gates` table, 26 custom fields, 4 business rules, form sections, numbering, ACLs, navigation |
| **Change requests** | 4 business rules plus snapshot fields on `project_change_request` — financials are captured at request time so the approved delta is provable |
| **M0 demand intake** | 20 fields and 5 business rules on `dmn_demand`; on full approval the demand converts to a project |
| **Approver matrix** | `u_approver_matrix`, keyed on project type + portfolio + phase, driving approver generation across all three record types |
| **Approval rollup** | One rule on `sysapproval_approver` covering gates, change requests and demands |
| **Zero labor cost from timecards** | A separate feature, designed across eight candidate approaches and measured head to head before one was chosen |

Everything is captured in a single update set, so the whole build is portable to another instance.

## The engineering log

**[`ppm-build/README.md`](ppm-build/README.md) is the substance of this repository** — around 700
lines covering the run order, every verification result, the options considered and rejected with
the measurements behind each call, and the gotchas that cost real time.

A few worth surfacing, because they are the kind of thing you only learn by hitting them:

- **`sys_script.name` is `VARCHAR(40)`.** Longer names truncate *silently*, so an upsert matching on
  `name=` never finds the record and creates a duplicate on every deploy. `deploy.js` now fails fast
  on this rather than quietly accumulating rules.
- **Creating a field auto-adds it to the default form section** (the platform rule "Add New Column To
  Form Section"), so fields appear twice after a build unless you re-run the duplicate check.
- **`GlideAggregate` SUM disagrees with a `getValue()` loop** on the cost plan breakdown columns. The
  loop is correct. Do not "optimise" it into an aggregate.
- **`cost_plan_breakdown.estimate_to_completion` is virtual** with a calculation script — it cannot
  be written. `actual` is `read_only` but *is* script-writable.
- **Approvals on an inactive record are voided** by the out-of-box "Moot Approvals Upon Cancellation"
  rule, which filters on `active=false`. M0 validation therefore blocks requests on a closed demand.

## Verification

The build is verified by scripts in the repository, not by inspection — `12_verify.js` covers the
gate and change-request lifecycle, `37/38_m0_verify.js` the demand process, and `59_edge_cases_test.js`
the edge cases. Results, including the checks that did *not* pass and why, are recorded in the
engineering log rather than summarised away.

One example of that honesty being useful: the source specification states that a gate closes when all
approvals are granted, but no rule in it actually sets the parent approval field when the
`sysapproval_approver` records all approve. That was confirmed empirically on both record types
before a rollup rule was written to close the gap — the alternative would have been assuming the
spec was complete and shipping a lifecycle that silently never closed.

## Quickstart

Requires Node 18+ and a ServiceNow PDI.

```bash
cp .env.example .env
# fill in your instance URL, username and password
node server.js --doctor
```

Deploy the build:

```bash
node server.js --run ppm-build/01_fields.js   # prerequisite fields
node ppm-build/deploy.js                      # business rules + client scripts
node ppm-build/deploy_si.js                   # script includes
node server.js --run ppm-build/06_form_layout.js
node server.js --run ppm-build/08_seed.js     # synthetic test data
node server.js --run ppm-build/12_verify.js   # verification
```

Both deploy scripts are idempotent — re-running them updates in place rather than duplicating.

Run any script against the instance with filtered output:

```bash
node server.js --run ppm-build/<file>.js
```

## Repository layout

```
server.js              MCP server + `--run` CLI for background scripts
ppm-build/
  README.md            the engineering log — start here
  br/                  15 business rules
  cs/                  6 client scripts
  si/                  2 script includes (approver matrix, gate financials AJAX)
  deploy.js            idempotent business rule + client script deployment
  deploy_si.js         idempotent script include deployment
  fetch_si.js          pull an out-of-box script include down for reference
  00–60_*.js           the numbered build, diagnostic and verification scripts
docs/mcp-server.md     MCP server setup, tools and configuration
```

`ppm-build/oob/` is gitignored. `fetch_si.js` writes ServiceNow's own out-of-box source there for
reference while working; that is the vendor's code, not mine, so it stays local.

## Deliberately not built

Two decisions were left open rather than invented, because the specification did not cover them and
guessing would have produced governance nobody asked for:

1. **Gate sequencing.** Nothing auto-creates the P0 → P1 → P2a → P2b → P3 set for a project, or opens
   the next gate when one closes. The specification describes a single gate's lifecycle only.
2. **The out-of-box demand `Approve` button.** ServiceNow's own `Approve` / `Reject` / `Qualify` /
   `Screen` buttons on `dmn_demand` only flip `state` — they do not touch `sysapproval_approver` and
   are not wired to M0. Making `Approve` drive M0 would mean overriding out-of-box behaviour, which
   is a decision for whoever owns the instance.

## Licence

MIT — see [LICENSE](LICENSE). ServiceNow is a trademark of ServiceNow, Inc.; this project is not
affiliated with or endorsed by ServiceNow.
