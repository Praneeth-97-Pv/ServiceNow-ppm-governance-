#!/usr/bin/env node
/**
 * Deploy the business rules and client scripts from ../ppm-build/{br,cs} into ServiceNow.
 * Idempotent: matches on table + name and PATCHes, otherwise POSTs.
 *
 *   node ppm-build/deploy.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0 && !(t.slice(0, i).trim() in process.env)) {
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const BASE = process.env.SERVICENOW_INSTANCE_URL.replace(/\/+$/, '');
const AUTH =
  'Basic ' +
  Buffer.from(`${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`).toString('base64');

async function api(pathname, { method = 'GET', query, body } = {}) {
  const url = new URL(pathname, BASE);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON from ${pathname} (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${method} ${pathname}: ${JSON.stringify(json.error || json)}`);
  }
  return json.result;
}

async function upsert(table, matchQuery, fields, label) {
  const existing = await api(`/api/now/table/${table}`, {
    query: { sysparm_query: matchQuery, sysparm_fields: 'sys_id', sysparm_limit: '1' },
  });
  if (existing.length) {
    await api(`/api/now/table/${table}/${existing[0].sys_id}`, { method: 'PATCH', body: fields });
    console.log(`  UPDATED  ${label}`);
    return existing[0].sys_id;
  }
  const created = await api(`/api/now/table/${table}`, { method: 'POST', body: fields });
  console.log(`  CREATED  ${label}`);
  return created.sys_id;
}

const br = (f) => fs.readFileSync(path.join(__dirname, 'br', f), 'utf8');
const cs = (f) => fs.readFileSync(path.join(__dirname, 'cs', f), 'utf8');

// Guide section 7 — condition strings are set on the rule record, not in the script body.
const GATE_APPROVAL_CONDITION =
  "(current.operation() == 'insert' && current.u_approval == 'requested') " +
  "|| current.u_approval.changesTo('requested') " +
  "|| (current.u_approval == 'requested' " +
  "&& (current.u_additional_approvers.changes() || current.u_approval_not_required.changes()))";

const CR_APPROVAL_CONDITION =
  "(current.operation() == 'insert' && current.approval == 'requested') " +
  "|| current.approval.changesTo('requested') " +
  "|| (current.approval == 'requested' " +
  "&& (current.u_additional_approvers.changes() || current.u_approval_not_required.changes()))";

const M0_APPROVAL_CONDITION =
  "(current.operation() == 'insert' && current.approval == 'requested') " +
  "|| current.approval.changesTo('requested') " +
  "|| (current.approval == 'requested' " +
  "&& (current.u_additional_approvers.changes() || current.u_approval_not_required.changes()))";

const BUSINESS_RULES = [
  // --- Gate numbering (process scaffolding, not in the guide) ---
  { name: 'Gate - Number', table: 'u_pm_gates', when: 'before', ins: true, upd: false, order: 5, file: 'gate_number.js' },
  // --- Gate (7.2) ---
  { name: 'Gate - Defaults and Snapshots', table: 'u_pm_gates', when: 'before', ins: true, upd: true, order: 10, file: 'gate_defaults_and_snapshots.js' },
  { name: 'Gate - Approval Request Validation', table: 'u_pm_gates', when: 'before', ins: true, upd: true, order: 90, file: 'gate_approval_request_validation.js' },
  { name: 'Generate Gate Approvals from Matrix', table: 'u_pm_gates', when: 'after', ins: true, upd: true, order: 100, file: 'gate_generate_approvals.js', cond: GATE_APPROVAL_CONDITION },
  { name: 'Close Gate on Approval', table: 'u_pm_gates', when: 'before', ins: false, upd: true, order: 200, file: 'gate_close_on_approval.js' },
  // --- Change Request (7.3) ---
  { name: 'CR - Approval Request Validation', table: 'project_change_request', when: 'before', ins: true, upd: true, order: 90, file: 'cr_approval_request_validation.js' },
  { name: 'Snapshot Project Financials on CR Create', table: 'project_change_request', when: 'before', ins: true, upd: false, order: 100, file: 'cr_snapshot_financials.js' },
  { name: 'Generate Approvals from Matrix', table: 'project_change_request', when: 'after', ins: true, upd: true, order: 100, file: 'cr_generate_approvals.js', cond: CR_APPROVAL_CONDITION },
  { name: 'CR - Apply Changes to Project', table: 'project_change_request', when: 'after', ins: false, upd: true, order: 110, file: 'cr_apply_changes_to_project.js' },
  // --- Approver rollup (closes the gap the guide never defined; covers all three tables) ---
  { name: 'Approval Rollup to Parent Record', table: 'sysapproval_approver', when: 'after', ins: true, upd: true, order: 200, file: 'approval_rollup.js' },
  // --- M0 on the demand ---
  { name: 'M0 - Snapshot Financials on Request', table: 'dmn_demand', when: 'before', ins: true, upd: true, order: 10, file: 'm0_snapshot.js' },
  { name: 'M0 - Approval Request Validation', table: 'dmn_demand', when: 'before', ins: true, upd: true, order: 90, file: 'm0_validation.js' },
  { name: 'Generate M0 Approvals from Matrix', table: 'dmn_demand', when: 'after', ins: true, upd: true, order: 100, file: 'm0_generate_approvals.js', cond: M0_APPROVAL_CONDITION },
  { name: 'M0 - Convert Demand to Project', table: 'dmn_demand', when: 'after', ins: false, upd: true, order: 110, file: 'm0_convert_to_project.js' },
  { name: 'M0 - Close on Approval', table: 'dmn_demand', when: 'before', ins: false, upd: true, order: 200, file: 'm0_close.js' },
];

// Guide section 6 — ui_type 10 = All, isolate_script true.
const CLIENT_SCRIPTS = [
  { name: 'Gate - Populate Financials on Load', table: 'u_pm_gates', type: 'onLoad', field: '', file: 'gate_onload.js' },
  { name: 'Gate - Financials on Parent Change', table: 'u_pm_gates', type: 'onChange', field: 'u_parent', file: 'gate_onchange.js' },
  { name: 'CR - Populate Financials on Load', table: 'project_change_request', type: 'onLoad', field: '', file: 'cr_onload.js' },
  { name: 'CR - Financials on Parent Change', table: 'project_change_request', type: 'onChange', field: 'parent', file: 'cr_onchange.js' },
  { name: 'M0 - Populate Financials on Load', table: 'dmn_demand', type: 'onLoad', field: '', file: 'm0_onload.js' },
  { name: 'M0 - Populate Financials on Type Change', table: 'dmn_demand', type: 'onChange', field: 'type', file: 'm0_onchange.js' },
];

// sys_script.name and sys_script_client.name are VARCHAR(40). A longer name is silently
// truncated on save, so the `name=` match below never finds it again and every deploy
// creates another copy. Fail loudly instead.
const NAME_LIMIT = 40;
for (const r of [...BUSINESS_RULES, ...CLIENT_SCRIPTS]) {
  if (r.name.length > NAME_LIMIT) {
    console.error(`FAILED: name is ${r.name.length} chars, limit ${NAME_LIMIT}: "${r.name}"`);
    process.exit(1);
  }
}

(async () => {
  console.log('=== Business Rules (sys_script) ===');
  for (const r of BUSINESS_RULES) {
    await upsert(
      'sys_script',
      `collection=${r.table}^name=${r.name}`,
      {
        name: r.name,
        collection: r.table,
        when: r.when,
        action_insert: String(!!r.ins),
        action_update: String(!!r.upd),
        action_delete: 'false',
        action_query: 'false',
        condition: r.cond || '',
        order: String(r.order),
        active: 'true',
        script: br(r.file),
      },
      `${r.table} / ${r.name} (${r.when}, order ${r.order})`
    );
  }

  console.log('\n=== Client Scripts (sys_script_client) ===');
  for (const c of CLIENT_SCRIPTS) {
    await upsert(
      'sys_script_client',
      `table=${c.table}^name=${c.name}^type=${c.type}`,
      {
        name: c.name,
        table: c.table,
        type: c.type,
        field: c.field,
        ui_type: '10',
        isolate_script: 'true',
        active: 'true',
        script: cs(c.file),
      },
      `${c.table} / ${c.name} (${c.type}${c.field ? ' on ' + c.field : ''})`
    );
  }

  console.log('\nDone.');
})().catch((err) => {
  console.error('FAILED: ' + err.message);
  process.exit(1);
});
