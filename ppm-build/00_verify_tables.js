['u_approver_matrix','u_pm_gates'].forEach(function(t){
  var g = new GlideRecord(t);
  gs.print('=== ' + t + ' valid=' + g.isValid() + ' ===');
  var d = new GlideRecord('sys_dictionary');
  d.addQuery('name', t); d.addQuery('elementISNOTEMPTY'); d.orderBy('element'); d.query();
  var out = [];
  while (d.next()) { out.push(d.getValue('element') + ':' + d.getValue('internal_type')); }
  gs.print('  ' + out.length + ' fields: ' + out.join(', '));
  var c = new GlideAggregate('sys_choice');
  c.addQuery('name', t); c.addAggregate('COUNT','element'); c.groupBy('element'); c.query();
  while (c.next()) { gs.print('  choices ' + c.element + ' = ' + c.getAggregate('COUNT','element')); }
});
