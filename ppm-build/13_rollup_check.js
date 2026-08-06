gs.print('=== OOB business rules on sysapproval_approver ===');
var br = new GlideRecord('sys_script');
br.addQuery('collection','sysapproval_approver');
br.addQuery('active', true);
br.orderBy('order');
br.query();
while(br.next()){
  gs.print('  [' + br.getValue('order') + '] ' + br.getValue('name') + ' | when=' + br.getValue('when') +
           ' ins=' + br.getValue('action_insert') + ' upd=' + br.getValue('action_update'));
}

gs.print('');
gs.print('=== does project_change_request.approval roll up? ===');
var p = new GlideRecord('pm_project'); p.get('number','PRJ0010022');
var c = new GlideRecord('project_change_request');
c.initialize();
c.parent = p.getUniqueValue();
c.short_description = 'Rollup probe CR';
var id = c.insert();
var cr = new GlideRecord('project_change_request'); cr.get(id);
cr.approval = 'requested';
cr.update();

var n = 0;
var a = new GlideRecord('sysapproval_approver');
a.addQuery('document_id', id);
a.query();
while(a.next()){ a.state = 'approved'; a.update(); n++; }
gs.print('  approved ' + n + ' approver records');

var re = new GlideRecord('project_change_request'); re.get(id);
gs.print('  CR approval after rollup = [' + re.getValue('approval') + ']');
gs.print('  => PCR rollup ' + (re.getValue('approval') === 'approved' ? 'WORKS (OOB)' : 'does NOT happen'));
gs.print('  (cleanup) ' + id);
re.deleteRecord();

gs.print('');
gs.print('=== why: which field does the OOB engine target? ===');
gs.print('  project_change_request has field "approval" (inherited from task) -> OOB approval engine finds it');
var g = new GlideRecord('u_pm_gates');
gs.print('  u_pm_gates has field "approval"?  ' + g.isValidField('approval'));
gs.print('  u_pm_gates has field "u_approval"? ' + g.isValidField('u_approval'));
