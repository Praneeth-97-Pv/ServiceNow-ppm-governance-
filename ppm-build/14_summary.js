gs.print('=== update set contents ===');
var us = new GlideRecord('sys_update_set');
us.addQuery('name','PPM CR and Gate Replication');
us.query();
if (us.next()) {
  gs.print('  ' + us.getValue('name') + ' | state=' + us.getValue('state') + ' | ' + us.getUniqueValue());
  var a = new GlideAggregate('sys_update_xml');
  a.addQuery('update_set', us.getUniqueValue());
  a.addAggregate('COUNT'); a.groupBy('type'); a.orderByAggregate('COUNT'); a.query();
  var total = 0;
  while(a.next()){
    var n = parseInt(a.getAggregate('COUNT'));
    total += n;
    gs.print('    ' + a.type + ': ' + n);
  }
  gs.print('  TOTAL captured: ' + total);
}

gs.print('');
gs.print('=== artifacts created ===');
function count(table, query, label){
  var g = new GlideAggregate(table);
  if (query) g.addEncodedQuery(query);
  g.addAggregate('COUNT'); g.query(); g.next();
  gs.print('  ' + label + ': ' + g.getAggregate('COUNT'));
}
count('sys_script','collectionINu_pm_gates,project_change_request^active=true','business rules');
count('sys_script_client','tableINu_pm_gates,project_change_request^active=true','client scripts');
count('sys_script_include','nameINGateFinancialsAjax,ApproverMatrixCalculator','script includes');
count('u_approver_matrix','','approver matrix rows');
count('u_pm_gates','','gates');
count('sys_ui_element','sys_ui_section.name=u_pm_gates','gate form elements');

gs.print('');
gs.print('=== business rule order check ===');
var br = new GlideRecord('sys_script');
br.addEncodedQuery('collectionINu_pm_gates,project_change_request^active=true');
br.orderBy('collection'); br.orderBy('order'); br.query();
while(br.next()){
  gs.print('  ' + br.getValue('collection') + ' [' + br.getValue('order') + '] ' + br.getValue('name') +
           ' | ' + br.getValue('when') + ' ins=' + br.getValue('action_insert') + ' upd=' + br.getValue('action_update') +
           (br.getValue('condition') ? ' | has condition' : ''));
}
