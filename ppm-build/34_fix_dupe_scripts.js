gs.print('=== name field max_length ===');
var d = new GlideRecord('sys_dictionary');
d.addEncodedQuery('nameINsys_script,sys_script_client^element=name');
d.query();
while(d.next()){ gs.print('  ' + d.getValue('name') + '.name max_length=' + d.getValue('max_length')); }

gs.print('');
gs.print('=== our record names vs 40 chars ===');
['sys_script','sys_script_client'].forEach(function(t){
  var g = new GlideRecord(t);
  if (t === 'sys_script') g.addEncodedQuery('collectionINu_pm_gates,project_change_request,dmn_demand,sysapproval_approver^nameSTARTSWITHM0^ORnameSTARTSWITHGate^ORnameSTARTSWITHCR^ORnameSTARTSWITHGenerate^ORnameSTARTSWITHApproval^ORnameSTARTSWITHSnapshot^ORnameSTARTSWITHClose');
  else g.addEncodedQuery('tableINu_pm_gates,project_change_request,dmn_demand^nameSTARTSWITHM0^ORnameSTARTSWITHGate^ORnameSTARTSWITHCR');
  g.query();
  while(g.next()){
    var n = g.getValue('name')+'';
    gs.print('  [' + n.length + '] ' + t + ': ' + n + (n.length >= 40 ? '   <-- AT LIMIT' : ''));
  }
});

gs.print('');
gs.print('=== deleting duplicate client scripts (keep oldest) ===');
var groups = {};
var c = new GlideRecord('sys_script_client');
c.addEncodedQuery('tableINu_pm_gates,project_change_request,dmn_demand^nameSTARTSWITHGate - Populate^ORnameSTARTSWITHCR - Populate^ORnameSTARTSWITHM0 - Populate');
c.orderBy('sys_created_on');
c.query();
while(c.next()){
  var key = c.getValue('table')+'|'+c.getValue('name')+'|'+c.getValue('type');
  if(!groups[key]){ groups[key] = c.getUniqueValue(); gs.print('  KEEP   ' + key + ' -> ' + c.getUniqueValue()); }
  else { gs.print('  DELETE ' + key + ' -> ' + c.getUniqueValue()); c.deleteRecord(); }
}
