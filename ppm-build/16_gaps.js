function has(table, query, label){
  var g = new GlideRecord(table);
  g.addEncodedQuery(query);
  g.query();
  gs.print('  ' + (g.hasNext() ? 'YES ' : 'NO  ') + label + '  (' + g.getRowCount() + ')');
  return g.getRowCount();
}

gs.print('=== Can a user reach Gates at all? ===');
has('sys_app_application', 'titleLIKEgate', 'application menu for Gates');
has('sys_app_module', 'titleLIKEgate^ORname=u_pm_gates', 'nav module for u_pm_gates');

gs.print('');
gs.print('=== Can a Gate be created FROM a project? (guide 8.1) ===');
var rl = new GlideRecord('sys_ui_related_list');
rl.addQuery('name','pm_project');
rl.query();
gs.print('  pm_project related-list records: ' + rl.getRowCount());
while(rl.next()){
  var e = new GlideRecord('sys_ui_related_list_entry');
  e.addQuery('list_id', rl.getUniqueValue());
  e.addEncodedQuery('related_listLIKEu_pm_gates');
  e.query();
  gs.print('    view=' + rl.view.getDisplayValue() + ' has gates entry: ' + e.hasNext());
}

gs.print('');
gs.print('=== Numbering ===');
has('sys_number', 'category=u_pm_gates', 'auto-number for u_pm_gates');
var g = new GlideRecord('u_pm_gates');
g.query();
while(g.next()){ gs.print('    existing gate u_number=[' + g.getValue('u_number') + ']'); }

gs.print('');
gs.print('=== Security ===');
has('sys_security_acl', 'nameSTARTSWITHu_pm_gates', 'ACLs on u_pm_gates');
has('sys_security_acl', 'nameSTARTSWITHu_approver_matrix', 'ACLs on u_approver_matrix');

gs.print('');
gs.print('=== Does anything CREATE the P0..P3 gate set? ===');
has('sys_script', 'collection=pm_project^scriptLIKEu_pm_gates', 'BR on pm_project creating gates');
has('sys_ui_action', 'table=u_pm_gates', 'UI actions on u_pm_gates');
