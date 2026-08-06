// IDEA (refined): give labor lines a THIRD state -- not 'pending' (so the daily allocation job
// never picks them up) and not 'processed' (so no actual-cost rollup ever counts them).
// The amount stays REAL, so you keep a full audit trail of what the labor was worth.
//
// Safety question this must answer: does EVERY consumer of fm_expense_line either
//   (a) filter to state=processed, or (b) not sum money?
// Anything that sums without filtering, or filters with state != 'processed', would leak.
// Read-only.

var TABLES = ['sys_script', 'sys_script_include', 'sysauto_script', 'sys_ui_action',
    'sysevent_script_action', 'sys_transform_script'];

gs.print('===== every script that touches fm_expense_line =====');
var risky = [], safe = [], neutral = [];

TABLES.forEach(function (t) {
    var gr = new GlideRecord(t);
    if (!gr.isValid()) return;
    gr.addQuery('script', 'CONTAINS', 'fm_expense_line');
    gr.query();
    while (gr.next()) {
        var name = gr.getValue('name');
        var s = gr.getValue('script') || '';
        var active = gr.isValidField('active') ? gr.getValue('active') : '1';

        var sumsMoney = /addAggregate\s*\(\s*["']SUM["']\s*,\s*["']amount|amount\.getCurrencyValue|\+=\s*.*amount/.test(s);
        var filtersProcessed = /state["']?\s*,\s*["']processed["']/.test(s);
        var inverseFilter = /state["']?\s*,\s*["']!=["']\s*,|state\s*!=\s*["']processed/.test(s);

        var entry = '  [' + t + '] ' + name + ' (active=' + active + ')';
        if (sumsMoney && !filtersProcessed) risky.push(entry + '   <-- SUMS MONEY, NO state=processed FILTER');
        else if (inverseFilter) risky.push(entry + '   <-- uses an INVERSE state filter');
        else if (sumsMoney && filtersProcessed) safe.push(entry + '   sums, filters processed - safe');
        else neutral.push(entry);
    }
});

gs.print('--- POTENTIAL LEAKS ---');
gs.print(risky.length ? risky.join('\n') : '  none');
gs.print('');
gs.print('--- SAFE (sums money, filters state=processed) ---');
gs.print(safe.length ? safe.join('\n') : '  none');
gs.print('');
gs.print('--- does not sum money (' + neutral.length + ') ---');
gs.print(neutral.slice(0, 25).join('\n'));

gs.print('');
gs.print('===== anything querying state=pending (the daily job working set) =====');
TABLES.forEach(function (t) {
    var gr = new GlideRecord(t);
    if (!gr.isValid()) return;
    gr.addQuery('script', 'CONTAINS', 'pending');
    gr.addQuery('script', 'CONTAINS', 'fm_expense_line');
    gr.query();
    while (gr.next())
        gs.print('  [' + t + '] ' + gr.getValue('name') +
            ' active=' + (gr.isValidField('active') ? gr.getValue('active') : '-'));
});

gs.print('');
gs.print('===== current state choices on fm_expense_line =====');
var c = new GlideRecord('sys_choice');
c.addQuery('name', 'fm_expense_line');
c.addQuery('element', 'state');
c.query();
while (c.next())
    gs.print('  value=' + c.getValue('value') + ' label=' + c.getValue('label') +
        ' inactive=' + c.getValue('inactive') + ' seq=' + c.getValue('sequence'));

gs.print('');
gs.print('===== is state a real choice field or free text? =====');
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'fm_expense_line');
d.addQuery('element', 'state');
d.query();
if (d.next())
    gs.print('  type=' + d.getValue('internal_type') + ' choice=' + d.getValue('choice') +
        ' max_length=' + d.getValue('max_length') + ' default=' + d.getValue('default_value'));
