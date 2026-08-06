// Rollout tooling for the label-driven design.
//
//   1. BACKFILL  -- label and exclude expense lines that already exist for labelled users,
//                   then let the OOB rollup recompute the affected projects.
//                   DRY RUN BY DEFAULT. Set COMMIT = true to actually write.
//   2. VISIBILITY -- a saved report so the excluded labour value is discoverable in the UI
//                   instead of only by querying fm_expense_line.

var COMMIT = false;          // <<< flip to true to apply the backfill
var LABEL_FIELD = 'u_labor_expense_label';

function log(s) { gs.print(s); }
function hr() { gs.print('------------------------------------------------------------'); }

// ---------------------------------------------------------------- 1. backfill
hr();
log(COMMIT ? 'BACKFILL -- COMMIT MODE, records WILL be written' : 'BACKFILL -- DRY RUN, nothing written');
hr();

var helper = new PPMLaborExpenseLabel();
var labelCache = {};
function labelFor(userId) {
    if (!(userId in labelCache)) labelCache[userId] = helper.forUser(userId);
    return labelCache[userId];
}

var candidates = new GlideRecord('fm_expense_line');
candidates.addQuery('category', 'labor');
candidates.addNotNullQuery('time_card');
candidates.addNullQuery(LABEL_FIELD);
candidates.query();

log('labor expense lines with a time card and no label: ' + candidates.getRowCount());

var affectedTasks = {};
var wouldChange = 0, wouldValue = 0, skipped = 0;

while (candidates.next()) {
    var tc = candidates.time_card.getRefRecord();
    if (!tc.isValidRecord()) { skipped++; continue; }

    var label = labelFor(tc.getValue('user'));
    if (!label) { skipped++; continue; }

    wouldChange++;
    wouldValue += parseFloat(candidates.amount.getCurrencyValue() || 0);
    var t = candidates.getValue('task');
    if (t) affectedTasks[t] = (affectedTasks[t] || 0) + parseFloat(candidates.amount.getCurrencyValue() || 0);

    if (COMMIT) {
        candidates.setValue(LABEL_FIELD, label);
        candidates.setValue('state', 'excluded');
        candidates.update();          // workflow ON so the OOB actual-cost rollup recomputes
    }
}

log('');
log('  lines that ' + (COMMIT ? 'were' : 'would be') + ' labelled + excluded : ' + wouldChange);
log('  total value removed from actual cost               : ' + wouldValue);
log('  lines skipped (no time card, or user not labelled) : ' + skipped);
log('  projects/tasks affected                            : ' + Object.keys(affectedTasks).length);

var shown = 0;
for (var taskId in affectedTasks) {
    if (shown++ >= 15) { log('  ... and ' + (Object.keys(affectedTasks).length - 15) + ' more'); break; }
    var tg = new GlideRecord('task');
    var nm = tg.get(taskId) ? tg.getDisplayValue() : taskId;
    log('    ' + nm + '  ->  ' + affectedTasks[taskId]);
}

if (!COMMIT && wouldChange > 0) {
    log('');
    log('  >>> DRY RUN. Re-run with COMMIT = true to apply.');
    log('  >>> Backfilling REWRITES historical project actual cost. Confirm with finance first.');
}

// ---------------------------------------------------------------- 2. visibility
hr();
log('VISIBILITY -- saved report');
hr();

var REPORT = 'Non-chargeable labor by project';
var r = new GlideRecord('sys_report');
var existing = r.get('title', REPORT);
if (!existing) r.initialize();
r.setValue('title', REPORT);
r.setValue('table', 'fm_expense_line');
r.setValue('type', 'bar');
r.setValue('field', 'task');            // group by
r.setValue('aggregate', 'SUM');
r.setValue('aggregation_source', 'amount');
r.setValue('filter', 'state=excluded^' + LABEL_FIELD + 'ISNOTEMPTY');
r.setValue('is_published', true);
var rid = existing ? (r.update(), r.getUniqueValue()) : r.insert();
log('  report "' + REPORT + '" -> ' + rid);
log('  table=fm_expense_line  filter=state=excluded^' + LABEL_FIELD + 'ISNOTEMPTY');
log('  grouped by task, SUM of amount');

// ---------------------------------------------------------------- 3. current picture
hr();
log('CURRENT PICTURE');
hr();
var byState = new GlideAggregate('fm_expense_line');
byState.addQuery('category', 'labor');
byState.addAggregate('COUNT');
byState.addAggregate('SUM', 'amount');
byState.groupBy('state');
byState.query();
while (byState.next())
    log('  labor lines state=' + byState.getValue('state') +
        ' -> count=' + byState.getAggregate('COUNT') +
        ' value=' + byState.getAggregate('SUM', 'amount'));

var labelled = new GlideAggregate('fm_expense_line');
labelled.addNotNullQuery(LABEL_FIELD);
labelled.addAggregate('COUNT');
labelled.addAggregate('SUM', 'amount');
labelled.groupBy(LABEL_FIELD);
labelled.query();
while (labelled.next())
    log('  labelled "' + labelled.getValue(LABEL_FIELD) + '" -> count=' +
        labelled.getAggregate('COUNT') + ' value=' + labelled.getAggregate('SUM', 'amount'));
