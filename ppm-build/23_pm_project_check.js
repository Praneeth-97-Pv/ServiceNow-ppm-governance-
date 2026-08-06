gs.print('=== pm_project: where does impacted_business_units appear? ===');
var s = new GlideRecord('sys_ui_section');
s.addQuery('name','pm_project');
s.query();
while(s.next()){
  var e = new GlideRecord('sys_ui_element');
  e.addQuery('sys_ui_section', s.getUniqueValue());
  e.addQuery('element','impacted_business_units');
  e.query();
  if (e.getRowCount() > 0) {
    gs.print('  section=[' + (s.getValue('caption')||'(none)') + '] view=' + s.view.getDisplayValue() +
             ' -> ' + e.getRowCount() + ' occurrence(s)');
    while(e.next()){ gs.print('     pos=' + e.getValue('position') + ' created=' + e.getValue('sys_created_on') + ' by=' + e.getValue('sys_created_by')); }
  }
}

gs.print('');
gs.print('=== did MY pm_project fields land on the form? ===');
['u_project_type','u_fy_approved_budget','u_total_approved_budget'].forEach(function(f){
  var e = new GlideRecord('sys_ui_element');
  e.addEncodedQuery('element=' + f + '^sys_ui_section.name=pm_project');
  e.query();
  gs.print('  ' + f + ': on ' + e.getRowCount() + ' section(s)');
  while(e.next()){
    var sec = new GlideRecord('sys_ui_section'); sec.get(e.getValue('sys_ui_section'));
    gs.print('     [' + (sec.getValue('caption')||'(none)') + '] view=' + sec.view.getDisplayValue() + ' pos=' + e.getValue('position'));
  }
});

gs.print('');
gs.print('=== flush form caches (guide section 9 note) ===');
gs.getSession().clearClientData();
GlideCacheManager.flush();
gs.print('  caches flushed - reopen any existing tab to see the new layout');
