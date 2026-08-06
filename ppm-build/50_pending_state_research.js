// IDEA: don't zero the amount -- keep the real labor value on the expense line but never let it
// reach 'processed', so it never counts toward actual cost.
//
// Questions this must answer before it is viable:
//   1. What flips an expense line from pending -> processed?
//   2. Does that flip have an OOB condition/filter we can ride?
//   3. Does ANY other consumer read expense lines while ignoring state? (cost plans especially)
// Read-only.

function grep(table, terms, label) {
    gs.print('===== ' + label + ' =====');
    var gr = new GlideRecord(table);
    if (!gr.isValid()) { gs.print('  (invalid table)'); return; }
    var q = terms.map(function (t) { return 'scriptLIKE' + t; }).join('^OR');
    gr.addEncodedQuery(q);
    gr.query();
    while (gr.next()) {
        var s = gr.getValue('script') || '';
        var hits = [];
        s.split('\n').forEach(function (l, i) {
            if (terms.some(function (t) { return l.indexOf(t) > -1; }))
                hits.push('       ' + (i + 1) + ': ' + l.trim().substring(0, 150));
        });
        if (hits.length) {
            gs.print('  [' + gr.getValue('name') + ']' +
                (gr.isValidField('collection') ? ' on ' + gr.getValue('collection') : '') +
                (gr.isValidField('active') ? ' active=' + gr.getValue('active') : ''));
            gs.print(hits.slice(0, 8).join('\n'));
        }
    }
}

grep('sys_script_include', ["'processed'", '"processed"'], 'script includes that write/read processed');
gs.print('');
grep('sys_script', ["'processed'", '"processed"'], 'business rules referencing processed');
gs.print('');
grep('sysauto_script', ["'processed'", '"processed"', 'ExpenseAllocator'], 'scheduled jobs');

gs.print('');
gs.print('===== does the COST PLAN actual rollup filter on state? =====');
['ExpenseLineCostPlanUpdater', 'CostPlan', 'ExpenseLinesHelper', 'ExpenseManagementUtils'].forEach(function (n) {
    var gr = new GlideRecord('sys_script_include');
    if (!gr.get('name', n)) return;
    var lines = gr.getValue('script').split('\n');
    var hits = [];
    lines.forEach(function (l, i) {
        if (/state|processed|pending/.test(l) && /addQuery|addEncodedQuery|getValue|setValue/.test(l))
            hits.push('    ' + (i + 1) + ': ' + l.trim().substring(0, 150));
    });
    gs.print('  --- ' + n + ' ---');
    gs.print(hits.length ? hits.slice(0, 12).join('\n') : '    (no state filtering found)');
});

gs.print('');
gs.print('===== the Process Expense Allocation job =====');
var j = new GlideRecord('sysauto_script');
if (j.get('name', 'Process Expense Allocation')) {
    gs.print('  active=' + j.getValue('active') + ' run=' + j.getValue('run_type'));
    gs.print(j.getValue('script').substring(0, 800));
}

gs.print('');
gs.print('===== who currently sits in pending, and why =====');
var a = new GlideAggregate('fm_expense_line');
a.addQuery('state', 'pending');
a.addAggregate('COUNT');
a.groupBy('category');
a.query();
while (a.next()) gs.print('  pending category=' + a.getValue('category') + ' -> ' + a.getAggregate('COUNT'));

var a2 = new GlideAggregate('fm_expense_line');
a2.addQuery('state', 'processed');
a2.addAggregate('COUNT');
a2.groupBy('category');
a2.query();
while (a2.next()) gs.print('  processed category=' + a2.getValue('category') + ' -> ' + a2.getAggregate('COUNT'));
