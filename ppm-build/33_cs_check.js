gs.print('=== client scripts on our tables ===');
var c = new GlideRecord('sys_script_client');
c.addEncodedQuery('tableINu_pm_gates,project_change_request,dmn_demand');
c.orderBy('table'); c.orderBy('name'); c.query();
var seen = {};
while(c.next()){
  var key = c.getValue('table')+'|'+c.getValue('name')+'|'+c.getValue('type');
  seen[key] = (seen[key]||0)+1;
  gs.print('  ' + c.getValue('table') + ' | ' + c.getValue('name') + ' | type=[' + c.getValue('type') + '] field=[' + c.getValue('field') + '] active=' + c.getValue('active') + ' | ' + c.getUniqueValue());
}
gs.print('');
gs.print('=== duplicates ===');
var dup = 0;
for (var k in seen){ if (seen[k]>1){ gs.print('  DUPLICATE x' + seen[k] + ': ' + k); dup++; } }
if(!dup) gs.print('  none');
