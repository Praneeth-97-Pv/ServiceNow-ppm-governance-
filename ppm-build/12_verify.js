// Guide section 10 — verification, run server-side.

var PASS = 0, FAIL = 0;
function check(label, condition, detail) {
    if (condition) { PASS++; gs.print('  PASS  ' + label + (detail ? '  [' + detail + ']' : '')); }
    else { FAIL++; gs.print('  FAIL  ' + label + (detail ? '  [' + detail + ']' : '')); }
}
function num(raw) {
    var s = (raw || '') + '';
    if (s.indexOf(';') > -1) { s = s.split(';')[1]; }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

var p = new GlideRecord('pm_project');
p.get('number', 'PRJ0010022');
var PID = p.getUniqueValue();
gs.print('Test project: ' + p.getValue('number') + ' phase=' + p.getValue('phase') +
         ' type=' + p.getValue('u_project_type'));
gs.print('Expected snapshot: fy_budget=500000 total_budget=2000000 total_incurred=326800 fy_incurred=75000');

// ============ 1. Create a Gate ============
gs.print('');
gs.print('===== 1. Gate creation snapshots =====');
var g = new GlideRecord('u_pm_gates');
g.initialize();
g.u_parent = PID;
g.u_title = 'Verification Gate';
g.u_number = 'GATE-VERIFY-1';
var gateId = g.insert();
gs.print('  gate sys_id=' + gateId);

var gr = new GlideRecord('u_pm_gates');
gr.get(gateId);
check('Phase inherited from project', gr.getValue('u_phase') === 'initiating', 'u_phase=' + gr.getValue('u_phase'));
check('Gate Type derived from phase', gr.getValue('u_gate_type') === 'p0', 'u_gate_type=' + gr.getValue('u_gate_type'));
check('State defaults to open', gr.getValue('u_state') === 'open', 'u_state=' + gr.getValue('u_state'));
check('FY Approved Budget snapshot', num(gr.getValue('u_fy_approved_budget')) === 500000, gr.getValue('u_fy_approved_budget'));
check('Total Approved Budget snapshot', num(gr.getValue('u_total_approved_budget')) === 2000000, gr.getValue('u_total_approved_budget'));
check('Total Incurred Cost snapshot', num(gr.getValue('u_total_incurred_cost')) === 326800, gr.getValue('u_total_incurred_cost'));
check('FY Incurred Cost snapshot', num(gr.getValue('u_incurred_cost')) === 75000, gr.getValue('u_incurred_cost'));
gs.print('  (remaining-cost fields are 0 because estimate_to_completion is a virtual field computing 0 on this data)');

// ============ 2. Approval requested, single save ============
gs.print('');
gs.print('===== 2. Approval requested survives one save =====');
gr.u_approval = 'requested';
gr.update();
var after = new GlideRecord('u_pm_gates');
after.get(gateId);
check('Approval stays Requested after one save', after.getValue('u_approval') === 'requested',
      'u_approval=' + after.getValue('u_approval'));

// ============ 3. Approvers from matrix ============
gs.print('');
gs.print('===== 3. Approvers match the matrix =====');
var expected = {};
var mx = new GlideRecord('u_approver_matrix');
mx.addQuery('u_project_type', 'strategic');
mx.addQuery('u_portfolio', p.getValue('primary_portfolio'));
mx.addQuery('u_phase', 'initiating');
mx.addQuery('u_active', true);
mx.query();
while (mx.next()) { expected[mx.getValue('u_approver')] = mx.u_approver.getDisplayValue(); }

var got = {};
var ap = new GlideRecord('sysapproval_approver');
ap.addQuery('document_id', gateId);
ap.addQuery('source_table', 'u_pm_gates');
ap.query();
while (ap.next()) { got[ap.getValue('approver')] = ap.approver.getDisplayValue() + '/' + ap.getValue('state'); }

var expNames = [], gotNames = [];
for (var e in expected) { expNames.push(expected[e]); }
for (var k in got) { gotNames.push(got[k]); }
gs.print('  expected: ' + expNames.join(', '));
gs.print('  actual  : ' + gotNames.join(', '));
var allPresent = true;
for (var x in expected) { if (!got[x]) { allPresent = false; } }
check('All matrix approvers created', allPresent && expNames.length > 0, expNames.length + ' expected');
check('No extra approvers', gotNames.length === expNames.length, gotNames.length + ' actual');

// ============ 3b. Additional approver regenerates ============
gs.print('');
gs.print('===== 3b. Additional Approvers regenerates the list =====');
var bud = new GlideRecord('sys_user');
bud.get('user_name', 'bud.richman');
var g2 = new GlideRecord('u_pm_gates');
g2.get(gateId);
g2.u_additional_approvers = bud.getUniqueValue();
g2.update();
var cnt = new GlideAggregate('sysapproval_approver');
cnt.addQuery('document_id', gateId);
cnt.addQuery('state', '!=', 'not_required');
cnt.addAggregate('COUNT'); cnt.query(); cnt.next();
check('Additional approver added', parseInt(cnt.getAggregate('COUNT')) === expNames.length + 1,
      'active approvers=' + cnt.getAggregate('COUNT'));

// ============ 4. Approve all -> state closed ============
gs.print('');
gs.print('===== 4. Approve all =====');
var toApprove = new GlideRecord('sysapproval_approver');
toApprove.addQuery('document_id', gateId);
toApprove.addQuery('state', 'requested');
toApprove.query();
var approved = 0;
while (toApprove.next()) { toApprove.state = 'approved'; toApprove.update(); approved++; }
gs.print('  approved ' + approved + ' approver record(s)');

var g3 = new GlideRecord('u_pm_gates');
g3.get(gateId);
gs.print('  gate u_approval after approver rollup = ' + g3.getValue('u_approval'));
var rolledUp = g3.getValue('u_approval') === 'approved';
check('Approver decisions roll up to u_approval automatically', rolledUp,
      rolledUp ? 'auto' : 'NO ROLLUP - guide defines no rule for this');

// Test the Close Gate rule directly by driving u_approval
var g4 = new GlideRecord('u_pm_gates');
g4.get(gateId);
g4.u_approval = 'approved';
g4.update();
var g5 = new GlideRecord('u_pm_gates');
g5.get(gateId);
check('Close Gate on Approval sets State=closed', g5.getValue('u_state') === 'closed',
      'u_state=' + g5.getValue('u_state'));

// ============ 5. Change Request snapshots ============
gs.print('');
gs.print('===== 5. Change Request creation snapshots =====');
var c = new GlideRecord('project_change_request');
c.initialize();
c.parent = PID;
c.short_description = 'Verification CR';
var crId = c.insert();
gs.print('  CR sys_id=' + crId);

var cr = new GlideRecord('project_change_request');
cr.get(crId);
check('CR Last Approved FY Budget', num(cr.getValue('u_last_approved_budget')) === 500000, cr.getValue('u_last_approved_budget'));
check('CR Total Approved Budget', num(cr.getValue('u_total_approved_budget')) === 2000000, cr.getValue('u_total_approved_budget'));
check('CR FY Incurred Cost to Date', num(cr.getValue('u_incurred_cost_to_date')) === 75000, cr.getValue('u_incurred_cost_to_date'));
check('CR Total Incurred Cost to Date', num(cr.getValue('u_total_incurred_cost_to_date')) === 326800, cr.getValue('u_total_incurred_cost_to_date'));

// CR approvers (matrix rows with empty phase)
cr.approval = 'requested';
cr.update();
var crApprovers = [];
var ca = new GlideRecord('sysapproval_approver');
ca.addQuery('document_id', crId);
ca.addQuery('source_table', 'project_change_request');
ca.query();
while (ca.next()) { crApprovers.push(ca.approver.getDisplayValue()); }
gs.print('  CR approvers: ' + crApprovers.join(', '));
check('CR approvers come from empty-phase matrix rows', crApprovers.length === 2, crApprovers.length + ' found');

var crCheck = new GlideRecord('project_change_request');
crCheck.get(crId);
check('CR approval stays Requested after one save', crCheck.getValue('approval') === 'requested',
      'approval=' + crCheck.getValue('approval'));

// ============ 6. Budget writeback on approval ============
gs.print('');
gs.print('===== 6. Approved CR writes FY Requested Budget to project =====');
var before = new GlideRecord('pm_project');
before.get(PID);
gs.print('  project FY budget before = ' + before.getValue('u_fy_approved_budget'));

var cr2 = new GlideRecord('project_change_request');
cr2.get(crId);
cr2.u_requested_budget = '777000';
cr2.update();
cr2.approval = 'approved';
cr2.update();

var afterP = new GlideRecord('pm_project');
afterP.get(PID);
gs.print('  project FY budget after  = ' + afterP.getValue('u_fy_approved_budget'));
check('Project FY Approved Budget updated to 777000', num(afterP.getValue('u_fy_approved_budget')) === 777000,
      afterP.getValue('u_fy_approved_budget'));

// ============ 7. P3 date sync ============
gs.print('');
gs.print('===== 7. P3 date drives project Approved End Date =====');
var cr3 = new GlideRecord('project_change_request');
cr3.get(crId);
cr3.u_p3_date = '2027-03-15';
cr3.update();
var afterD = new GlideRecord('pm_project');
afterD.get(PID);
gs.print('  project approved_end_date = ' + afterD.getValue('approved_end_date'));
check('Approved End Date follows P3 without approval',
      (afterD.getValue('approved_end_date') + '').indexOf('2027-03-15') === 0,
      afterD.getValue('approved_end_date'));

// ============ 8. Negative path ============
gs.print('');
gs.print('===== 8. Validation blocks approval when prerequisites missing =====');
var p2 = new GlideRecord('pm_project');
p2.addEncodedQuery('u_project_typeISEMPTY^primary_portfolioISNOTEMPTY');
p2.setLimit(1); p2.query();
if (p2.next()) {
    var bad = new GlideRecord('u_pm_gates');
    bad.initialize();
    bad.u_parent = p2.getUniqueValue();
    bad.u_title = 'Verification Gate - should fail validation';
    bad.u_approval = 'requested';
    var badId = bad.insert();
    var badCheck = new GlideRecord('u_pm_gates');
    badCheck.get(badId);
    check('Gate on project without Project Type resets to not_requested',
          badCheck.getValue('u_approval') === 'not_requested',
          'u_approval=' + badCheck.getValue('u_approval'));
    gs.print('  (cleanup) deleting ' + badId);
    badCheck.deleteRecord();
} else {
    gs.print('  SKIP - no project without u_project_type available');
}

gs.print('');
gs.print('================================');
gs.print('  PASS: ' + PASS + '   FAIL: ' + FAIL);
gs.print('================================');
gs.print('Records left for inspection: gate=' + gateId + ' cr=' + crId);
