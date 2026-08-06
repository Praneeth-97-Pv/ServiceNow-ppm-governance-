gs.print('=== ALL related lists on dmn_demand (by view) ===');
var rl = new GlideRecord('sys_ui_related_list');
rl.addQuery('name','dmn_demand');
rl.query();
while(rl.next()){
  gs.print('  --- view: ' + (rl.view.getDisplayValue()||'(default)') + ' ---');
  var e = new GlideRecord('sys_ui_related_list_entry');
  e.addQuery('list_id', rl.getUniqueValue());
  e.orderBy('position'); e.query();
  while(e.next()){
    gs.print('    ' + e.getValue('position') + '. ' + e.getValue('related_list') +
             '   created=' + (e.getValue('sys_created_on')||'').substring(0,10) +
             ' by=' + e.getValue('sys_created_by'));
  }
}

gs.print('');
gs.print('=== OOB Approve / Reject UI actions on dmn_demand ===');
var ua = new GlideRecord('sys_ui_action');
ua.addQuery('table','dmn_demand');
ua.addEncodedQuery('nameINApprove,Reject,Submit demand,Screen,Qualify');
ua.query();
while(ua.next()){
  gs.print('  --- ' + ua.getValue('name') + ' (action=' + ua.getValue('action_name') + ') ---');
  gs.print('    condition: ' + (ua.getValue('condition')||''));
  gs.print('    script: ' + (ua.getValue('script')||'').substring(0,400));
}

gs.print('');
gs.print('=== is there an approval workflow/flow attached to demands? ===');
var wf = new GlideRecord('wf_workflow');
wf.addEncodedQuery('table=dmn_demand^ORnameLIKEdemand');
wf.query();
gs.print('  workflows: ' + wf.getRowCount());
while(wf.next()){ gs.print('    ' + wf.getValue('name') + ' | table=' + wf.getValue('table') + ' | published=' + wf.getValue('published')); }

gs.print('');
gs.print('=== approval-related tables referencing demand ===');
['sysapproval_approver','sysapproval_group','dmn_demand_approver','sn_dmn_approver'].forEach(function(t){
  var g = new GlideRecord(t);
  if(!g.isValid()){ gs.print('  MISS ' + t); return; }
  var a = new GlideAggregate(t);
  a.addAggregate('COUNT'); a.query(); a.next();
  gs.print('  OK   ' + t + ' total rows=' + a.getAggregate('COUNT'));
});
