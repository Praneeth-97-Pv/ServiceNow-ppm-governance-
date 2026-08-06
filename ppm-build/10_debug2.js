var p = new GlideRecord('pm_project'); p.get('number','PRJ0010022');
var PID = p.getUniqueValue();

gs.print('=== breakdown_type distribution for this task ===');
var g = new GlideAggregate('cost_plan_breakdown');
g.addQuery('task', PID); g.addAggregate('COUNT'); g.groupBy('breakdown_type'); g.query();
while(g.next()){ gs.print('  [' + g.breakdown_type + '] n=' + g.getAggregate('COUNT')); }

gs.print('');
gs.print('=== every breakdown_type=task row, raw ===');
var q = new GlideRecord('cost_plan_breakdown');
q.addQuery('task', PID); q.addQuery('breakdown_type','task');
q.orderBy('fiscal_period'); q.query();
var n=0, sumA=0, sumE=0;
while(q.next()){
  n++;
  var av = q.getValue('actual'), ev = q.getValue('estimate_to_completion');
  sumA += parseFloat(av||0)||0;
  sumE += parseFloat(ev||0)||0;
  if (n <= 12 || (parseFloat(ev||0)||0) !== 0) {
    gs.print('  ' + n + ') actual=[' + av + '] etc=[' + ev + '] period=' + q.getDisplayValue('fiscal_period'));
  }
}
gs.print('  TOTAL rows=' + n + ' sumActual=' + sumA + ' sumEtc=' + sumE);

gs.print('');
gs.print('=== single-aggregate queries (one per call) ===');
var a1 = new GlideAggregate('cost_plan_breakdown');
a1.addQuery('task', PID); a1.addQuery('breakdown_type','task');
a1.addAggregate('SUM','actual'); a1.query(); a1.next();
gs.print('  SUM(actual) alone = ' + a1.getAggregate('SUM','actual'));

var a2 = new GlideAggregate('cost_plan_breakdown');
a2.addQuery('task', PID); a2.addQuery('breakdown_type','task');
a2.addAggregate('SUM','estimate_to_completion'); a2.query(); a2.next();
gs.print('  SUM(etc) alone    = ' + a2.getAggregate('SUM','estimate_to_completion'));

gs.print('');
gs.print('=== my seeded row ===');
var s = new GlideRecord('cost_plan_breakdown');
s.addQuery('task', PID);
s.addQuery('actual', 75000);
s.query();
while(s.next()){
  gs.print('  sys_id=' + s.getUniqueValue() + ' type=[' + s.getValue('breakdown_type') + ']' +
           ' actual=[' + s.getValue('actual') + '] etc=[' + s.getValue('estimate_to_completion') + ']' +
           ' period=' + s.getDisplayValue('fiscal_period'));
}
