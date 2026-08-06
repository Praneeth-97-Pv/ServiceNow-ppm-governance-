gs.print('=== cost_plan_breakdown field types ===');
var d = new GlideRecord('sys_dictionary');
d.addQuery('name','cost_plan_breakdown');
d.addEncodedQuery('elementINactual,estimate_to_completion,planned_cost,budget_cost,fiscal_period,breakdown_type,task');
d.query();
while(d.next()){
  gs.print('  ' + d.getValue('element') + ' : ' + d.getValue('internal_type') + ' (ref=' + (d.getValue('reference')||'-') + ')');
}

gs.print('');
gs.print('=== raw getValue on real rows (PRJ0010022) ===');
var p = new GlideRecord('pm_project'); p.get('number','PRJ0010022');
var b = new GlideRecord('cost_plan_breakdown');
b.addQuery('task', p.getUniqueValue());
b.addQuery('breakdown_type','task');
b.addEncodedQuery('actual!=0^ORestimate_to_completion!=0');
b.setLimit(4); b.query();
while(b.next()){
  gs.print('  actual getValue=[' + b.getValue('actual') + '] parseFloat=' + parseFloat(b.getValue('actual')));
  gs.print('  etc    getValue=[' + b.getValue('estimate_to_completion') + '] parseFloat=' + parseFloat(b.getValue('estimate_to_completion')));
  gs.print('  ---');
}

gs.print('');
gs.print('=== what the guide sum produces vs GlideAggregate ===');
var out = {actual:0, etc:0};
var q = new GlideRecord('cost_plan_breakdown');
q.addQuery('task', p.getUniqueValue());
q.addQuery('breakdown_type','task');
q.query();
while(q.next()){
  out.actual += parseFloat(q.getValue('actual') || 0) || 0;
  out.etc    += parseFloat(q.getValue('estimate_to_completion') || 0) || 0;
}
gs.print('  guide logic  -> actual=' + out.actual + ' etc=' + out.etc);
var a = new GlideAggregate('cost_plan_breakdown');
a.addQuery('task', p.getUniqueValue()); a.addQuery('breakdown_type','task');
a.addAggregate('SUM','actual'); a.addAggregate('SUM','estimate_to_completion'); a.query(); a.next();
gs.print('  GlideAggregate-> actual=' + a.getAggregate('SUM','actual') + ' etc=' + a.getAggregate('SUM','estimate_to_completion'));
