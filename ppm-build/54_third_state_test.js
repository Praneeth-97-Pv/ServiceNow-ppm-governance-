// OPTION F test -- labor lines parked in 'excluded' keep their REAL amount and never roll up.
//
// The expense processing step here mimics the OOB daily job faithfully: it only touches lines in
// 'pending'. Forcing every line to 'processed' (as the earlier tests did) would defeat the point.

var TAG = 'TS3-TEST';
var RM = 'daf6052adb5823009ef63a2b7c961942';

function log(s) { gs.print(s); }
function hr() { gs.print('------------------------------------------------------------'); }

var results = [];
function check(name, pass, detail) { results.push({ name: name, pass: pass, detail: detail }); }

// ---------------------------------------------------------------- cleanup
var oldIds = [];
var op = new GlideRecord('pm_project');
op.addQuery('short_description', 'STARTSWITH', TAG);
op.query();
while (op.next()) oldIds.push(op.getUniqueValue());
if (oldIds.length) {
    var l = oldIds.join(',');
    ['fm_expense_line', 'time_card', 'resource_allocation_daily'].forEach(function (t) {
        var g = new GlideRecord(t); g.addQuery('task', 'IN', l); g.deleteMultiple();
    });
    var rp = new GlideRecord('resource_plan'); rp.addQuery('task', 'IN', l);
    rp.query(); while (rp.next()) { new ResourcePlan(rp).deleteResourceAllocations(); }
    var rp2 = new GlideRecord('resource_plan'); rp2.addQuery('task', 'IN', l); rp2.deleteMultiple();
    var pj = new GlideRecord('pm_project'); pj.addQuery('sys_id', 'IN', l); pj.deleteMultiple();
    log('cleaned ' + oldIds.length + ' old project(s)');
}

var polZero = new GlideRecord('time_sheet_policy');
polZero.get('name', 'Zero Labor Cost Policy');

var users = [];
var uq = new GlideRecord('sys_user');
uq.addQuery('active', true); uq.addNotNullQuery('first_name');
uq.orderBy('sys_id'); uq.setLimit(2); uq.query();
while (uq.next()) users.push(uq.getUniqueValue());

var restore = {};
function setPolicy(userId, policyId) {
    var u = new GlideRecord('sys_user'); u.get(userId);
    if (!(userId in restore)) restore[userId] = u.getValue('time_sheet_policy');
    u.setValue('time_sheet_policy', policyId === null ? '' : policyId);
    u.setWorkflow(false); u.update();
}

function makeProject(n) {
    var p = new GlideRecord('pm_project'); p.initialize();
    p.setValue('short_description', TAG + ' ' + n);
    p.setValue('rate_model', RM);
    p.setValue('start_date', '2026-06-07 08:00:00');
    p.setValue('end_date', '2026-06-27 17:00:00');
    return p.insert();
}
function makePlan(projectId, userId) {
    var pl = new GlideRecord('resource_plan'); pl.initialize();
    pl.setValue('short_description', TAG + ' plan');
    pl.setValue('task', projectId); pl.setValue('top_task', projectId);
    pl.setValue('resource_type', 'user'); pl.setValue('user_resource', userId);
    pl.setValue('start_date', '2026-06-07'); pl.setValue('end_date', '2026-06-13');
    pl.setValue('plan_type', 'task'); pl.setValue('planned_hours', 40); pl.setValue('state', 1);
    var id = pl.insert();
    var g = new GlideRecord('resource_plan'); g.get(id);
    var rp = new ResourcePlan(g); rp.createRequestedAllocations(); rp.allocate(true);
    return id;
}
function submitTime(projectId, planId, userId) {
    var tc = new GlideRecord('time_card'); tc.initialize();
    tc.setValue('user', userId); tc.setValue('task', projectId);
    tc.setValue('resource_plan', planId); tc.setValue('week_starts_on', '2026-06-07');
    tc.setValue('category', 'project_work');
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(function (d) { tc.setValue(d, 8); });
    tc.setValue('total', 40); tc.setValue('state', 'Submitted');
    tc.setWorkflow(false);
    var id = tc.insert();
    var g = new GlideRecord('time_card'); g.get(id);
    new TimeCardProcessHandler().process(g);
    return id;
}
function lines(tcId) {
    var out = [];
    var e = new GlideRecord('fm_expense_line');
    e.addQuery('time_card', tcId); e.query();
    while (e.next()) out.push({
        amount: parseFloat(e.amount.getCurrencyValue() || 0),
        state: e.getValue('state'),
        category: e.getValue('category')
    });
    return out;
}
// faithful mimic of the OOB daily job: it only ever looks at 'pending'
function runDailyJobFor(projectId) {
    var n = 0;
    var e = new GlideRecord('fm_expense_line');
    e.addQuery('task', projectId);
    e.addQuery('state', 'pending');
    e.query();
    while (e.next()) { new ExpenseAllocator(e).processRules(); n++; }
    return n;
}
function projectActual(projectId) {
    var g = new GlideRecord('pm_project'); g.get(projectId);
    return parseFloat(g.getValue('work_cost') || 0);
}
function plannedCost(planId) {
    var g = new GlideRecord('resource_plan'); g.get(planId);
    return parseFloat(g.getValue('planned_cost') || 0);
}

