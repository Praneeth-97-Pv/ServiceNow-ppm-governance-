// End-to-end test of the per-policy zero labor cost change.
//
//   Week A -- user on the DEFAULT policy      -> expect labor cost > 0   (control)
//   Week B -- user on the ZERO LABOR policy   -> expect labor cost == 0  (treatment)
//   Planning under the ZERO policy            -> expect rate  > 0        (must be untouched)
//
// Creates test records tagged ZLC-TEST. Re-runnable: wipes its own prior data first.

var TAG = 'ZLC-TEST';
var RM = 'daf6052adb5823009ef63a2b7c961942';
var FIELD = 'u_zero_labor_cost';

function log(s) { gs.print(s); }
function hr() { gs.print('--------------------------------------------------'); }

// ---------------------------------------------------------------- cleanup prior run
['fm_expense_line', 'time_card', 'resource_allocation_daily', 'resource_allocation',
    'resource_plan', 'pm_project'].forEach(function (t) {
    var gr = new GlideRecord(t);
    if (!gr.isValid()) return;
    if (t === 'fm_expense_line' || t === 'time_card' || t === 'resource_allocation_daily' ||
        t === 'resource_allocation') {
        // these have no short_description we control; clean via the tagged project below
        return;
    }
    gr.addQuery('short_description', 'STARTSWITH', TAG);
    gr.query();
    var n = 0;
    while (gr.next()) { gr.deleteRecord(); n++; }
    if (n) log('cleaned ' + n + ' old ' + t);
});

// ---------------------------------------------------------------- fixtures
var policyZero = new GlideRecord('time_sheet_policy');
policyZero.get('name', 'Zero Labor Cost Policy');
var policyDefault = new GlideRecord('time_sheet_policy');
policyDefault.get('is_default', '1');
log('zero policy   : ' + policyZero.getUniqueValue() + ' (' + FIELD + '=' + policyZero.getValue(FIELD) + ')');
log('default policy: ' + policyDefault.getUniqueValue() + ' (' + FIELD + '=' + policyDefault.getValue(FIELD) + ')');

// a user that the rate model actually prices
var user = new GlideRecord('sys_user');
user.get('46826bf03710200044e0bfc8bcbe5d62'); // Laurie Bigg
var originalPolicy = user.getValue('time_sheet_policy');
log('user          : ' + user.getDisplayValue() + ' (original policy ' + originalPolicy + ')');

var project = new GlideRecord('pm_project');
project.initialize();
project.setValue('short_description', TAG + ' zero labor cost project');
project.setValue('rate_model', RM);
project.setValue('start_date', '2026-06-01 08:00:00');
project.setValue('end_date', '2026-08-31 17:00:00');
var projectId = project.insert();
log('project       : ' + projectId);

var plan = new GlideRecord('resource_plan');
plan.initialize();
plan.setValue('short_description', TAG + ' plan');
plan.setValue('task', projectId);
plan.setValue('top_task', projectId);
plan.setValue('resource_type', 'user');
plan.setValue('user_resource', user.getUniqueValue());
plan.setValue('start_date', '2026-06-01');
plan.setValue('end_date', '2026-08-31');
plan.setValue('plan_type', 'task');
plan.setValue('state', 1);
var planId = plan.insert();
log('resource plan : ' + planId);
hr();

