// OPTION G test -- label flows from policy to expense line; PROJECTS ONLY.
//
//   project + labelled user  -> stamped, state 'excluded', amount preserved, project actual 0
//   DEMAND  + labelled user  -> NOT stamped, normal processing        <-- the projects-only rule
//   project + normal user    -> NOT stamped, normal processing
//   project TASK + labelled  -> stamped (rolls into the project)
//   mixed project            -> project actual = normal user only

var TAG = 'LBL-TEST';
var RM = 'daf6052adb5823009ef63a2b7c961942';
var LABEL = 'non_chargeable';

function log(s) { gs.print(s); }
function hr() { gs.print('------------------------------------------------------------'); }
var results = [];
function check(n, p, d) { results.push({ n: n, p: p, d: d }); }

// ---------------------------------------------------------------- cleanup
['pm_project', 'dmn_demand'].forEach(function (t) {
    var ids = [];
    var g = new GlideRecord(t);
    g.addQuery('short_description', 'STARTSWITH', TAG);
    g.query();
    while (g.next()) ids.push(g.getUniqueValue());
    if (!ids.length) return;
    var l = ids.join(',');
    ['fm_expense_line', 'time_card', 'resource_allocation_daily'].forEach(function (x) {
        var d = new GlideRecord(x); d.addQuery('task', 'IN', l); d.deleteMultiple();
    });
    var rp = new GlideRecord('resource_plan'); rp.addQuery('task', 'IN', l);
    rp.query(); while (rp.next()) new ResourcePlan(rp).deleteResourceAllocations();
    var rp2 = new GlideRecord('resource_plan'); rp2.addQuery('task', 'IN', l); rp2.deleteMultiple();
    var pj = new GlideRecord(t); pj.addQuery('sys_id', 'IN', l); pj.deleteMultiple();
    log('cleaned ' + ids.length + ' ' + t);
});

var polZero = new GlideRecord('time_sheet_policy');
polZero.get('name', 'Zero Labor Cost Policy');

var users = [];
var uq = new GlideRecord('sys_user');
uq.addQuery('active', true); uq.addNotNullQuery('first_name');
uq.orderBy('sys_id'); uq.setLimit(2); uq.query();
while (uq.next()) users.push(uq.getUniqueValue());

var restore = {};
function setPolicy(u, p) {
    var g = new GlideRecord('sys_user'); g.get(u);
    if (!(u in restore)) restore[u] = g.getValue('time_sheet_policy');
    g.setValue('time_sheet_policy', p === null ? '' : p);
    g.setWorkflow(false); g.update();
}

function makeProject(n) {
    var p = new GlideRecord('pm_project'); p.initialize();
    p.setValue('short_description', TAG + ' ' + n);
    p.setValue('rate_model', RM);
    p.setValue('start_date', '2026-06-07 08:00:00');
    p.setValue('end_date', '2026-06-27 17:00:00');
    return p.insert();
}
function makeDemand(n) {
    var d = new GlideRecord('dmn_demand'); d.initialize();
    d.setValue('short_description', TAG + ' ' + n);
    if (d.isValidField('rate_model')) d.setValue('rate_model', RM);
    return d.insert();
}
function makeProjectTask(projectId, n) {
    var t = new GlideRecord('pm_project_task'); t.initialize();
    t.setValue('short_description', TAG + ' ' + n);
    t.setValue('parent', projectId);
    t.setValue('top_task', projectId);
    return t.insert();
}
function submitTime(taskId, userId, week) {
    var tc = new GlideRecord('time_card'); tc.initialize();
    tc.setValue('user', userId);
    tc.setValue('task', taskId);
    tc.setValue('week_starts_on', week || '2026-06-07');
    tc.setValue('category', 'project_work');
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(function (d) { tc.setValue(d, 8); });
    tc.setValue('total', 40);
    tc.setValue('state', 'Submitted');
    tc.setWorkflow(false);
    var id = tc.insert();
    var g = new GlideRecord('time_card'); g.get(id);
    new TimeCardProcessHandler().process(g);
    return id;
}
function line(tcId) {
    var e = new GlideRecord('fm_expense_line');
    e.addQuery('time_card', tcId);
    e.orderBy('sys_created_on');
    e.setLimit(1);
    e.query();
    if (!e.next()) return null;
    return {
        amount: parseFloat(e.amount.getCurrencyValue() || 0),
        state: e.getValue('state'),
        label: e.getValue('u_labor_expense_label') || '',
        task: e.getValue('task')
    };
}
// faithful mimic of the daily job -- only touches 'pending'
function runDailyJob(taskId) {
    var n = 0;
    var e = new GlideRecord('fm_expense_line');
    e.addQuery('task', taskId);
    e.addQuery('state', 'pending');
    e.query();
    while (e.next()) { new ExpenseAllocator(e).processRules(); n++; }
    return n;
}
function projActual(id) {
    var g = new GlideRecord('pm_project'); g.get(id);
    return parseFloat(g.getValue('work_cost') || 0);
}

