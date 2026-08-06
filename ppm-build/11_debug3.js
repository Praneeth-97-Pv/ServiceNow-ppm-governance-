gs.print('=== dictionary attributes ===');
var d = new GlideRecord('sys_dictionary');
d.addQuery('name','cost_plan_breakdown');
d.addEncodedQuery('elementINactual,estimate_to_completion');
d.query();
while(d.next()){
  gs.print('  ' + d.getValue('element') + ':');
  gs.print('    type=' + d.getValue('internal_type') + ' read_only=' + d.getValue('read_only') +
           ' virtual=' + d.getValue('virtual') + ' function_field=' + d.getValue('function_field'));
  gs.print('    attributes=[' + (d.getValue('attributes')||'') + ']');
  gs.print('    calculation=[' + ((d.getValue('calculation')||'').substring(0,120)) + ']');
}

gs.print('');
gs.print('=== ANY row in whole table with non-zero etc (via getValue) ===');
var q = new GlideRecord('cost_plan_breakdown');
q.addQuery('estimate_to_completion','!=',0);
q.setLimit(5); q.query();
gs.print('  rows matching etc!=0 : ' + q.getRowCount());
while(q.next()){
  gs.print('   task=' + q.getDisplayValue('task') + ' type=' + q.getValue('breakdown_type') +
           ' etc getValue=[' + q.getValue('estimate_to_completion') + ']');
}

gs.print('');
gs.print('=== can etc be written at all? ===');
var t = new GlideRecord('cost_plan_breakdown');
t.addQuery('estimate_to_completion', 0);
t.setLimit(1); t.query();
if (t.next()) {
  var id = t.getUniqueValue();
  t.estimate_to_completion = 999;
  t.setWorkflow(false);
  t.update();
  var re = new GlideRecord('cost_plan_breakdown');
  re.get(id);
  gs.print('  wrote 999 -> reads back [' + re.getValue('estimate_to_completion') + ']');
  // revert
  re.estimate_to_completion = 0; re.setWorkflow(false); re.update();
  gs.print('  reverted');
}

gs.print('');
gs.print('=== cost_plan (parent) fields available ===');
var cp = new GlideRecord('sys_dictionary');
cp.addQuery('name','cost_plan');
cp.addEncodedQuery('elementLIKEcost^ORelementLIKEestimate^ORelementLIKEactual^ORelementLIKEbudget');
cp.query();
var f=[];
while(cp.next()){ f.push(cp.getValue('element')+':'+cp.getValue('internal_type')); }
gs.print('  ' + f.join(', '));
