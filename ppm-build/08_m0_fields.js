// M0 process — fields on dmn_demand, mirroring the gate field set.
// M0 lives on the demand itself; approval uses the demand's own `approval` field.

// ---- snapshot the existing form layout BEFORE adding fields ----
// The platform rule "Add New Column To Form Section" auto-appends every new field to the
// default section, so record what was there first to clean up precisely later.
gs.print('=== dmn_demand form sections BEFORE ===');
var s = new GlideRecord('sys_ui_section');
s.addQuery('name', 'dmn_demand');
s.query();
while (s.next()) {
  var e = new GlideAggregate('sys_ui_element');
  e.addQuery('sys_ui_section', s.getUniqueValue());
  e.addAggregate('COUNT'); e.query(); e.next();
  gs.print('  [' + (s.getValue('caption') || '(none)') + '] view=' + s.view.getDisplayValue() +
           ' id=' + s.getUniqueValue() + ' elements=' + e.getAggregate('COUNT'));
}

function addField(table, element, label, type, opts) {
  opts = opts || {};
  var d = new GlideRecord('sys_dictionary');
  d.addQuery('name', table); d.addQuery('element', element); d.query();
  if (d.next()) { gs.print('  skip (exists): ' + element); return; }
  var f = new GlideRecord('sys_dictionary');
  f.initialize();
  f.name = table; f.element = element; f.column_label = label; f.internal_type = type;
  f.max_length = opts.len || (type === 'currency' ? 40 : 40);
  if (opts.ref) { f.reference = opts.ref; }
  if (opts.def !== undefined) { f.default_value = opts.def; }
  if (opts.choice) { f.choice = opts.choice; }
  f.active = true;
  f.insert();
  gs.print('  + ' + table + '.' + element + ' (' + type + ')');
}

function addChoices(table, element, pairs) {
  var added = 0;
  for (var i = 0; i < pairs.length; i++) {
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', table); c.addQuery('element', element); c.addQuery('value', pairs[i][0]);
    c.query();
    if (c.next()) { continue; }
    var n = new GlideRecord('sys_choice');
    n.initialize();
    n.name = table; n.element = element; n.value = pairs[i][0]; n.label = pairs[i][1];
    n.sequence = i; n.inactive = false; n.language = 'en';
    n.insert(); added++;
  }
  gs.print('  choices ' + table + '.' + element + ': +' + added);
}

gs.print('');
gs.print('=== M0 fields on dmn_demand ===');

// Matrix key — same choice values as pm_project.u_project_type
addField('dmn_demand', 'u_project_type', 'Project Type', 'string', { len: 40, choice: 3 });
addChoices('dmn_demand', 'u_project_type', [
  ['strategic', 'Strategic'], ['operational', 'Operational'],
  ['compliance', 'Compliance'], ['innovation', 'Innovation']
]);

// M0 lifecycle state (mirrors gate u_state; the demand's own `approval` carries approval)
addField('dmn_demand', 'u_m0_state', 'M0 State', 'string', { len: 40, choice: 3, def: 'open' });
addChoices('dmn_demand', 'u_m0_state', [['open', 'Open'], ['closed', 'Closed']]);

// Approver overrides
addField('dmn_demand', 'u_additional_approvers', 'Additional Approvers', 'glide_list',
         { ref: 'sys_user', len: 1024 });
addField('dmn_demand', 'u_approval_not_required', 'Approval Not Required', 'glide_list',
         { ref: 'sys_user', len: 1024 });

// Milestone dates
['u_p0_date|P0 Date', 'u_p1_date|P1 Date', 'u_p2a_date|P2a Date',
 'u_p2b_date|P2b Date', 'u_p3_date|P3 Date'].forEach(function (x) {
  var a = x.split('|');
  addField('dmn_demand', a[0], a[1], 'glide_date');
});

// PM-entered budgets (same role as on pm_project)
addField('dmn_demand', 'u_fy_approved_budget', 'FY Approved Budget', 'currency');
addField('dmn_demand', 'u_total_approved_budget', 'Total Approved Budget', 'currency');

// Snapshot fields, frozen when approval is requested
['u_incurred_cost|FY Incurred Cost', 'u_remaining_cost|FY Remaining Cost',
 'u_total_incurred_cost|Total Incurred Cost', 'u_total_remaining_cost|Total Remaining Cost',
 'u_cumulative_revenue|Cumulative Revenue', 'u_cumulative_rd_investment|Cumulative R&D Investment',
 'u_cumulative_adj_ebitda|Cumulative Adj EBITDA', 'u_npv|NPV', 'u_dpp|DPP'].forEach(function (x) {
  var a = x.split('|');
  addField('dmn_demand', a[0], a[1], 'currency');
});

// ---- m0 phase on the approver matrix ----
gs.print('');
gs.print('=== approver matrix: add m0 phase ===');
addChoices('u_approver_matrix', 'u_phase', [['m0', 'M0 (Demand)']]);

gs.print('');
gs.print('=== verify ===');
var g = new GlideRecord('dmn_demand');
var want = ['u_project_type', 'u_m0_state', 'u_additional_approvers', 'u_approval_not_required',
            'u_p0_date', 'u_p1_date', 'u_p2a_date', 'u_p2b_date', 'u_p3_date',
            'u_fy_approved_budget', 'u_total_approved_budget', 'u_incurred_cost', 'u_remaining_cost',
            'u_total_incurred_cost', 'u_total_remaining_cost', 'u_cumulative_revenue',
            'u_cumulative_rd_investment', 'u_cumulative_adj_ebitda', 'u_npv', 'u_dpp'];
var missing = [];
want.forEach(function (f) { if (!g.isValidField(f)) { missing.push(f); } });
gs.print('  dmn_demand: ' + (want.length - missing.length) + '/' + want.length + ' present');
if (missing.length) { gs.print('  MISSING: ' + missing.join(', ')); }

var ph = new GlideRecord('sys_choice');
ph.addQuery('name', 'u_approver_matrix'); ph.addQuery('element', 'u_phase');
ph.orderBy('sequence'); ph.query();
var vals = [];
while (ph.next()) { vals.push(ph.getValue('value')); }
gs.print('  matrix phases: ' + vals.join(', '));
