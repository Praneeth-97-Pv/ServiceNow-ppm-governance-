// Guide section 2 — fields on pm_project and project_change_request.
// Includes the prerequisite fields section 1 assumes already exist.

function addField(table, element, label, type, opts) {
  opts = opts || {};
  var d = new GlideRecord('sys_dictionary');
  d.addQuery('name', table); d.addQuery('element', element); d.query();
  if (d.next()) { gs.print('  skip (exists): ' + table + '.' + element); return; }
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

// ---------- 2.1 pm_project ----------
gs.print('=== pm_project ===');
addField('pm_project', 'u_project_type', 'Project Type', 'string', { len: 40, choice: 3 });
addChoices('pm_project', 'u_project_type', [
  ['strategic', 'Strategic'], ['operational', 'Operational'],
  ['compliance', 'Compliance'], ['innovation', 'Innovation']
]);
addField('pm_project', 'u_fy_approved_budget', 'FY Approved Budget', 'currency');
addField('pm_project', 'u_total_approved_budget', 'Total Approved Budget', 'currency');

// ---------- 2.2 project_change_request ----------
gs.print('\n=== project_change_request ===');
// Prerequisite fields (section 1 assumes these exist; labels applied in section 3.1)
addField('project_change_request', 'u_last_approved_budget', 'Last Approved Budget', 'currency');
addField('project_change_request', 'u_incurred_cost_to_date', 'Incurred Cost to Date', 'currency');
addField('project_change_request', 'u_requested_budget', 'Requested Budget', 'currency');

['u_p0_date|P0 Date', 'u_p1_date|P1 Date', 'u_p2a_date|P2a Date',
 'u_p2b_date|P2b Date', 'u_p3_date|P3 Date'].forEach(function (s) {
  var a = s.split('|');
  addField('project_change_request', a[0], a[1], 'glide_date');
});

['u_cumulative_revenue|Cumulative Revenue', 'u_cumulative_rd_investment|Cumulative R&D Investment',
 'u_cumulative_adj_ebitda|Cumulative Adj EBITDA', 'u_npv|NPV', 'u_dpp|DPP'].forEach(function (s) {
  var a = s.split('|');
  addField('project_change_request', a[0], a[1], 'currency');
});

addField('project_change_request', 'u_additional_approvers', 'Additional Approvers', 'glide_list',
         { ref: 'sys_user', len: 1024 });
addField('project_change_request', 'u_approval_not_required', 'Approval Not Required', 'glide_list',
         { ref: 'sys_user', len: 1024 });

// Section 2.4 proper — the three new currency fields
addField('project_change_request', 'u_total_approved_budget', 'Total Approved Budget', 'currency');
addField('project_change_request', 'u_total_incurred_cost_to_date', 'Total Incurred Cost to Date', 'currency');
addField('project_change_request', 'u_total_requested_budget', 'Total Requested Budget', 'currency');

gs.print('\nDONE');
