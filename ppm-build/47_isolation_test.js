// ISOLATION / REGRESSION SUITE
//
// The change must affect ONLY users on a flagged time sheet policy. Every other group on the
// instance must behave exactly as before. The riskiest case is users with NO policy assigned at
// all -- the majority on this instance -- who fall back to the default policy.
//
// Scenarios:
//   1. user with NO policy assigned            -> normal cost   (majority case)
//   2. user explicitly on the default policy   -> normal cost
//   3. user on another policy, flag off        -> normal cost
//   4. user on the zero policy                 -> zero cost
//   5. MIXED project: normal + zero user on one project -> project actual = normal user only
//   6. project with NO rate model (rate card path)      -> both arms behave correctly
//   7. recall on the zero policy                        -> no stray negative expense
//
// Re-runnable. Restores every user's original policy at the end.

var TAG = 'ISO-TEST';
var RM = 'daf6052adb5823009ef63a2b7c961942';

function log(s) { gs.print(s); }
function hr() { gs.print('------------------------------------------------------------'); }

var results = [];
function check(name, pass, detail) {
    results.push({ name: name, pass: pass, detail: detail });
}

// ---------------------------------------------------------------- cleanup
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
        while (gr.next()) gr.deleteRecord();
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

// ---------------------------------------------------------------- policies
var polZero = new GlideRecord('time_sheet_policy');
polZero.get('name', 'Zero Labor Cost Policy');
var polDefault = new GlideRecord('time_sheet_policy');
polDefault.get('is_default', '1');
var polOther = new GlideRecord('time_sheet_policy');
polOther.get('name', 'Time sheet policy for european users');

log('policies: zero=' + polZero.getUniqueValue() +
    ' default=' + polDefault.getUniqueValue() +
    ' other=' + polOther.getUniqueValue());
log('  default policy flag  = ' + polDefault.getValue('u_zero_labor_cost'));
log('  other   policy flag  = ' + polOther.getValue('u_zero_labor_cost'));

// ---------------------------------------------------------------- pick 4 distinct users
var userIds = [];
var uq = new GlideRecord('sys_user');
uq.addQuery('active', true);
uq.addNotNullQuery('first_name');
uq.orderBy('sys_id');
uq.setLimit(4);
uq.query();
while (uq.next()) userIds.push(uq.getUniqueValue());

var restore = {};
function setPolicy(userId, policyId) {
    var u = new GlideRecord('sys_user');
    u.get(userId);
    if (!(userId in restore)) restore[userId] = u.getValue('time_sheet_policy');
    if (policyId === null) u.setValue('time_sheet_policy', '');
    else u.setValue('time_sheet_policy', policyId);
    u.setWorkflow(false);
    u.update();
}

// ---------------------------------------------------------------- helpers
function makeProject(name, withRateModel) {
    var p = new GlideRecord('pm_project');
    p.initialize();
    p.setValue('short_description', TAG + ' ' + name);
    if (withRateModel) p.setValue('rate_model', RM);
    p.setValue('start_date', '2026-06-07 08:00:00');
    p.setValue('end_date', '2026-06-27 17:00:00');
    return p.insert();
}

function makePlan(projectId, userId) {
    var pl = new GlideRecord('resource_plan');
    pl.initialize();
    pl.setValue('short_description', TAG + ' plan');
    pl.setValue('task', projectId);
    pl.setValue('top_task', projectId);
    pl.setValue('resource_type', 'user');
    pl.setValue('user_resource', userId);
    pl.setValue('start_date', '2026-06-07');
    pl.setValue('end_date', '2026-06-13');
    pl.setValue('plan_type', 'task');
    pl.setValue('planned_hours', 40);
    pl.setValue('state', 1);
    var id = pl.insert();
    var g = new GlideRecord('resource_plan');
    g.get(id);
    var rp = new ResourcePlan(g);
    rp.createRequestedAllocations();
    rp.allocate(true);
    return id;
}

