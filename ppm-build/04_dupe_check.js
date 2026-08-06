function dump(table){
  gs.print('===== ' + table + ' =====');
  var seen = {};
  var s = new GlideRecord('sys_ui_section');
  s.addQuery('name', table);
  s.query();
  while(s.next()){
    var cap = s.getValue('caption') || '(no caption)';
    var els = [];
    var e = new GlideRecord('sys_ui_element');
    e.addQuery('sys_ui_section', s.getUniqueValue());
    e.orderBy('position');
    e.query();
    while(e.next()){
      var v = e.getValue('element')+'';
      if (v && v.charAt(0) != '.') {
        els.push(v);
        if(!seen[v]) seen[v] = [];
        seen[v].push(cap);
      }
    }
    gs.print('  [' + cap + '] ' + s.getUniqueValue() + ' -> ' + els.length + ' fields');
    gs.print('     ' + els.join(', '));
  }
  var dupes = [];
  for (var k in seen){ if (seen[k].length > 1) dupes.push(k + ' (' + seen[k].join(' + ') + ')'); }
  gs.print('');
  gs.print('  DUPLICATES: ' + (dupes.length ? dupes.length : 'none'));
  dupes.forEach(function(d){ gs.print('    ' + d); });
  gs.print('');
}
dump('project_change_request');
dump('u_pm_gates');
