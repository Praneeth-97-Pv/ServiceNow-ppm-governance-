// Prepare an unconverted demand for the preview test
var d = new GlideRecord('dmn_demand');
d.addEncodedQuery('type=project^projectISEMPTY^portfolioISNOTEMPTY^approval!=approved');
d.setLimit(1); d.query();
if (!d.next()) { gs.print('NO CANDIDATE'); }
else {
  var pf = new GlideRecord('pm_portfolio');
  pf.get('188fc541535513004e77ddeeff7b1201');
  d.portfolio = '188fc541535513004e77ddeeff7b1201';
  d.u_project_type = 'strategic';
  d.setWorkflow(false);
  d.update();
  gs.print('DEMAND_ID=' + d.getUniqueValue());
  gs.print('DEMAND_NUM=' + d.getValue('number'));
  gs.print('  portfolio=' + d.portfolio.getDisplayValue() + ' type=' + d.getValue('type') + ' project_type=' + d.getValue('u_project_type'));
}
var p = new GlideRecord('pm_project'); p.get('number','PRJ0010022');
var g = new GlideRecord('u_pm_gates');
g.initialize(); g.u_parent = p.getUniqueValue(); g.u_title = 'Preview test gate';
gs.print('GATE_ID=' + g.insert());
