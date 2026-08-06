// How is an expense line labelled as LABOR, and how do we scope to PROJECTS only?
// Read-only.

gs.print('===== candidate marker fields on fm_expense_line =====');
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'fm_expense_line');
d.addEncodedQuery('elementLIKEcategory^ORelementLIKEtype^ORelementLIKEsource^ORelementLIKEtask^ORelementLIKEresource^ORelementLIKEcost');
d.orderBy('element');
d.query();
while (d.next())
    gs.print('  ' + d.getValue('element') + ' : ' + d.getValue('internal_type') +
        (d.getValue('reference') ? ' -> ' + d.getValue('reference') : ''));

gs.print('');
gs.print('===== category choices =====');
var c = new GlideRecord('sys_choice');
c.addQuery('name', 'fm_expense_line');
c.addQuery('element', 'category');
c.query();
while (c.next()) gs.print('  ' + c.getValue('value') + ' = ' + c.getValue('label'));

gs.print('');
gs.print('===== who SETS category = labor =====');
['sys_script', 'sys_script_include'].forEach(function (t) {
    var gr = new GlideRecord(t);
    gr.addEncodedQuery('scriptLIKEsetCategory^ORscriptLIKEcategory');
    gr.addQuery('script', 'CONTAINS', 'labor');
    gr.query();
    while (gr.next()) {
        var hits = [];
        gr.getValue('script').split('\n').forEach(function (l, i) {
            if (/category/i.test(l) && /labor/i.test(l))
                hits.push('       ' + (i + 1) + ': ' + l.trim().substring(0, 140));
        });
        if (hits.length) {
            gs.print('  [' + t + '] ' + gr.getValue('name') +
                (gr.isValidField('collection') ? ' on ' + gr.getValue('collection') : '') +
                ' active=' + (gr.isValidField('active') ? gr.getValue('active') : '-'));
            gs.print(hits.slice(0, 6).join('\n'));
        }
    }
});

gs.print('');
gs.print('===== the "Default expense type for labor" rule =====');
var br = new GlideRecord('sys_script');
br.addQuery('collection', 'fm_expense_line');
br.addQuery('name', 'Default expense type for labor');
br.query();
while (br.next()) {
    gs.print('  when=' + br.getValue('when') + ' order=' + br.getValue('order') +
        ' cond=' + br.getValue('condition'));
    gs.print(br.getValue('script').substring(0, 900));
}

gs.print('');
gs.print('===== real data: what markers do actual labor lines carry? =====');
var a = new GlideAggregate('fm_expense_line');
a.addAggregate('COUNT');
a.groupBy('category');
a.query();
while (a.next()) gs.print('  category="' + a.getValue('category') + '" -> ' + a.getAggregate('COUNT'));

gs.print('');
var a2 = new GlideAggregate('fm_expense_line');
a2.addNotNullQuery('time_card');
a2.addAggregate('COUNT');
a2.groupBy('category');
a2.query();
while (a2.next())
    gs.print('  WITH time_card, category="' + a2.getValue('category') + '" -> ' + a2.getAggregate('COUNT'));

gs.print('');
gs.print('===== expense_type / resource_type / cost_type spread on time card lines =====');
['expense_type', 'resource_type', 'cost_type'].forEach(function (f) {
    var g = new GlideRecord('fm_expense_line');
    if (!g.isValidField(f)) { gs.print('  (no field ' + f + ')'); return; }
    var ag = new GlideAggregate('fm_expense_line');
    ag.addNotNullQuery('time_card');
    ag.addAggregate('COUNT');
    ag.groupBy(f);
    ag.query();
    while (ag.next())
        gs.print('  ' + f + '="' + ag.getDisplayValue(f) + '" -> ' + ag.getAggregate('COUNT'));
});

gs.print('');
gs.print('===== PROJECT scoping: what class does task / source_table hold? =====');
var st = new GlideAggregate('fm_expense_line');
st.addNotNullQuery('time_card');
st.addAggregate('COUNT');
st.groupBy('source_table');
st.query();
while (st.next()) gs.print('  source_table="' + st.getValue('source_table') + '" -> ' + st.getAggregate('COUNT'));

gs.print('');
var tc = new GlideRecord('fm_expense_line');
tc.addNotNullQuery('time_card');
tc.setLimit(10);
tc.orderByDesc('sys_created_on');
tc.query();
while (tc.next()) {
    var taskGr = tc.task.getRefRecord();
    gs.print('  task=' + (taskGr.isValidRecord() ? taskGr.getValue('sys_class_name') : '(none)') +
        ' | source_table=' + tc.getValue('source_table') +
        ' | top_task=' + (taskGr.isValidField('top_task') && taskGr.getValue('top_task')
            ? taskGr.top_task.sys_class_name : '-'));
}
