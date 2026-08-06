var PASS=0, FAIL=0;
function check(l,c,dd){ if(c){PASS++;gs.print('  PASS  '+l+(dd?'  ['+dd+']':''));} else {FAIL++;gs.print('  FAIL  '+l+(dd?'  ['+dd+']':''));} }
function toNum(raw){ var s=(raw||'')+''; if(s.indexOf(';')>-1){s=s.split(';')[1];} var v=parseFloat(s); return isNaN(v)?0:v; }

var d = new GlideRecord('dmn_demand');
d.get('number','DMND0001172');
var projId = d.getValue('project');
gs.print('Demand ' + d.getValue('number') + ' | approval=' + d.getValue('approval') +
         ' | m0_state=' + d.getValue('u_m0_state') + ' | state=' + d.getValue('state') +
         ' | project=' + projId);

gs.print('');
gs.print('===== remaining conversion assertions =====');
var p = new GlideRecord('pm_project');
p.get(projId);
gs.print('  project ' + p.getValue('number') + ' | ' + (p.getValue('short_description')||'').substring(0,40));
check('Project inherited FY approved budget', toNum(p.getValue('u_fy_approved_budget'))===250000, p.getValue('u_fy_approved_budget'));
check('Project inherited total approved budget', toNum(p.getValue('u_total_approved_budget'))===900000, p.getValue('u_total_approved_budget'));
check('Project inherited u_project_type', (p.getValue('u_project_type')+'')==='strategic', p.getValue('u_project_type'));
check('Project portfolio mapped', (p.getValue('primary_portfolio')+'')===(d.getValue('portfolio')+''), p.primary_portfolio.getDisplayValue());
check('Demand state advanced to Approved/Completed', ['8','9'].indexOf(d.getValue('state')+'')>-1, 'state='+d.getValue('state'));
check('Demand M0 closed', (d.getValue('u_m0_state')+'')==='closed', d.getValue('u_m0_state'));

gs.print('');
gs.print('===== re-approval is blocked (already converted) =====');
var d2 = new GlideRecord('dmn_demand');
d2.get(d.getUniqueValue());
d2.approval = 'requested';
d2.update();
var d3 = new GlideRecord('dmn_demand'); d3.get(d.getUniqueValue());
check('Converted demand cannot re-request M0', (d3.getValue('approval')+'')!=='requested', 'approval='+d3.getValue('approval'));

gs.print('');
gs.print('===== Gate rollup regression (the gap the guide left) =====');
var pr = new GlideRecord('pm_project'); pr.get('number','PRJ0010022');
var g = new GlideRecord('u_pm_gates');
g.initialize(); g.u_parent = pr.getUniqueValue(); g.u_title='Rollup regression gate';
var gid = g.insert();
var g2 = new GlideRecord('u_pm_gates'); g2.get(gid);
g2.u_approval='requested'; g2.update();
var n=0;
var ga = new GlideRecord('sysapproval_approver');
ga.addQuery('document_id', gid); ga.addQuery('state','requested'); ga.query();
while(ga.next()){ ga.state='approved'; ga.update(); n++; }
var g3 = new GlideRecord('u_pm_gates'); g3.get(gid);
check('Gate approval rolls up automatically', (g3.getValue('u_approval')+'')==='approved', n+' approvers -> '+g3.getValue('u_approval'));
check('Gate closed as a result', (g3.getValue('u_state')+'')==='closed', g3.getValue('u_state'));
g3.deleteRecord();

gs.print('');
gs.print('===== CR rollup regression =====');
var cr = new GlideRecord('project_change_request');
cr.initialize(); cr.parent = pr.getUniqueValue(); cr.short_description='Rollup regression CR';
var cid = cr.insert();
var c2 = new GlideRecord('project_change_request'); c2.get(cid);
c2.approval='requested'; c2.update();
var cn=0;
var ca = new GlideRecord('sysapproval_approver');
ca.addQuery('document_id', cid); ca.addQuery('state','requested'); ca.query();
while(ca.next()){ ca.state='approved'; ca.update(); cn++; }
var c3 = new GlideRecord('project_change_request'); c3.get(cid);
check('CR approval rolls up automatically', (c3.getValue('approval')+'')==='approved', cn+' approvers -> '+c3.getValue('approval'));
c3.deleteRecord();

gs.print('');
gs.print('  PASS: '+PASS+'   FAIL: '+FAIL);
