var PASS=0, FAIL=0;
function check(l,c,d){ if(c){PASS++;gs.print('  PASS  '+l+(d?'  ['+d+']':''));} else {FAIL++;gs.print('  FAIL  '+l+(d?'  ['+d+']':''));} }

var p = new GlideRecord('pm_project');
p.get('number','PRJ0010022');
var PID = p.getUniqueValue();

gs.print('===== Auto-numbering =====');
var g1 = new GlideRecord('u_pm_gates');
g1.initialize(); g1.u_parent = PID; g1.u_title = 'Process test gate A';
var id1 = g1.insert();
var r1 = new GlideRecord('u_pm_gates'); r1.get(id1);
gs.print('  gate A number = ' + r1.getValue('u_number'));
check('Auto-number assigned', /^GATE\d{7}$/.test(r1.getValue('u_number')+''), r1.getValue('u_number'));

var g2 = new GlideRecord('u_pm_gates');
g2.initialize(); g2.u_parent = PID; g2.u_title = 'Process test gate B';
var id2 = g2.insert();
var r2 = new GlideRecord('u_pm_gates'); r2.get(id2);
gs.print('  gate B number = ' + r2.getValue('u_number'));
check('Numbers increment', r1.getValue('u_number') !== r2.getValue('u_number'),
      r1.getValue('u_number') + ' -> ' + r2.getValue('u_number'));
check('Numbering did not break snapshots', r1.getValue('u_fy_approved_budget') != '' && r1.getValue('u_phase')=='initiating',
      'budget=' + r1.getValue('u_fy_approved_budget') + ' phase=' + r1.getValue('u_phase'));

gs.print('');
gs.print('===== Gates visible as related list of the project =====');
var rel = new GlideRecord('u_pm_gates');
rel.addQuery('u_parent', PID);
rel.query();
gs.print('  gates on ' + p.getValue('number') + ': ' + rel.getRowCount());
check('Project has gates reachable via u_parent', rel.getRowCount() >= 3, rel.getRowCount() + ' gates');

gs.print('');
gs.print('===== Gate type -> phase mapping across all types =====');
var map = {p0:'initiating', p1:'planning', p2a:'executing', p2b:'closing', p3:'closing'};
for (var gt in map) {
  var t = new GlideRecord('u_pm_gates');
  t.initialize(); t.u_parent = PID; t.u_gate_type = gt; t.u_title = 'maptest ' + gt;
  var tid = t.insert();
  var tr = new GlideRecord('u_pm_gates'); tr.get(tid);
  check('gate_type ' + gt + ' -> phase ' + map[gt], tr.getValue('u_phase') === map[gt],
        'got ' + tr.getValue('u_phase') + ' num=' + tr.getValue('u_number'));
  tr.deleteRecord();
}

gs.print('');
gs.print('===== Full lifecycle on gate A =====');
var a = new GlideRecord('u_pm_gates'); a.get(id1);
a.u_approval = 'requested'; a.update();
var a2 = new GlideRecord('u_pm_gates'); a2.get(id1);
check('Approval requested holds', a2.getValue('u_approval')==='requested', a2.getValue('u_approval'));
var ap = new GlideAggregate('sysapproval_approver');
ap.addQuery('document_id', id1); ap.addAggregate('COUNT'); ap.query(); ap.next();
check('Approvers generated', parseInt(ap.getAggregate('COUNT'))===2, ap.getAggregate('COUNT')+' approvers');
a2.u_approval = 'approved'; a2.update();
var a3 = new GlideRecord('u_pm_gates'); a3.get(id1);
check('Gate closed on approval', a3.getValue('u_state')==='closed', a3.getValue('u_state'));

gs.print('');
gs.print('===== ACL sanity (admin_overrides) =====');
var ac = new GlideRecord('sys_security_acl');
ac.addEncodedQuery('nameINu_pm_gates,u_approver_matrix^type=record');
ac.query();
var allOverride = true;
while(ac.next()){ if(ac.getValue('admin_overrides')!='1') allOverride=false; }
check('All new ACLs have admin_overrides', allOverride, ac.getRowCount()+' ACLs');
var probe = new GlideRecord('u_pm_gates'); probe.query();
check('Admin can still read gates', probe.getRowCount() > 0, probe.getRowCount()+' readable');

gs.print('');
gs.print('cleanup: removing process test gates');
[id1,id2].forEach(function(i){ var d=new GlideRecord('u_pm_gates'); if(d.get(i)) d.deleteRecord(); });

gs.print('');
gs.print('  PASS: '+PASS+'   FAIL: '+FAIL);
