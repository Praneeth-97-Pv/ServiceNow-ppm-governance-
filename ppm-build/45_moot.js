gs.print('=== the OOB rule that mooted our approvals ===');
var br = new GlideRecord('sys_script');
br.addQuery('name','Moot Approvals Upon Cancellation');
br.query();
while(br.next()){
  gs.print('  table=' + br.getValue('collection') + ' when=' + br.getValue('when') +
           ' ins=' + br.getValue('action_insert') + ' upd=' + br.getValue('action_update') + ' order=' + br.getValue('order'));
  gs.print('  condition: ' + (br.getValue('condition')||'(none)'));
  gs.print('  --- script ---');
  gs.print(br.getValue('script'));
}

gs.print('');
gs.print('=== state of the two demands ===');
[['DMND0001172','converted, worked'],['DMND0001141','mooted']].forEach(function(p){
  var d=new GlideRecord('dmn_demand');
  if(d.get('number',p[0])){
    gs.print('  ' + p[0] + ' (' + p[1] + '): state=' + d.getValue('state') +
             ' active=' + d.getValue('active') + ' approval=' + d.getValue('approval'));
  }
});

gs.print('');
gs.print('=== demand state choices, for reference ===');
var c=new GlideRecord('sys_choice');
c.addQuery('name','dmn_demand'); c.addQuery('element','state'); c.orderBy('sequence'); c.query();
while(c.next()){ gs.print('  ' + c.getValue('value') + ' = ' + c.getValue('label') + ' (inactive=' + c.getValue('inactive') + ')'); }
