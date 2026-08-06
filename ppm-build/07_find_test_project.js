gs.print('=== projects with NON-ZERO task breakdowns ===');
var a = new GlideAggregate('cost_plan_breakdown');
a.addQuery('breakdown_type','task');
a.addEncodedQuery('actual!=0^ORestimate_to_completion!=0');
a.addAggregate('COUNT');
a.addAggregate('SUM','actual');
a.addAggregate('SUM','estimate_to_completion');
a.groupBy('task');
a.orderByAggregate('COUNT');
a.query();
var shown = 0;
while (a.next() && shown < 8) {
  var p = new GlideRecord('pm_project');
  if (!p.get(a.task)) { continue; }
  gs.print('  ' + p.getValue('number') + ' | ' + (p.getValue('short_description')||'').substring(0,30) +
           ' | phase=' + p.getValue('phase') +
           ' | portfolio=' + (p.primary_portfolio.getDisplayValue()||'NONE') +
           ' | n=' + a.getAggregate('COUNT') +
           ' actual=' + a.getAggregate('SUM','actual') +
           ' etc=' + a.getAggregate('SUM','estimate_to_completion'));
  shown++;
}
if (shown === 0) { gs.print('  none - all breakdowns are zero'); }

gs.print('');
gs.print('=== fiscal-year-scoped check on one project ===');
var b = new GlideRecord('cost_plan_breakdown');
b.addQuery('breakdown_type','task');
b.addEncodedQuery('actual!=0');
b.setLimit(3); b.query();
while (b.next()) {
  gs.print('  task=' + b.getDisplayValue('task') + ' actual=' + b.getValue('actual') +
           ' etc=' + b.getValue('estimate_to_completion') +
           ' period=' + b.getDisplayValue('fiscal_period') + ' fy=' + b.fiscal_period.fiscal_year);
}

gs.print('');
gs.print('=== candidate approver users ===');
var u = new GlideRecord('sys_user');
u.addEncodedQuery('active=true^emailISNOTEMPTY^user_nameINabel.tuter,beth.anglin,david.loo,fred.luddy,bud.richman');
u.query();
while (u.next()) { gs.print('  ' + u.getValue('user_name') + ' | ' + u.getValue('name') + ' | ' + u.getUniqueValue()); }
