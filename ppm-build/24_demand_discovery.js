gs.print('=== demand tables ===');
['dmn_demand','dmn_demand_task','sn_dmn_demand'].forEach(function(t){
  var g = new GlideRecord(t);
  if(!g.isValid()){ gs.print('  MISS ' + t); return; }
  var a = new GlideAggregate(t); a.addAggregate('COUNT'); a.query(); a.next();
  gs.print('  OK   ' + t + ' rows=' + a.getAggregate('COUNT'));
});

gs.print('');
gs.print('=== dmn_demand inheritance ===');
var chain=[], cur='dmn_demand';
for(var i=0;i<8 && cur;i++){
  var d=new GlideRecord('sys_db_object');
  if(!d.get('name',cur)) break;
  chain.push(cur);
  cur = d.super_class ? d.super_class.name+'' : '';
}
gs.print('  ' + chain.join(' -> '));

gs.print('');
gs.print('=== does demand have the matrix dimensions? ===');
var g = new GlideRecord('dmn_demand');
['primary_portfolio','portfolio','u_project_type','project_type','type','demand_type','phase','stage','state','short_description','assignment_group','business_case','requested_by','department','business_unit','financial_benefit','risk','size','score','priority'].forEach(function(f){
  gs.print('  ' + (g.isValidField(f) ? 'YES ' : 'no  ') + f);
});

gs.print('');
gs.print('=== demand -> project conversion: what exists OOB? ===');
var ua = new GlideRecord('sys_ui_action');
ua.addQuery('table','dmn_demand');
ua.orderBy('order'); ua.query();
while(ua.next()){
  gs.print('  UI ACTION: ' + ua.getValue('name') + ' | action=' + ua.getValue('action_name') +
           ' | client=' + ua.getValue('client') + ' | cond=' + (ua.getValue('condition')||'').substring(0,60));
}

gs.print('');
gs.print('=== script includes mentioning demand->project ===');
var si = new GlideRecord('sys_script_include');
si.addEncodedQuery('nameLIKEdemand^ORscriptLIKEdmn_demand');
si.setLimit(15); si.query();
while(si.next()){ gs.print('  ' + si.getValue('name') + ' | ' + (si.getValue('description')||'').substring(0,70)); }

gs.print('');
gs.print('=== demand state / stage choices ===');
['state','stage'].forEach(function(f){
  if(!g.isValidField(f)) return;
  var c = new GlideRecord('sys_choice');
  c.addQuery('name','dmn_demand'); c.addQuery('element',f); c.orderBy('sequence'); c.query();
  var vals=[];
  while(c.next()){ vals.push(c.getValue('value')+'='+c.getValue('label')); }
  gs.print('  ' + f + ': ' + vals.join(', '));
});
