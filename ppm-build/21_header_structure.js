var SEC = '748624a09f202200598a5bb0657fcf0e';
gs.print('=== raw elements in the PCR header section ===');
var e = new GlideRecord('sys_ui_element');
e.addQuery('sys_ui_section', SEC);
e.orderBy('position');
e.query();
var n = 0;
while(e.next()){
  n++;
  gs.print('  pos=' + e.getValue('position') + ' type=[' + e.getValue('type') + '] element=[' + e.getValue('element') + ']');
}
gs.print('  total elements: ' + n);
