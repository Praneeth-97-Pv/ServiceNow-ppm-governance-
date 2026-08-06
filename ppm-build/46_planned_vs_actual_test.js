// Planned cost vs actual cost, for a user on the zero-labor-cost policy.
//
// Goal: resource plan carries a real PLANNED cost from the rate model, and after the user
// submits time the ACTUAL cost comes back 0 -- while actual hours are still recorded.
//
// Control arm (default policy) runs the identical flow so the contrast is measurable.
// Re-runnable: wipes its own prior data first.

var TAG = 'PVA-TEST';
var RM = 'daf6052adb5823009ef63a2b7c961942';
var USER = '46826bf03710200044e0bfc8bcbe5d62';   // Laurie Bigg, priced at 110/hr by the rate model

function log(s) { gs.print(s); }
function hr() { gs.print('------------------------------------------------------------'); }

// ---------------------------------------------------------------- cleanup prior run
var oldProj = [];
var op = new GlideRecord('pm_project');
op.addQuery('short_description', 'STARTSWITH', TAG);
op.query();
while (op.next()) oldProj.push(op.getUniqueValue());

if (oldProj.length) {
    ['fm_expense_line:task', 'time_card:task', 'resource_allocation_daily:task'].forEach(function (spec) {
        var parts = spec.split(':');
        var gr = new GlideRecord(parts[0]);
        gr.addQuery(parts[1], 'IN', oldProj.join(','));
        gr.query();
        var n = 0; while (gr.next()) { gr.deleteRecord(); n++; }
        if (n) log('cleaned ' + n + ' ' + parts[0]);
    });
    var orp = new GlideRecord('resource_plan');
    orp.addQuery('task', 'IN', oldProj.join(','));
    orp.query();
    while (orp.next()) { new ResourcePlan(orp).deleteResourceAllocations(); orp.deleteRecord(); }
    var op2 = new GlideRecord('pm_project');
    op2.addQuery('sys_id', 'IN', oldProj.join(','));
    op2.query();
    while (op2.next()) op2.deleteRecord();
    log('cleaned ' + oldProj.length + ' old project(s)');
}

var policyZero = new GlideRecord('time_sheet_policy');
policyZero.get('name', 'Zero Labor Cost Policy');
var policyDefault = new GlideRecord('time_sheet_policy');
policyDefault.get('is_default', '1');

var user = new GlideRecord('sys_user');
user.get(USER);
var originalPolicy = user.getValue('time_sheet_policy');

