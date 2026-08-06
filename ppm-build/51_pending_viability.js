// Is "keep labor expense lines pending" viable?
//   A. What actually flips a TIME CARD labor line to processed?
//   B. Does the COST PLAN actual rollup ignore state (i.e. would pending still count)?
// Read-only.

gs.print('===== A. does ExpenseAllocator.processRules() set state=processed? =====');
var ea = new GlideRecord('sys_script_include');
ea.get('name', 'ExpenseAllocator');
var s = ea.getValue('script');
s.split('\n').forEach(function (l, i) {
    if (/state|processed|pending|processRules\s*:/.test(l))
        gs.print('  ' + (i + 1) + ': ' + l.trim().substring(0, 160));
});

gs.print('');
gs.print('===== real labor expense lines: do the processed ones come from time cards? =====');
var e = new GlideRecord('fm_expense_line');
e.addQuery('category', 'labor');
e.orderByDesc('sys_created_on');
e.setLimit(12);
e.query();
while (e.next())
    gs.print('  ' + e.getValue('state') + ' | amount=' + e.getValue('amount') +
        ' | time_card=' + (e.getValue('time_card') ? 'YES' : 'no') +
        ' | cost_plan=' + (e.getValue('cost_plan') ? 'YES' : 'no') +
        ' | created=' + e.getValue('sys_created_on') +
        ' | ' + e.getValue('short_description').substring(0, 45));

gs.print('');
gs.print('===== B. ExpenseLineCostPlanUpdater -- does it filter state? =====');
var cu = new GlideRecord('sys_script_include');
cu.get('name', 'ExpenseLineCostPlanUpdater');
gs.print(cu.getValue('script').substring(0, 2200));

gs.print('');
gs.print('===== what triggers ExpenseLineCostPlanUpdater? =====');
['sys_script', 'sysauto_script'].forEach(function (t) {
    var gr = new GlideRecord(t);
    gr.addQuery('script', 'CONTAINS', 'ExpenseLineCostPlanUpdater');
    gr.query();
    while (gr.next())
        gs.print('  [' + t + '] ' + gr.getValue('name') +
            (gr.isValidField('collection') ? ' on ' + gr.getValue('collection') : '') +
            ' active=' + gr.getValue('active') +
            (gr.isValidField('when') ? ' when=' + gr.getValue('when') : ''));
});
