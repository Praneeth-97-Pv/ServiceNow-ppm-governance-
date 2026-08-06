gs.print('=== breakdown_type values on DEMAND breakdowns ===');
var a = new GlideAggregate('cost_plan_breakdown');
a.addEncodedQuery('task.sys_class_name=dmn_demand');
a.addAggregate('COUNT'); a.groupBy('breakdown_type'); a.query();
while(a.next()){ gs.print('  [' + a.breakdown_type + ']: ' + a.getAggregate('COUNT')); }

gs.print('');
gs.print('=== sample demand with money, summed the guide way ===');
var d = new GlideRecord('dmn_demand');
d.get('number','DMND0001172');
gs.print('  ' + d.getValue('number') + ' | portfolio=' + d.portfolio.getDisplayValue() + ' | type=' + d.getValue('type') + ' | state=' + d.getValue('state'));
var out = {actual:0, etc:0}, n=0;
var b = new GlideRecord('cost_plan_breakdown');
b.addQuery('task', d.getUniqueValue());
b.addQuery('breakdown_type','task');
b.query();
while(b.next()){ n++; out.actual += parseFloat(b.getValue('actual')||0)||0; out.etc += parseFloat(b.getValue('estimate_to_completion')||0)||0; }
gs.print('  breakdown_type=task rows: ' + n + ' actual=' + out.actual + ' etc=' + out.etc);

var out2 = {actual:0}, n2=0;
var b2 = new GlideRecord('cost_plan_breakdown');
b2.addQuery('task', d.getUniqueValue());
b2.query();
while(b2.next()){ n2++; out2.actual += parseFloat(b2.getValue('actual')||0)||0; }
gs.print('  ALL rows:              ' + n2 + ' actual=' + out2.actual);

gs.print('');
gs.print('=== top demands by summed actual (type=project, portfolio set) ===');
var q = new GlideRecord('dmn_demand');
q.addEncodedQuery('type=project^portfolioISNOTEMPTY');
q.query();
var best = [];
while(q.next()){
  var s=0, c=0;
  var bb = new GlideRecord('cost_plan_breakdown');
  bb.addQuery('task', q.getUniqueValue()); bb.addQuery('breakdown_type','task'); bb.query();
  while(bb.next()){ c++; s += parseFloat(bb.getValue('actual')||0)||0; }
  if (s > 0) best.push({num:q.getValue('number'), sd:(q.getValue('short_description')||'').substring(0,28), sum:s, n:c, pf:q.portfolio.getDisplayValue(), st:q.getValue('state'), proj:q.getValue('project')});
}
best.sort(function(x,y){return y.sum-x.sum;});
for (var i=0;i<Math.min(6,best.length);i++){
  var r=best[i];
  gs.print('  ' + r.num + ' | ' + r.sd + ' | actual=' + r.sum + ' n=' + r.n + ' | ' + r.pf + ' | state=' + r.st + ' | project=' + (r.proj||'none'));
}
if(!best.length) gs.print('  none with non-zero actual');