function submitTime(projectId, planId, userId, week) {
    var tc = new GlideRecord('time_card');
    tc.initialize();
    tc.setValue('user', userId);
    tc.setValue('task', projectId);
    tc.setValue('resource_plan', planId);
    tc.setValue('week_starts_on', week || '2026-06-07');
    tc.setValue('category', 'project_work');
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(function (d) { tc.setValue(d, 8); });
    tc.setValue('total', 40);
    tc.setValue('state', 'Submitted');
    tc.setWorkflow(false);
    var id = tc.insert();
    var g = new GlideRecord('time_card');
    g.get(id);
    var rate = parseFloat(new TaskRateAPI(g).getRateForTimecard().getRateForDay(week || '2026-06-07').rate || 0);
    new TimeCardProcessHandler().process(g);
    return { id: id, rate: rate };
}

function expenseTotal(tcId) {
    var t = 0;
    var e = new GlideRecord('fm_expense_line');
    e.addQuery('time_card', tcId);
    e.query();
    while (e.next()) t += parseFloat(e.amount.getCurrencyValue() || 0);
    return t;
}

function processExpenses(tcId) {
    var e = new GlideRecord('fm_expense_line');
    e.addQuery('time_card', tcId);
    e.query();
    while (e.next()) { e.setValue('state', 'processed'); e.update(); }
}

function planActualCost(planId) {
    var g = new GlideRecord('resource_plan');
    g.get(planId);
    return parseFloat(g.getValue('actual_cost') || 0);
}

function projectActual(projectId) {
    var g = new GlideRecord('pm_project');
    g.get(projectId);
    return parseFloat(g.getValue('work_cost') || 0);
}

// ---------------------------------------------------------------- 1-4: policy variants
hr();
log('SCENARIOS 1-4 : one user per policy variant, own project');
hr();

var variants = [
    { label: '1. NO policy assigned (majority case)', policy: null, expectZero: false },
    { label: '2. explicit default policy', policy: polDefault.getUniqueValue(), expectZero: false },
    { label: '3. other policy, flag off', policy: polOther.getUniqueValue(), expectZero: false },
    { label: '4. zero labor cost policy', policy: polZero.getUniqueValue(), expectZero: true }
];

variants.forEach(function (v, i) {
    var userId = userIds[i];
    setPolicy(userId, v.policy);

    var projectId = makeProject(v.label, true);
    var planId = makePlan(projectId, userId);
    var tc = submitTime(projectId, planId, userId);
    var exp = expenseTotal(tc.id);
    processExpenses(tc.id);

    var pac = planActualCost(planId);
    var proj = projectActual(projectId);

    log('  ' + v.label);
    log('      rate/hr=' + tc.rate + '  expense=' + exp +
        '  plan.actual_cost=' + pac + '  project.actual=' + proj);

    if (v.expectZero) {
        check(v.label + ' -> rate is 0', tc.rate === 0, 'rate=' + tc.rate);
        check(v.label + ' -> expense is 0', exp === 0, 'exp=' + exp);
        check(v.label + ' -> project actual is 0', proj === 0, 'proj=' + proj);
    } else {
        check(v.label + ' -> rate is NON-zero', tc.rate > 0, 'rate=' + tc.rate);
        check(v.label + ' -> expense is NON-zero', exp > 0, 'exp=' + exp);
        check(v.label + ' -> project actual is NON-zero', proj > 0, 'proj=' + proj);
    }
});

// ---------------------------------------------------------------- 5: mixed project
hr();
log('SCENARIO 5 : MIXED project -- one normal user and one zero-policy user, same project');
hr();

var normalUser = userIds[0];
var zeroUser = userIds[3];
setPolicy(normalUser, null);                       // no policy -> default -> normal
setPolicy(zeroUser, polZero.getUniqueValue());

var mixProject = makeProject('mixed project', true);
var mixPlanNormal = makePlan(mixProject, normalUser);
var mixPlanZero = makePlan(mixProject, zeroUser);