// ---------------------------------------------------------------- one arm
function runArm(label, policyId) {
    hr();
    log(label);
    hr();

    user.setValue('time_sheet_policy', policyId);
    user.setWorkflow(false);
    user.update();

    // --- project
    var project = new GlideRecord('pm_project');
    project.initialize();
    project.setValue('short_description', TAG + ' ' + label);
    project.setValue('rate_model', RM);
    project.setValue('start_date', '2026-06-07 08:00:00');
    project.setValue('end_date', '2026-06-27 17:00:00');
    var projectId = project.insert();

    // --- resource plan, 40 planned hours across the first week
    var plan = new GlideRecord('resource_plan');
    plan.initialize();
    plan.setValue('short_description', TAG + ' plan');
    plan.setValue('task', projectId);
    plan.setValue('top_task', projectId);
    plan.setValue('resource_type', 'user');
    plan.setValue('user_resource', USER);
    plan.setValue('start_date', '2026-06-07');
    plan.setValue('end_date', '2026-06-13');
    plan.setValue('plan_type', 'task');
    plan.setValue('planned_hours', 40);
    plan.setValue('state', 1);              // Planning
    var planId = plan.insert();

    var planGr = new GlideRecord('resource_plan');
    planGr.get(planId);

    // --- build requested allocations, then hard-allocate. This is what populates planned cost.
    var rp = new ResourcePlan(planGr);
    rp.createRequestedAllocations();
    rp.allocate(true);

    planGr.get(planId);
    var plannedCost = parseFloat(planGr.getValue('planned_cost') || 0);
    var allocatedCost = parseFloat(planGr.getValue('allocated_cost') || 0);
    log('  PLANNED  hours = ' + planGr.getValue('planned_hours') +
        '   planned_cost = ' + plannedCost +
        '   allocated_cost = ' + allocatedCost);

    // --- time card for that week
    var tc = new GlideRecord('time_card');
    tc.initialize();
    tc.setValue('user', USER);
    tc.setValue('task', projectId);
    tc.setValue('resource_plan', planId);
    tc.setValue('week_starts_on', '2026-06-07');
    tc.setValue('category', 'project_work');
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(function (d) { tc.setValue(d, 8); });
    tc.setValue('total', 40);
    tc.setValue('state', 'Submitted');
    tc.setWorkflow(false);
    var tcId = tc.insert();

    var tcGr = new GlideRecord('time_card');
    tcGr.get(tcId);

    var actualRate = parseFloat(new TaskRateAPI(tcGr).getRateForTimecard().getRateForDay('2026-06-07').rate || 0);
    new TimeCardProcessHandler().process(tcGr);

    // --- read the actuals back
    var expTotal = 0, expCount = 0, expStates = [];
    var exp = new GlideRecord('fm_expense_line');
    exp.addQuery('time_card', tcId);
    exp.query();
    while (exp.next()) {
        expCount++;
        expTotal += parseFloat(exp.amount.getCurrencyValue() || 0);
        expStates.push(exp.getValue('state'));
    }

    planGr.get(planId);
    var projGr = new GlideRecord('pm_project');
    projGr.get(projectId);

    log('  ACTUAL   rate/hr = ' + actualRate +
        '   hours = ' + planGr.getValue('actual_hours') +
        '   actual_cost = ' + planGr.getValue('actual_cost'));
    log('  EXPENSE  ' + expCount + ' line(s), total = ' + expTotal + ', state(s) = ' + expStates.join(','));
    log('  PROJECT  work_cost before processing = ' + projGr.getValue('work_cost'));

    // Expense lines are created 'pending'. Project actual cost sums only 'processed' lines
    // (see getTotalExpenseLineActualCost), so nothing rolls up until the OOB allocation job
    // flips them. Do that here, otherwise the project-level number proves nothing.
    var proc = new GlideRecord('fm_expense_line');
    proc.addQuery('time_card', tcId);
    proc.query();
    while (proc.next()) {
        proc.setValue('state', 'processed');
        proc.update();
    }

    projGr.get(projectId);
    log('  PROJECT  work_cost AFTER processing  = ' + projGr.getValue('work_cost'));

    return {
        planned: plannedCost,
        allocated: allocatedCost,
        actualRate: actualRate,
        actualCost: parseFloat(planGr.getValue('actual_cost') || 0),
        actualHours: parseFloat(planGr.getValue('actual_hours') || 0),
        expense: expTotal,
        projectActual: parseFloat(projGr.getValue('work_cost') || 0)
    };
}

var control = runArm('CONTROL -- default policy', policyDefault.getUniqueValue());
var zero = runArm('ZERO -- zero labor cost policy', policyZero.getUniqueValue());

// ---------------------------------------------------------------- restore
user.setValue('time_sheet_policy', originalPolicy);
user.setWorkflow(false);
user.update();

// ---------------------------------------------------------------- verdict
hr();
log('=== SIDE BY SIDE ===');
log('                          control        zero-policy');
function row(name, a, b) {
    log('  ' + (name + '                    ').substring(0, 22) +
        ('' + a + '              ').substring(0, 15) + b);
}
row('planned_cost', control.planned, zero.planned);
row('allocated_cost', control.allocated, zero.allocated);
row('actual rate/hr', control.actualRate, zero.actualRate);
row('actual_hours', control.actualHours, zero.actualHours);
row('actual_cost', control.actualCost, zero.actualCost);
row('expense line total', control.expense, zero.expense);
row('project actual cost', control.projectActual, zero.projectActual);

hr();
var ok = true;
function check(name, pass, detail) {
    log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
    if (!pass) ok = false;
}
log('=== VERDICT ===');
check('control: planned cost is non-zero', control.planned > 0, 'planned=' + control.planned);
check('control: actual cost is non-zero', control.actualCost > 0, 'actual=' + control.actualCost);
check('ZERO: planned cost is still non-zero', zero.planned > 0, 'planned=' + zero.planned);
check('ZERO: planned matches control', zero.planned === control.planned,
    control.planned + ' vs ' + zero.planned);
check('ZERO: actual cost is 0', zero.actualCost === 0, 'actual=' + zero.actualCost);
check('ZERO: expense line total is 0', zero.expense === 0, 'expense=' + zero.expense);
check('ZERO: project actual cost is 0', zero.projectActual === 0, 'project=' + zero.projectActual);
check('ZERO: hours still recorded', zero.actualHours === 40, 'hours=' + zero.actualHours);
log('');
log(ok ? 'ALL CHECKS PASSED' : 'THERE ARE FAILURES');
