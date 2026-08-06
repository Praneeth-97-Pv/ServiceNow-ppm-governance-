// Edge cases for the label-driven design. These are the paths most likely to hide a defect.
//
//   1. RECALL of an excluded line   -> negative line must ALSO be excluded, else actual goes negative
//   2. RECALL of a normal line      -> negative line processed, actual returns to 0 (control)
//   3. user moved OFF the policy    -> existing lines KEEP their label  (the historical-stamp claim)
//   4. user moved ONTO the policy   -> only NEW lines are labelled
//   5. rate-card project (no rate model) -> still labelled and excluded

var TAG = 'EDGE-TEST';
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
    ['fm_expense_line', 'time_card', 'resource_allocation_daily', 'resource_plan'].forEach(function (x) {
        var d = new GlideRecord(x); d.addQuery('task', 'IN', l); d.deleteMultiple();
    });
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
function makeProject(n, withRM) {
    var p = new GlideRecord('pm_project'); p.initialize();
    p.setValue('short_description', TAG + ' ' + n);
    if (withRM) p.setValue('rate_model', RM);
    p.setValue('start_date', '2026-06-07 08:00:00');
    p.setValue('end_date', '2026-06-27 17:00:00');
    return p.insert();
}
function submitTime(taskId, userId, week) {
    var tc = new GlideRecord('time_card'); tc.initialize();
    tc.setValue('user', userId); tc.setValue('task', taskId);
    tc.setValue('week_starts_on', week); tc.setValue('category', 'project_work');
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(function (d) { tc.setValue(d, 8); });
    tc.setValue('total', 40); tc.setValue('state', 'Submitted');
    tc.setWorkflow(false);
    var id = tc.insert();
    var g = new GlideRecord('time_card'); g.get(id);
    new TimeCardProcessHandler().process(g);
    return id;
}
function allLines(tcId) {
    var out = [];
    var e = new GlideRecord('fm_expense_line');
    e.addQuery('time_card', tcId); e.orderBy('sys_created_on'); e.query();
    while (e.next()) out.push({
        amount: parseFloat(e.amount.getCurrencyValue() || 0),
        state: e.getValue('state'),
        label: e.getValue('u_labor_expense_label') || ''
    });
    return out;
}
function runDailyJob(taskId) {
    var n = 0;
    var e = new GlideRecord('fm_expense_line');
    e.addQuery('task', taskId); e.addQuery('state', 'pending'); e.query();
    while (e.next()) { new ExpenseAllocator(e).processRules(); n++; }
    return n;
}
function projActual(id) {
    var g = new GlideRecord('pm_project'); g.get(id);
    return parseFloat(g.getValue('work_cost') || 0);
}
function recall(tcId) {
    var g = new GlideRecord('time_card'); g.get(tcId);
    g.setValue('state', 'Recalled'); g.setWorkflow(false); g.update();
    new TimeCardProcessHandler().recall(g);
}

// ---------------------------------------------------------------- 1. recall an EXCLUDED line
hr(); log('1. RECALL of an EXCLUDED line'); hr();
setPolicy(users[1], polZero.getUniqueValue());
var p1 = makeProject('recall excluded', true);
var tc1 = submitTime(p1, users[1], '2026-06-07');
log('  before recall: ' + JSON.stringify(allLines(tc1)));
recall(tc1);
runDailyJob(p1);
var l1 = allLines(tc1);
l1.forEach(function (x) { log('  line: amount=' + x.amount + ' state=' + x.state + ' label="' + x.label + '"'); });
var anyProcessed1 = l1.some(function (x) { return x.state === 'processed'; });
log('  project actual = ' + projActual(p1));
check('recall/excluded: no line reached processed', !anyProcessed1, 'processed=' + anyProcessed1);
check('recall/excluded: every line labelled',
    l1.every(function (x) { return x.label === LABEL; }), JSON.stringify(l1.map(function (x) { return x.label; })));
check('recall/excluded: project actual still 0', projActual(p1) === 0, 'actual=' + projActual(p1));

// ---------------------------------------------------------------- 2. recall a NORMAL line (control)
hr(); log('2. RECALL of a NORMAL line (control)'); hr();
setPolicy(users[0], null);
var p2 = makeProject('recall normal', true);
var tc2 = submitTime(p2, users[0], '2026-06-07');
runDailyJob(p2);
log('  after submit, project actual = ' + projActual(p2));
recall(tc2);
runDailyJob(p2);
var l2 = allLines(tc2);
l2.forEach(function (x) { log('  line: amount=' + x.amount + ' state=' + x.state); });
log('  after recall, project actual = ' + projActual(p2));
check('recall/normal: nets back to 0', projActual(p2) === 0, 'actual=' + projActual(p2));

// ---------------------------------------------------------------- 3. user moved OFF the policy
hr(); log('3. user moved OFF the policy -- existing lines must KEEP their label'); hr();
setPolicy(users[1], polZero.getUniqueValue());
var p3 = makeProject('policy removed later', true);
var tc3 = submitTime(p3, users[1], '2026-06-14');
var before3 = allLines(tc3)[0];
log('  while ON policy : label="' + before3.label + '" state=' + before3.state);
setPolicy(users[1], null);                       // moved off
var after3 = allLines(tc3)[0];
log('  after moving OFF: label="' + after3.label + '" state=' + after3.state);
runDailyJob(p3);
var after3b = allLines(tc3)[0];
log('  after daily job : label="' + after3b.label + '" state=' + after3b.state);
check('historical: label survives policy removal', after3b.label === LABEL, 'label=' + after3b.label);
check('historical: still excluded after policy removal', after3b.state === 'excluded', 'state=' + after3b.state);
check('historical: project actual still 0', projActual(p3) === 0, 'actual=' + projActual(p3));

// ---------------------------------------------------------------- 4. user moved ONTO the policy
hr(); log('4. user moved ONTO the policy -- only NEW lines labelled'); hr();
setPolicy(users[0], null);
var p4 = makeProject('policy added later', true);
var tcBefore = submitTime(p4, users[0], '2026-06-07');
var lBefore = allLines(tcBefore)[0];
setPolicy(users[0], polZero.getUniqueValue());   // moved on
var tcAfter = submitTime(p4, users[0], '2026-06-14');
var lAfter = allLines(tcAfter)[0];
log('  line raised BEFORE joining: label="' + lBefore.label + '" state=' + lBefore.state);
log('  line raised AFTER  joining: label="' + lAfter.label + '" state=' + lAfter.state);
check('onboarding: earlier line NOT labelled', lBefore.label === '', 'label=' + lBefore.label);
check('onboarding: later line labelled', lAfter.label === LABEL, 'label=' + lAfter.label);

// ---------------------------------------------------------------- 5. rate-card project
hr(); log('5. project with NO rate model'); hr();
setPolicy(users[1], polZero.getUniqueValue());
var p5 = makeProject('no rate model', false);
var tc5 = submitTime(p5, users[1], '2026-06-21');
var l5 = allLines(tc5)[0];
log('  line: amount=' + l5.amount + ' state=' + l5.state + ' label="' + l5.label + '"');
runDailyJob(p5);
check('no rate model: labelled', l5.label === LABEL, 'label=' + l5.label);
check('no rate model: excluded', l5.state === 'excluded', 'state=' + l5.state);
check('no rate model: project actual 0', projActual(p5) === 0, 'actual=' + projActual(p5));

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
