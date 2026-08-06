// M0 end-to-end: seed, then verify through to demand -> project conversion.

var PASS = 0, FAIL = 0;
function check(l, c, d) {
    if (c) { PASS++; gs.print('  PASS  ' + l + (d ? '  [' + d + ']' : '')); }
    else { FAIL++; gs.print('  FAIL  ' + l + (d ? '  [' + d + ']' : '')); }
}
function num(raw) {
    var s = (raw || '') + '';
    if (s.indexOf(';') > -1) { s = s.split(';')[1]; }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

// ================= SEED =================
gs.print('===== SEED =====');
var d = new GlideRecord('dmn_demand');
d.get('number', 'DMND0001172');
var DID = d.getUniqueValue();
var PORTFOLIO = d.getValue('portfolio');

d.u_project_type = 'strategic';
d.u_fy_approved_budget = '250000';
d.u_total_approved_budget = '900000';
d.u_m0_state = 'open';
d.approval = 'not requested';
d.setWorkflow(false);
d.update();
gs.print('  demand ' + d.getValue('number') + ' | type=' + d.getValue('type') +
         ' | portfolio=' + d.portfolio.getDisplayValue() + ' | project=' + (d.getValue('project') || 'none'));

// give the demand real cost data (actual is read_only but script-writable;
// estimate_to_completion is virtual and cannot be seeded)
var seeded = 0;
var b = new GlideRecord('cost_plan_breakdown');
b.addQuery('task', DID);
b.addQuery('breakdown_type', 'task');
b.setLimit(2);
b.query();
while (b.next()) {
    b.actual = (seeded === 0) ? 120000 : 30000;
    b.setWorkflow(false);
    b.update();
    seeded++;
}
gs.print('  seeded ' + seeded + ' breakdown row(s) with actuals (total 150000)');

// m0 matrix rows
function addMatrix(phase, userName) {
    var u = new GlideRecord('sys_user');
    if (!u.get('user_name', userName)) { gs.print('  user missing: ' + userName); return; }
    var m = new GlideRecord('u_approver_matrix');
    m.addQuery('u_project_type', 'strategic');
    m.addQuery('u_portfolio', PORTFOLIO);
    m.addQuery('u_phase', phase);
    m.addQuery('u_approver', u.getUniqueValue());
    m.query();
    if (m.next()) { gs.print('  matrix exists: ' + userName); return; }
    var n = new GlideRecord('u_approver_matrix');
    n.initialize();
    n.u_project_type = 'strategic';
    n.u_portfolio = PORTFOLIO;
    n.u_phase = phase;
    n.u_approver = u.getUniqueValue();
    n.u_active = true;
    n.insert();
    gs.print('  + m0 approver ' + userName);
}
addMatrix('m0', 'abel.tuter');
addMatrix('m0', 'bud.richman');

gs.print('');
gs.print('  payload: ' + JSON.stringify(new GateFinancialsAjax().buildDemandPayload(DID)));

// ================= 1. VALIDATION =================
gs.print('');
gs.print('===== 1. Approval request validation =====');
var neg = new GlideRecord('dmn_demand');
neg.addEncodedQuery('type!=project^portfolioISNOTEMPTY');
neg.setLimit(1); neg.query();
if (neg.next()) {
    neg.u_project_type = 'strategic';
    neg.approval = 'requested';
    neg.update();
    var negRe = new GlideRecord('dmn_demand');
    negRe.get(neg.getUniqueValue());
    check('Non-project demand blocked from M0 approval',
          (negRe.getValue('approval') + '') != 'requested',
          'type=' + negRe.getValue('type') + ' approval=' + negRe.getValue('approval'));
} else { gs.print('  SKIP - no non-project demand available'); }

// ================= 2. REQUEST APPROVAL =================
gs.print('');
gs.print('===== 2. Request M0 approval =====');
var r = new GlideRecord('dmn_demand');
r.get(DID);
r.approval = 'requested';
r.update();

var after = new GlideRecord('dmn_demand');
after.get(DID);
check('Approval stays Requested after one save', (after.getValue('approval') + '') === 'requested',
      'approval=' + after.getValue('approval'));
check('M0 state defaults to open', (after.getValue('u_m0_state') + '') === 'open', after.getValue('u_m0_state'));
check('Total Incurred Cost snapshot', num(after.getValue('u_total_incurred_cost')) === 150000,
      after.getValue('u_total_incurred_cost'));
gs.print('  fy_incurred=' + after.getValue('u_incurred_cost') + ' (0 expected: seeded rows are in old fiscal years)');

// ================= 3. APPROVERS =================
gs.print('');
gs.print('===== 3. Approvers from matrix (phase m0) =====');
var got = [];
var ap = new GlideRecord('sysapproval_approver');
ap.addQuery('document_id', DID);
ap.addQuery('source_table', 'dmn_demand');
ap.query();
while (ap.next()) { got.push(ap.approver.getDisplayValue() + '/' + ap.getValue('state')); }
gs.print('  ' + got.join(', '));
check('Two M0 approvers generated', got.length === 2, got.length + ' found');

// ================= 4. ROLLUP + CONVERSION =================
gs.print('');
gs.print('===== 4. Approve all -> rollup -> conversion =====');
var toApprove = new GlideRecord('sysapproval_approver');
toApprove.addQuery('document_id', DID);
toApprove.addQuery('state', 'requested');
toApprove.query();
var n = 0;
while (toApprove.next()) { toApprove.state = 'approved'; toApprove.update(); n++; }
gs.print('  approved ' + n + ' approver record(s)');

var fin = new GlideRecord('dmn_demand');
fin.get(DID);
check('Rollup set demand approval to approved', (fin.getValue('approval') + '') === 'approved',
      'approval=' + fin.getValue('approval'));
check('M0 state closed on approval', (fin.getValue('u_m0_state') + '') === 'closed', fin.getValue('u_m0_state'));

var projId = fin.getValue('project');
check('Demand linked to a new project', !!projId, 'project=' + (projId || 'none'));

if (projId) {
    var proj = new GlideRecord('pm_project');
    if (proj.get(projId)) {
        gs.print('  created project: ' + proj.getValue('number') + ' | ' + (proj.getValue('short_description') || '').substring(0, 40));
        check('Project portfolio mapped from demand',
              (proj.getValue('primary_portfolio') + '') === PORTFOLIO,
              proj.primary_portfolio.getDisplayValue());
        check('Project inherited u_project_type', (proj.getValue('u_project_type') + '') === 'strategic',
              proj.getValue('u_project_type'));
        check('Project inherited FY approved budget', num(proj.getValue('u_fy_approved_budget')) === 250000,
              proj.getValue('u_fy_approved_budget'));
        check('Project inherited total approved budget', num(proj.getValue('u_total_approved_budget')) === 900000,
              proj.getValue('u_total_approved_budget'));
    }
}
check('Demand state advanced past Qualified', ['8', '9'].indexOf(fin.getValue('state') + '') > -1,
      'state=' + fin.getValue('state'));

// ================= 5. GATE ROLLUP REGRESSION =================
gs.print('');
gs.print('===== 5. Rollup also fixes the Gate gap =====');
var p = new GlideRecord('pm_project');
p.get('number', 'PRJ0010022');
var g = new GlideRecord('u_pm_gates');
g.initialize();
g.u_parent = p.getUniqueValue();
g.u_title = 'Rollup regression gate';
var gid = g.insert();
var g2 = new GlideRecord('u_pm_gates');
g2.get(gid);
g2.u_approval = 'requested';
g2.update();
var ga = new GlideRecord('sysapproval_approver');
ga.addQuery('document_id', gid);
ga.addQuery('state', 'requested');
ga.query();
var gn = 0;
while (ga.next()) { ga.state = 'approved'; ga.update(); gn++; }
var g3 = new GlideRecord('u_pm_gates');
g3.get(gid);
check('Gate approval rolls up automatically now', (g3.getValue('u_approval') + '') === 'approved',
      'approved ' + gn + ' approvers -> u_approval=' + g3.getValue('u_approval'));
check('Gate closed as a result', (g3.getValue('u_state') + '') === 'closed', g3.getValue('u_state'));
gs.print('  cleanup gate ' + gid);
g3.deleteRecord();

gs.print('');
gs.print('================================');
gs.print('  PASS: ' + PASS + '   FAIL: ' + FAIL);
gs.print('================================');
gs.print('Demand ' + fin.getValue('number') + ' -> project ' + (projId || 'none'));