// ---------------------------------------------------------------- arms
function arm(label, userId, policyId) {
    hr(); log(label); hr();
    setPolicy(userId, policyId);
    var pid = makeProject(label);
    var plid = makePlan(pid, userId);
    var tcId = submitTime(pid, plid, userId);

    var before = lines(tcId);
    log('  planned_cost = ' + plannedCost(plid));
    before.forEach(function (l) {
        log('  expense line: amount=' + l.amount + ' state=' + l.state + ' category=' + l.category);
    });

    var processed = runDailyJobFor(pid);
    log('  daily job picked up ' + processed + ' pending line(s)');

    var after = lines(tcId);
    after.forEach(function (l) {
        log('  after job   : amount=' + l.amount + ' state=' + l.state);
    });
    var pa = projectActual(pid);
    log('  PROJECT actual cost = ' + pa);
    return { planned: plannedCost(plid), lines: after, projectActual: pa, project: pid, tc: tcId };
}

var control = arm('CONTROL -- no policy', users[0], null);
var excluded = arm('EXCLUDED -- zero labor cost policy', users[1], polZero.getUniqueValue());

// ---------------------------------------------------------------- mixed project
hr(); log('MIXED -- both users on one project'); hr();
setPolicy(users[0], null);
setPolicy(users[1], polZero.getUniqueValue());
var mp = makeProject('mixed');
var mpN = makePlan(mp, users[0]);
var mpZ = makePlan(mp, users[1]);
var tcN = submitTime(mp, mpN, users[0]);
var tcZ = submitTime(mp, mpZ, users[1]);
var nAmt = lines(tcN)[0] ? lines(tcN)[0].amount : 0;
var zAmt = lines(tcZ)[0] ? lines(tcZ)[0].amount : 0;
var zState = lines(tcZ)[0] ? lines(tcZ)[0].state : '?';
runDailyJobFor(mp);
var mixActual = projectActual(mp);
log('  normal user line: amount=' + nAmt);
log('  zero   user line: amount=' + zAmt + ' state=' + zState);
log('  PROJECT actual cost = ' + mixActual);

// ---------------------------------------------------------------- restore
hr();
for (var uid in restore) {
    var ru = new GlideRecord('sys_user'); ru.get(uid);
    ru.setValue('time_sheet_policy', restore[uid]);
    ru.setWorkflow(false); ru.update();
}
log('restored ' + Object.keys(restore).length + ' policy assignments');

// ---------------------------------------------------------------- verdict
var cl = control.lines[0] || {}, el = excluded.lines[0] || {};
check('control: line ends processed', cl.state === 'processed', 'state=' + cl.state);
check('control: project actual non-zero', control.projectActual > 0, 'actual=' + control.projectActual);
check('EXCLUDED: amount is PRESERVED, not zeroed', el.amount > 0, 'amount=' + el.amount);
check('EXCLUDED: state is "excluded"', el.state === 'excluded', 'state=' + el.state);
check('EXCLUDED: daily job did NOT touch it', el.state === 'excluded', 'state=' + el.state);
check('EXCLUDED: project actual is 0', excluded.projectActual === 0, 'actual=' + excluded.projectActual);
check('EXCLUDED: planned cost intact', excluded.planned > 0, 'planned=' + excluded.planned);
check('mixed: zero user amount preserved', zAmt > 0, 'amount=' + zAmt);
check('mixed: zero user state excluded', zState === 'excluded', 'state=' + zState);
check('mixed: project actual == normal user only', mixActual === nAmt,
    'project=' + mixActual + ' normal=' + nAmt);

hr(); log('=== VERDICT ===');
var f = 0;
results.forEach(function (r) {
    log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + (r.detail ? '   [' + r.detail + ']' : ''));
    if (!r.pass) f++;
});
log('');
log(f === 0 ? 'ALL ' + results.length + ' CHECKS PASSED' : f + ' of ' + results.length + ' FAILED');
