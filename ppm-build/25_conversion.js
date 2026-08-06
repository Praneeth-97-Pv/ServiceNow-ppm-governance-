gs.print('=== OOB "Create Project" UI action ===');
var ua = new GlideRecord('sys_ui_action');
ua.addQuery('table','dmn_demand');
ua.addQuery('action_name','convert_demand_project');
ua.query();
while(ua.next()){
  gs.print('  name=' + ua.getValue('name') + ' client=' + ua.getValue('client') + ' form_button=' + ua.getValue('form_button'));
  gs.print('  condition: ' + ua.getValue('condition'));
  gs.print('  --- script ---');
  gs.print(ua.getValue('script') || '(none)');
  gs.print('  --- onclick ---');
  gs.print(ua.getValue('onclick') || '(none)');
}

gs.print('');
gs.print('=== conversion helpers ===');
['DemandToProject','DemandConversion','PMDemandUtils','DemandUtils','ProjectCreationUtil','PPMConversionUtil'].forEach(function(n){
  var s = new GlideRecord('sys_script_include');
  if (s.get('name', n)) { gs.print('  FOUND ' + n); }
});
var s2 = new GlideRecord('sys_script_include');
s2.addEncodedQuery('scriptLIKEconvertDemand^ORscriptLIKEcreateProjectFromDemand^ORnameLIKEconvert');
s2.setLimit(10); s2.query();
while(s2.next()){ gs.print('  candidate: ' + s2.getValue('name')); }

gs.print('');
gs.print('=== demand fields that map to a project ===');
var g = new GlideRecord('dmn_demand');
['portfolio','type','state','approval','short_description','description','business_case','requested_by','department','business_unit','financial_benefit','size','score','priority','start_date','end_date','estimated_cost','budget_cost','capex','opex','program'].forEach(function(f){
  gs.print('  ' + (g.isValidField(f) ? 'YES ' : 'no  ') + 'dmn_demand.' + f);
});

gs.print('');
gs.print('=== does demand already have an approvers related list / approval field? ===');
gs.print('  dmn_demand.approval valid: ' + g.isValidField('approval'));
var ap = new GlideAggregate('sysapproval_approver');
ap.addQuery('source_table','dmn_demand'); ap.addAggregate('COUNT'); ap.query(); ap.next();
gs.print('  existing demand approver records: ' + ap.getAggregate('COUNT'));

gs.print('');
gs.print('=== demand type choices ===');
var c = new GlideRecord('sys_choice');
c.addQuery('name','dmn_demand'); c.addQuery('element','type'); c.orderBy('sequence'); c.query();
while(c.next()){ gs.print('  ' + c.getValue('value') + ' = ' + c.getValue('label')); }
