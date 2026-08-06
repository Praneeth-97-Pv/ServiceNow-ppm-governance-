gs.print('=== is the approval field ON the form? ===');
[['u_pm_gates','u_approval'],['project_change_request','approval'],['dmn_demand','approval']].forEach(function(pair){
  var t=pair[0], f=pair[1];
  var found=[];
  var s=new GlideRecord('sys_ui_section');
  s.addQuery('name',t); s.query();
  while(s.next()){
    var e=new GlideRecord('sys_ui_element');
    e.addQuery('sys_ui_section',s.getUniqueValue()); e.addQuery('element',f); e.query();
    if(e.next()) found.push('['+(s.getValue('caption')||'(none)')+'] view='+s.view.getDisplayValue()+' pos='+e.getValue('position'));
  }
  gs.print('  ' + t + '.' + f + ': ' + (found.length ? found.join(' | ') : '*** NOT ON ANY FORM ***'));
});

gs.print('');
gs.print('=== is it read-only / dictionary-locked? ===');
[['u_pm_gates','u_approval'],['dmn_demand','approval']].forEach(function(pair){
  var d=new GlideRecord('sys_dictionary');
  d.addQuery('name',pair[0]); d.addQuery('element',pair[1]); d.query();
  if(d.next()) gs.print('  ' + pair[0]+'.'+pair[1] + ' read_only=' + d.getValue('read_only') + ' (own dictionary row)');
  else gs.print('  ' + pair[0]+'.'+pair[1] + ' inherited from parent table');
});

gs.print('');
gs.print('=== UI actions we own ===');
var ua=new GlideRecord('sys_ui_action');
ua.addEncodedQuery('tableINu_pm_gates,project_change_request,dmn_demand^nameLIKEapprov^ORnameLIKErequest^ORnameLIKEM0^ORnameLIKEgate');
ua.query();
gs.print('  matching UI actions: ' + ua.getRowCount());
while(ua.next()){ gs.print('    ' + ua.getValue('table') + ' | ' + ua.getValue('name') + ' | form_button=' + ua.getValue('form_button')); }

gs.print('');
gs.print('=== approval choices available on each ===');
[['u_pm_gates','u_approval'],['dmn_demand','approval'],['project_change_request','approval']].forEach(function(pair){
  var c=new GlideRecord('sys_choice');
  c.addQuery('name',pair[0]); c.addQuery('element',pair[1]); c.orderBy('sequence'); c.query();
  var v=[];
  while(c.next()){ v.push(c.getValue('value')); }
  if(!v.length){
    var c2=new GlideRecord('sys_choice');
    c2.addQuery('name','task'); c2.addQuery('element','approval'); c2.orderBy('sequence'); c2.query();
    while(c2.next()){ v.push(c2.getValue('value')); }
    gs.print('  ' + pair[0]+'.'+pair[1] + ' (inherited from task): ' + v.join(', '));
  } else {
    gs.print('  ' + pair[0]+'.'+pair[1] + ': ' + v.join(', '));
  }
});
