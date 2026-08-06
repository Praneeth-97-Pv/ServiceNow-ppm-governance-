var PASS=0, FAIL=0;
function check(l,c,d){ if(c){PASS++;gs.print('  PASS  '+l+(d?'  ['+d+']':''));} else {FAIL++;gs.print('  FAIL  '+l+(d?'  ['+d+']':''));} }

gs.print('===== ACTIVE demand: full button flow =====');
var d = new GlideRecord('dmn_demand');
d.get('number','DMND0001101');
d.u_project_type='strategic';
d.portfolio='188fc541535513004e77ddeeff7b1201';
d.setWorkflow(false); d.update();
gs.print('  ' + d.getValue('number') + ' state=' + d.getValue('state') + ' active=' + d.getValue('active') +
         ' portfolio=' + d.portfolio.getDisplayValue());

// what the button previews
var preview = new GateFinancialsAjax();
gs.print('  preview would show: (matrix lookup) ' +
         JSON.stringify(new ApproverMatrixCalculator().getFinalApproversForDemand(d.getUniqueValue()).length) + ' approver(s)');

// what the button does on confirm
var r = new GlideRecord('dmn_demand'); r.get(d.getUniqueValue());
r.approval = 'requested';
r.update();

var after = new GlideRecord('dmn_demand'); after.get(d.getUniqueValue());
check('Approval held at requested', (after.getValue('approval')+'')==='requested', after.getValue('approval'));

var states=[];
var a = new GlideRecord('sysapproval_approver');
a.addQuery('document_id', d.getUniqueValue()); a.addQuery('source_table','dmn_demand'); a.query();
while(a.next()){ states.push(a.approver.getDisplayValue()+'/'+a.getValue('state')); }
gs.print('  approvers: ' + states.join(', '));
check('Approvers created', states.length===2, states.length+'');
check('Approvers stay REQUESTED on an active demand',
      states.join(',').indexOf('not_required')===-1, states.join(', '));

gs.print('');
gs.print('===== INACTIVE demand: new guard blocks it =====');
var bad = new GlideRecord('dmn_demand');
bad.get('number','DMND0001141');
gs.print('  ' + bad.getValue('number') + ' active=' + bad.getValue('active') + ' state=' + bad.getValue('state'));
bad.approval='requested';
bad.update();
var badRe = new GlideRecord('dmn_demand'); badRe.get(bad.getUniqueValue());
check('Closed demand blocked from M0 approval', (badRe.getValue('approval')+'')!=='requested',
      'approval='+badRe.getValue('approval'));

gs.print('');
gs.print('===== button visibility conditions =====');
var ua=new GlideRecord('sys_ui_action');
ua.addEncodedQuery('tableINu_pm_gates,project_change_request,dmn_demand^nameLIKERequest^nameNOT LIKEPurchase');
ua.query();
while(ua.next()){
  var tbl=ua.getValue('table'), current, label;
  if(tbl=='dmn_demand'){
    current=new GlideRecord('dmn_demand'); current.get(bad.getUniqueValue()); label='on CLOSED demand (expect false)';
    gs.print('  ' + tbl + ' ' + label + ' -> ' + eval(ua.getValue('condition')));
    check('M0 button hidden on closed demand', eval(ua.getValue('condition'))===false, '');
    current=new GlideRecord('dmn_demand'); current.get(d.getUniqueValue()); label='on ACTIVE requested demand (expect false, already requested)';
    gs.print('  ' + tbl + ' ' + label + ' -> ' + eval(ua.getValue('condition')));
  } else if(tbl=='u_pm_gates'){
    var pr=new GlideRecord('pm_project'); pr.get('number','PRJ0010022');
    var g=new GlideRecord('u_pm_gates'); g.initialize(); g.u_parent=pr.getUniqueValue(); g.u_title='btn cond test';
    var gid=g.insert();
    current=new GlideRecord('u_pm_gates'); current.get(gid);
    gs.print('  ' + tbl + ' on fresh gate (expect true) -> ' + eval(ua.getValue('condition')));
    check('Gate button shows on a fresh gate', eval(ua.getValue('condition'))===true, '');
    current.deleteRecord();
  }
}

gs.print('');
gs.print('===== cleanup =====');
var cl=new GlideRecord('sysapproval_approver'); cl.addQuery('document_id', d.getUniqueValue()); cl.query();
var n=0; while(cl.next()){ cl.deleteRecord(); n++; }
var rst=new GlideRecord('dmn_demand'); rst.get(d.getUniqueValue());
rst.approval='not requested'; rst.u_m0_state='open'; rst.setWorkflow(false); rst.update();
gs.print('  reset ' + rst.getValue('number') + ', removed ' + n + ' approver(s)');

gs.print('');
gs.print('  PASS: '+PASS+'   FAIL: '+FAIL);
