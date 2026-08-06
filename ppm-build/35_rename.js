function rename(table, oldName, newName){
  var g = new GlideRecord(table);
  g.addQuery('name', oldName);
  g.query();
  var n=0;
  while(g.next()){ g.name = newName; g.update(); n++; }
  gs.print('  ' + table + ': "' + oldName + '" -> "' + newName + '" (' + n + ')');
}
rename('sys_script', 'M0 - Snapshot Financials on Approval Req', 'M0 - Snapshot Financials on Request');
rename('sys_script_client', 'Gate - Populate Financials on Parent Cha', 'Gate - Financials on Parent Change');
rename('sys_script_client', 'CR - Populate Financials on Parent Chang', 'CR - Financials on Parent Change');
