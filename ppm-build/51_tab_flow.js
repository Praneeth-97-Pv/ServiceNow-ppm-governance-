var PASS=0, FAIL=0;
function check(l,c,d){ if(c){PASS++;gs.print('  PASS  '+l+(d?'  ['+d+']':''));} else {FAIL++;gs.print('  FAIL  '+l+(d?'  ['+d+']':''));} }

gs.print('===== the Approvers tab IS the mechanism: full flow on an active demand =====');
var d = new GlideRecord('dmn_demand');
d.get('number','DMND0001101');
gs.print('  ' + d.getValue('number') + ' active=' + d.getValue('active') + ' state=' + d.getValue('state') +
         ' project=' + (d.getValue('project')||'none'));

// button now does exactly this
d.approval = 'requested';
d.update();

gs.print('');
gs.print('  --- what the Approvers tab shows (sysapproval_approver.sysapproval) ---');
var rows=[];
var a = new GlideRecord('sysapproval_approver');
a.addQuery('sysapproval', d.getUniqueValue());
a.orderBy('sys_created_on');
a.query();
while(a.next()){
  rows.push(a.getUniqueValue());
  gs.print('    ' + a.approver.getDisplayValue() + '  |  state=' + a.getValue('state') +
           '  |  source_table=' + a.getValue('source_table'));
}
check('Approvers tab is populated by the matrix', rows.length===2, rows.length+' rows');
check('Rows are joined by sysapproval (what the tab filters on)', rows.length>0, 'sysapproval=' + d.getUniqueValue());

gs.print('');
gs.print('  --- approving FROM the tab drives everything ---');
var first = new GlideRecord('sysapproval_approver');
first.get(rows[0]);
first.state = 'approved';
first.update();
var mid = new GlideRecord('dmn_demand'); mid.get(d.getUniqueValue());
check('Still requested after only one approval', (mid.getValue('approval')+'')==='requested', mid.getValue('approval'));

var second = new GlideRecord('sysapproval_approver');
second.get(rows[1]);
second.state = 'approved';
second.update();

var fin = new GlideRecord('dmn_demand'); fin.get(d.getUniqueValue());
check('Rollup fires when the last tab row is approved', (fin.getValue('approval')+'')==='approved', fin.getValue('approval'));
check('M0 closed', (fin.getValue('u_m0_state')+'')==='closed', fin.getValue('u_m0_state'));
check('Demand converted to a project', !!fin.getValue('project'), 'project=' + (fin.getValue('project')||'none'));
if (fin.getValue('project')){
  var p = new GlideRecord('pm_project');
  if(p.get(fin.getValue('project'))) gs.print('    -> ' + p.getValue('number') + ' | ' + (p.getValue('short_description')||'').substring(0,40));
}

gs.print('');
gs.print('===== no-match feedback (matrix miss now reports instead of silently doing nothing) =====');
var d2 = new GlideRecord('dmn_demand');
d2.addEncodedQuery('type=project^projectISEMPTY^active=true^portfolioISNOTEMPTY^numberNOT LIKEDMND0001101');
d2.setLimit(1); d2.query();
if(d2.next()){
  d2.u_project_type = 'compliance';   // no matrix rows for this combination
  d2.setWorkflow(false); d2.update();
  var d3 = new GlideRecord('dmn_demand'); d3.get(d2.getUniqueValue());
  d3.approval='requested'; d3.update();
  var cnt = new GlideAggregate('sysapproval_approver');
  cnt.addQuery('sysapproval', d2.getUniqueValue()); cnt.addAggregate('COUNT'); cnt.query(); cnt.next();
  gs.print('  ' + d2.getValue('number') + ' with unmatched project type -> approvers=' + cnt.getAggregate('COUNT'));
  check('Matrix miss produces zero approvers and an error message', parseInt(cnt.getAggregate('COUNT'))===0, 'see error above');
  var rst=new GlideRecord('dmn_demand'); rst.get(d2.getUniqueValue());
  rst.approval='not requested'; rst.u_project_type=''; rst.setWorkflow(false); rst.update();
}

gs.print('');
gs.print('===== button config =====');
var ua=new GlideRecord('sys_ui_action');
ua.addEncodedQuery('tableINu_pm_gates,project_change_request,dmn_demand^nameLIKERequest^nameNOT LIKEPurchase');
ua.query();
while(ua.next()){
  gs.print('  ' + ua.getValue('table') + ' / ' + ua.getValue('name') + ' -> script: ' +
           (ua.getValue('script')||'').replace(/\n/g,' ').trim());
}

gs.print('');
gs.print('  PASS: '+PASS+'   FAIL: '+FAIL);