// ---------------------------------------------------------------- helper
function runWeek(label, weekStart, policyId) {
    user.setValue('time_sheet_policy', policyId);
    user.setWorkflow(false);
    user.update();

    var tc = new GlideRecord('time_card');
    tc.initialize();
    tc.setValue('user', user.getUniqueValue());
    tc.setValue('task', projectId);
    tc.setValue('resource_plan', planId);
    tc.setValue('week_starts_on', weekStart);
    tc.setValue('category', 'project_work');
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(function (d) {
        tc.setValue(d, 8);
    });
    // workflow is suppressed below so the OOB "Process time card" BR does not race us,
    // which also means "Calculate total" never runs -- set the total by hand.
    tc.setValue('total', 40);
    tc.setValue('state', 'Submitted');
    tc.setWorkflow(false);          // don't let the OOB BR process it -- we call the handler directly
    var tcId = tc.insert();

    var tcGr = new GlideRecord('time_card');
    tcGr.get(tcId);

    // what rate does the ACTUALS path resolve?
    var rates = new TaskRateAPI(tcGr).getRateForTimecard();
    var rateForMonday = rates.getRateForDay(weekStart);

    new TimeCardProcessHandler().process(tcGr);

    // expense lines produced
    var expTotal = 0, expCount = 0;
    var exp = new GlideRecord('fm_expense_line');
    exp.addQuery('time_card', tcId);
    exp.query();
    while (exp.next()) { expCount++; expTotal += parseFloat(exp.amount.getCurrencyValue() || 0); }

    // allocation dailies produced
    var dailyCost = 0, dailyHours = 0;
    var ad = new GlideRecord('resource_allocation_daily');
    ad.addQuery('time_card_list', 'CONTAINS', tcId);
    ad.query();
    while (ad.next()) {
        dailyCost += parseFloat(ad.getValue('actual_cost') || 0);
        dailyHours += parseFloat(ad.getValue('actual_hours') || 0);
    }

    var planGr = new GlideRecord('resource_plan');
    planGr.get(planId);

    log(label);
    log('  actuals rate/hr      : ' + rateForMonday.rate);
    log('  total hours booked   : 40');
    log('  expense lines        : ' + expCount + '  totalling ' + expTotal);
    log('  allocation daily cost: ' + dailyCost);
    log('  allocation daily hrs : ' + dailyHours);
    log('  resource_plan.actual_cost  = ' + planGr.getValue('actual_cost'));
    log('  resource_plan.actual_hours = ' + planGr.getValue('actual_hours'));
    hr();

    return { rate: parseFloat(rateForMonday.rate || 0), expense: expTotal, dailyCost: dailyCost, hours: dailyHours };
}

// ---------------------------------------------------------------- run
// week_starts_on must land on the policy's start day (Sunday) or the time sheet BR aborts
var control = runWeek('WEEK A -- default policy (control)', '2026-06-07', policyDefault.getUniqueValue());
var treat = runWeek('WEEK B -- zero labor cost policy', '2026-06-14', policyZero.getUniqueValue());

// ---------------------------------------------------------------- planning, still on zero policy
var planGr2 = new GlideRecord('resource_plan');
planGr2.get(planId);
var planningRates = new RMRates(planGr2).getDailyRates(user.getUniqueValue(), '2026-06-14', '2026-06-20');
var planningRate = parseFloat(planningRates.getRateForDay('2026-06-14').rate || 0);
log('PLANNING while user is on the zero policy');
log('  planned rate/hr      : ' + planningRate);
hr();

// ---------------------------------------------------------------- restore + verdict
user.setValue('time_sheet_policy', originalPolicy);
user.setWorkflow(false);
user.update();
log('restored user policy to ' + originalPolicy);
hr();

function check(name, pass, detail) {
    log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
    return pass;
}
var ok = true;
log('=== VERDICT ===');
ok &= check('control produces labor cost', control.expense > 0, 'expense=' + control.expense);
ok &= check('control rate is non-zero', control.rate > 0, 'rate=' + control.rate);
ok &= check('treatment expense line is 0', treat.expense === 0, 'expense=' + treat.expense);
ok &= check('treatment actuals rate is 0', treat.rate === 0, 'rate=' + treat.rate);
ok &= check('treatment allocation cost is 0', treat.dailyCost === 0, 'cost=' + treat.dailyCost);
ok &= check('treatment still records hours', treat.hours === 40, 'hours=' + treat.hours);
ok &= check('PLANNING rate still non-zero', planningRate > 0, 'planned rate=' + planningRate);
log('');
log(ok ? 'ALL CHECKS PASSED' : 'THERE ARE FAILURES');
