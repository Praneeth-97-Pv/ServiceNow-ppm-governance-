var d = new GlideRecord('dmn_demand');
d.get('number','DMND0001172');
gs.print('Demand: ' + d.getValue('number') + ' | portfolio=' + d.portfolio.getDisplayValue() + ' | type=' + d.getValue('type'));

gs.print('');
gs.print('=== buildDemandPayload (no seed yet, expect zeros) ===');
gs.print(JSON.stringify(new GateFinancialsAjax().buildDemandPayload(d.getUniqueValue()), null, 2));

gs.print('');
gs.print('=== buildPayload (project) still works ===');
var p = new GlideRecord('pm_project'); p.get('number','PRJ0010022');
var pay = new GateFinancialsAjax().buildPayload(p.getUniqueValue());
gs.print('  total_incurred=' + pay.total_incurred_cost + ' fy_incurred=' + pay.fy_incurred_cost + ' phase=' + pay.phase);

gs.print('');
gs.print('=== ApproverMatrixCalculator: all three entry points ===');
var c = new ApproverMatrixCalculator();
gs.print('  getFinalApproversForDemand (no m0 rows yet): ' + JSON.stringify(c.getFinalApproversForDemand(d.getUniqueValue())));
var g = new GlideRecord('u_pm_gates'); g.query(); g.next();
gs.print('  getFinalApproversForGateRecord: ' + c.getFinalApproversForGateRecord(g.getUniqueValue()).length + ' approver(s)');
var cr = new GlideRecord('project_change_request');
cr.addEncodedQuery('parentISNOTEMPTY'); cr.setLimit(1); cr.query();
if(cr.next()) gs.print('  getFinalApprovers (CR): ' + c.getFinalApprovers(cr.getUniqueValue()).length + ' approver(s)');
