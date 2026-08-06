var br = new GlideRecord('sys_script');
br.addQuery('name','Moot Approvals Upon Cancellation');
br.query();
while(br.next()){
  gs.print('filter_condition: [' + (br.getValue('filter_condition')||'(empty)') + ']');
  gs.print('when=' + br.getValue('when') + ' order=' + br.getValue('order') + ' collection=' + br.getValue('collection'));
}
gs.print('');
gs.print('=== active demands, type=project, unconverted (proper M0 candidates) ===');
var d = new GlideRecord('dmn_demand');
d.addEncodedQuery('type=project^projectISEMPTY^active=true^portfolioISNOTEMPTY');
d.orderBy('number');
d.setLimit(8); d.query();
gs.print('  candidates: ' + d.getRowCount());
while(d.next()){
  gs.print('   ' + d.getValue('number') + ' | state=' + d.getValue('state') + ' active=' + d.getValue('active') +
           ' | ' + d.portfolio.getDisplayValue() + ' | approval=' + d.getValue('approval'));
}
