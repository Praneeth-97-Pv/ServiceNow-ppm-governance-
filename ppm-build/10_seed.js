// Test data for the guide's section 10 verification.

var PROJECT_NUMBER = 'PRJ0010022';

var p = new GlideRecord('pm_project');
if (!p.get('number', PROJECT_NUMBER)) { gs.print('FATAL: project not found'); }

gs.print('=== test project ===');
gs.print('  ' + p.getValue('number') + ' | ' + p.getUniqueValue());

p.u_project_type = 'strategic';
p.u_fy_approved_budget = '500000';
p.u_total_approved_budget = '2000000';
p.setWorkflow(false);   // don't fire PPM rules while seeding
p.update();
gs.print('  set u_project_type=strategic, FY budget=500000, total budget=2000000');
gs.print('  phase=' + p.getValue('phase') + ' portfolio=' + p.primary_portfolio.getDisplayValue() +
         ' (' + p.getValue('primary_portfolio') + ')');

// ---------- a current-fiscal-year breakdown so the FY branch has data ----------
gs.print('');
gs.print('=== current fiscal year period ===');
var now = new GlideDateTime();
var fp = new GlideRecord('fiscal_period');
fp.addQuery('fiscal_start_date_time', '<=', now);
fp.addQuery('fiscal_end_date_time', '>=', now);
fp.orderBy('fiscal_start_date_time');
fp.query();
var periodId = '', fyId = '';
while (fp.next()) {
  if (fp.getValue('fiscal_year')) { periodId = fp.getUniqueValue(); fyId = fp.getValue('fiscal_year'); break; }
}
gs.print('  period=' + periodId + ' fiscal_year=' + fyId);

if (periodId) {
  var existing = new GlideRecord('cost_plan_breakdown');
  existing.addQuery('task', p.getUniqueValue());
  existing.addQuery('fiscal_period', periodId);
  existing.addQuery('breakdown_type', 'task');
  existing.query();
  if (existing.next()) {
    existing.actual = 75000;
    existing.estimate_to_completion = 125000;
    existing.setWorkflow(false);
    existing.update();
    gs.print('  updated existing current-FY breakdown: actual=75000 etc=125000');
  } else {
    var b = new GlideRecord('cost_plan_breakdown');
    b.initialize();
    b.task = p.getUniqueValue();
    b.breakdown_type = 'task';
    b.fiscal_period = periodId;
    b.actual = 75000;
    b.estimate_to_completion = 125000;
    b.setWorkflow(false);
    gs.print('  created current-FY breakdown: ' + b.insert() + ' (actual=75000 etc=125000)');
  }
}

// ---------- approver matrix ----------
gs.print('');
gs.print('=== approver matrix ===');
var PORTFOLIO = p.getValue('primary_portfolio');

function addMatrixRow(projectType, portfolio, phase, approverUserName) {
  var u = new GlideRecord('sys_user');
  if (!u.get('user_name', approverUserName)) { gs.print('  user not found: ' + approverUserName); return; }

  var m = new GlideRecord('u_approver_matrix');
  m.addQuery('u_project_type', projectType);
  m.addQuery('u_portfolio', portfolio);
  if (phase) { m.addQuery('u_phase', phase); } else { m.addNullQuery('u_phase'); }
  m.addQuery('u_approver', u.getUniqueValue());
  m.query();
  if (m.next()) { gs.print('  exists: ' + approverUserName + ' phase=' + (phase || '(empty)')); return; }

  var n = new GlideRecord('u_approver_matrix');
  n.initialize();
  n.u_project_type = projectType;
  n.u_portfolio = portfolio;
  if (phase) { n.u_phase = phase; }
  n.u_approver = u.getUniqueValue();
  n.u_active = true;
  n.insert();
  gs.print('  + ' + approverUserName + ' | phase=' + (phase || '(empty - CR rows)'));
}

// Change Request rows carry no phase
addMatrixRow('strategic', PORTFOLIO, '', 'abel.tuter');
addMatrixRow('strategic', PORTFOLIO, '', 'beth.anglin');
// Gate rows match the gate's phase
addMatrixRow('strategic', PORTFOLIO, 'initiating', 'david.loo');
addMatrixRow('strategic', PORTFOLIO, 'initiating', 'fred.luddy');
addMatrixRow('strategic', PORTFOLIO, 'planning', 'bud.richman');

gs.print('');
gs.print('=== payload after seeding ===');
gs.print(JSON.stringify(new GateFinancialsAjax().buildPayload(p.getUniqueValue()), null, 2));
