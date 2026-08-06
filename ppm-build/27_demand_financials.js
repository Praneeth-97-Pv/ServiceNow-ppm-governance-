gs.print('=== do demands carry cost plans / breakdowns? ===');
var a = new GlideAggregate('cost_plan_breakdown');
a.addAggregate('COUNT'); a.groupBy('task.sys_class_name'); a.query();
while(a.next()){ gs.print('  breakdowns on ' + a.getDisplayValue('task.sys_class_name') + ': ' + a.getAggregate('COUNT')); }

gs.print('');
var cp = new GlideAggregate('cost_plan');
cp.addAggregate('COUNT'); cp.groupBy('task.sys_class_name'); cp.query();
while(cp.next()){ gs.print('  cost plans on ' + cp.getDisplayValue('task.sys_class_name') + ': ' + cp.getAggregate('COUNT')); }

gs.print('');
gs.print('=== demands with breakdowns (top 5) ===');
var b = new GlideAggregate('cost_plan_breakdown');
b.addEncodedQuery('task.sys_class_name=dmn_demand');
b.addAggregate('COUNT'); b.groupBy('task'); b.orderByAggregate('COUNT'); b.query();
var n=0;
while(b.next() && n<5){
  var d = new GlideRecord('dmn_demand');
  if(d.get(b.task)){ gs.print('  ' + d.getValue('number') + ' | ' + (d.getValue('short_description')||'').substring(0,30) + ' | n=' + b.getAggregate('COUNT')); }
  n++;
}
if(n===0) gs.print('  none');

gs.print('');
gs.print('=== demand financial fields available as snapshot sources ===');
var g = new GlideRecord('dmn_demand');
['financial_benefit','cost','budget_cost','estimated_cost','work_cost','planned_cost','capex_total','opex_total','demand_currency','close_demand','project','type'].forEach(function(f){
  gs.print('  ' + (g.isValidField(f) ? 'YES ' : 'no  ') + f);
});

gs.print('');
gs.print('=== demand type breakdown (conversion needs type=project) ===');
var t = new GlideAggregate('dmn_demand');
t.addAggregate('COUNT'); t.groupBy('type'); t.query();
while(t.next()){ gs.print('  type=' + t.type + ': ' + t.getAggregate('COUNT')); }

gs.print('');
gs.print('=== demands with portfolio set ===');
var pf = new GlideAggregate('dmn_demand');
pf.addEncodedQuery('portfolioISNOTEMPTY');
pf.addAggregate('COUNT'); pf.groupBy('portfolio'); pf.query();
while(pf.next()){ gs.print('  ' + pf.portfolio.getDisplayValue() + ': ' + pf.getAggregate('COUNT')); }