var tcNormal = submitTime(mixProject, mixPlanNormal, normalUser);
var tcZero = submitTime(mixProject, mixPlanZero, zeroUser);

var expNormal = expenseTotal(tcNormal.id);
var expZero = expenseTotal(tcZero.id);
processExpenses(tcNormal.id);
processExpenses(tcZero.id);

var mixProjActual = projectActual(mixProject);

log('  normal user : rate=' + tcNormal.rate + ' expense=' + expNormal +
    ' plan.actual=' + planActualCost(mixPlanNormal));
log('  zero   user : rate=' + tcZero.rate + ' expense=' + expZero +
    ' plan.actual=' + planActualCost(mixPlanZero));
log('  PROJECT actual cost = ' + mixProjActual + '   (should equal the normal user only)');

check('mixed: normal user still charges', expNormal > 0, 'exp=' + expNormal);
check('mixed: zero user charges nothing', expZero === 0, 'exp=' + expZero);
check('mixed: project actual == normal user only',
    mixProjActual === expNormal, 'project=' + mixProjActual + ' normal=' + expNormal);

// ---------------------------------------------------------------- 6: no rate model (rate card path)
hr();
log('SCENARIO 6 : project with NO rate model -- exercises the labor rate card fallback');
hr();

[{ label: 'normal user', user: userIds[1], policy: null, expectZero: false },
 { label: 'zero user', user: userIds[3], policy: polZero.getUniqueValue(), expectZero: true }
].forEach(function (v) {
    setPolicy(v.user, v.policy);
    var pid = makeProject('no rate model ' + v.label, false);
    var plid = makePlan(pid, v.user);
    var tc = submitTime(pid, plid, v.user, '2026-06-14');
    var exp = expenseTotal(tc.id);
    log('  ' + v.label + ' : rate/hr=' + tc.rate + '  expense=' + exp);
    if (v.expectZero) check('no rate model, ' + v.label + ' -> 0', tc.rate === 0 && exp === 0,
        'rate=' + tc.rate + ' exp=' + exp);
    else check('no rate model, ' + v.label + ' -> non-zero', tc.rate > 0 && exp > 0,
        'rate=' + tc.rate + ' exp=' + exp);
});

// ---------------------------------------------------------------- 7: recall on the zero policy
hr();
log('SCENARIO 7 : recall a zero-policy time card');
hr();

setPolicy(userIds[3], polZero.getUniqueValue());
var rProject = makeProject('recall', true);
var rPlan = makePlan(rProject, userIds[3]);
var rTc = submitTime(rProject, rPlan, userIds[3], '2026-06-21');

var rGr = new GlideRecord('time_card');
rGr.get(rTc.id);
rGr.setValue('state', 'Recalled');
rGr.setWorkflow(false);
rGr.update();
new TimeCardProcessHandler().recall(rGr);

var recallTotal = 0, recallCount = 0;
var re = new GlideRecord('fm_expense_line');
re.addQuery('time_card', rTc.id);
re.query();
while (re.next()) { recallCount++; recallTotal += parseFloat(re.amount.getCurrencyValue() || 0); }
log('  after recall: ' + recallCount + ' expense line(s), net total = ' + recallTotal);
check('recall nets to 0 on the zero policy', recallTotal === 0, 'net=' + recallTotal);

// ---------------------------------------------------------------- restore
hr();
for (var uid in restore) {
    var ru = new GlideRecord('sys_user');
    ru.get(uid);
    ru.setValue('time_sheet_policy', restore[uid]);
    ru.setWorkflow(false);
    ru.update();
}
log('restored ' + Object.keys(restore).length + ' user policy assignments');

// ---------------------------------------------------------------- verdict
hr();
log('=== VERDICT ===');
var failures = 0;
results.forEach(function (r) {
    log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + (r.detail ? '   [' + r.detail + ']' : ''));
    if (!r.pass) failures++;
});
log('');
log(failures === 0 ? 'ALL ' + results.length + ' CHECKS PASSED'
    : failures + ' of ' + results.length + ' CHECKS FAILED');