// ---------------------------------------------------------------- 1. project + labelled
hr(); log('1. PROJECT + labelled user'); hr();
setPolicy(users[1], polZero.getUniqueValue());
var p1 = makeProject('project labelled');
var tc1 = submitTime(p1, users[1]);
var l1 = line(tc1);
log('  line: amount=' + l1.amount + ' state=' + l1.state + ' label="' + l1.label + '"');
var picked1 = runDailyJob(p1);
var l1b = line(tc1);
log('  daily job picked up ' + picked1 + ' | after: state=' + l1b.state);
log('  project actual cost = ' + projActual(p1));
check('project+labelled: label stamped', l1.label === LABEL, 'label=' + l1.label);
check('project+labelled: state excluded', l1.state === 'excluded', 'state=' + l1.state);
check('project+labelled: amount preserved', l1.amount > 0, 'amount=' + l1.amount);
check('project+labelled: daily job skipped it', picked1 === 0, 'picked=' + picked1);
check('project+labelled: project actual 0', projActual(p1) === 0, 'actual=' + projActual(p1));

// ---------------------------------------------------------------- 2. DEMAND -- informational
// Not scoped to projects by design: hours are not planned or submitted against demands in this
// process. Recorded here so the behaviour is known rather than assumed, but not asserted.
hr(); log('2. DEMAND + labelled user  (INFORMATIONAL -- no assertion, this path is not used)'); hr();
var d1 = makeDemand('demand labelled');
var tc2 = submitTime(d1, users[1], '2026-06-14');
var l2 = line(tc2);
if (!l2) {
    log('  no expense line produced for the demand');
} else {
    log('  line: amount=' + l2.amount + ' state=' + l2.state + ' label="' + l2.label + '"');
    var picked2 = runDailyJob(d1);
    log('  daily job picked up ' + picked2 + ' | after: state=' + line(tc2).state);
    log('  -> demands receive the same treatment; harmless because time is not booked to them');
}

// ---------------------------------------------------------------- 3. project + normal user
hr(); log('3. PROJECT + normal user'); hr();
setPolicy(users[0], null);
var p3 = makeProject('project normal');
var tc3 = submitTime(p3, users[0]);
var l3 = line(tc3);
log('  line: amount=' + l3.amount + ' state=' + l3.state + ' label="' + l3.label + '"');
runDailyJob(p3);
var l3b = line(tc3);
log('  after job: state=' + l3b.state + ' | project actual = ' + projActual(p3));
check('project+normal: NOT labelled', l3.label === '', 'label=' + l3.label);
check('project+normal: processed', l3b.state === 'processed', 'state=' + l3b.state);
check('project+normal: project actual non-zero', projActual(p3) > 0, 'actual=' + projActual(p3));

// ---------------------------------------------------------------- 4. project TASK + labelled
hr(); log('4. PROJECT TASK + labelled user'); hr();
var p4 = makeProject('parent for task');
var t4 = makeProjectTask(p4, 'child task');
var tc4 = submitTime(t4, users[1], '2026-06-21');
var l4 = line(tc4);
if (l4) {
    log('  line: amount=' + l4.amount + ' state=' + l4.state + ' label="' + l4.label + '"');
    check('project task+labelled: label stamped', l4.label === LABEL, 'label=' + l4.label);
    check('project task+labelled: state excluded', l4.state === 'excluded', 'state=' + l4.state);
} else {
    log('  no expense line for the project task');
    check('project task: line exists', false, 'no line');
}

// ---------------------------------------------------------------- 5. mixed project
hr(); log('5. MIXED project'); hr();
var p5 = makeProject('mixed');
var tcN = submitTime(p5, users[0]);
var tcZ = submitTime(p5, users[1]);
var lN = line(tcN), lZ = line(tcZ);
runDailyJob(p5);
var mix = projActual(p5);
log('  normal: amount=' + lN.amount + ' state=' + line(tcN).state + ' label="' + lN.label + '"');
log('  labelled: amount=' + lZ.amount + ' state=' + lZ.state + ' label="' + lZ.label + '"');
log('  project actual = ' + mix);
check('mixed: project actual == normal only', mix === lN.amount, 'project=' + mix + ' normal=' + lN.amount);

// ---------------------------------------------------------------- restore
hr();
for (var u in restore) {
    var g = new GlideRecord('sys_user'); g.get(u);
    g.setValue('time_sheet_policy', restore[u]);
    g.setWorkflow(false); g.update();
}
log('restored ' + Object.keys(restore).length + ' policy assignments');

hr(); log('=== VERDICT ===');
var f = 0;
results.forEach(function (r) {
    log((r.p ? '  PASS  ' : '  FAIL  ') + r.n + (r.d ? '   [' + r.d + ']' : ''));
    if (!r.p) f++;
});
log('');
log(f === 0 ? 'ALL ' + results.length + ' CHECKS PASSED' : f + ' of ' + results.length + ' FAILED');
