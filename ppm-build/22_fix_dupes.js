// Remove fields that the platform's "Add New Column To Form Section" rule auto-appended to the
// project_change_request header, and which now also live in the PCR Details section.
//
// Kept in the header: u_additional_approvers + u_approval_not_required (not part of the
// §4.5 Details layout), paired at the bottom to mirror the §4.3 Gate header.

var HEADER = '748624a09f202200598a5bb0657fcf0e';
var DETAILS = '780179a3831e4b10b5ea5e65eeaad354';

// ---- collect what PCR Details owns ----
var owned = {};
var d = new GlideRecord('sys_ui_element');
d.addQuery('sys_ui_section', DETAILS);
d.query();
while (d.next()) {
  var v = d.getValue('element') + '';
  if (v && v.charAt(0) != '.') { owned[v] = true; }
}
gs.print('PCR Details owns ' + Object.keys(owned).length + ' fields');

// ---- delete those from the header ----
gs.print('');
gs.print('=== removing duplicates from header ===');
var removed = 0;
var h = new GlideRecord('sys_ui_element');
h.addQuery('sys_ui_section', HEADER);
h.query();
while (h.next()) {
  var el = h.getValue('element') + '';
  if (owned[el]) {
    gs.print('  - ' + el);
    h.deleteRecord();
    removed++;
  }
}
gs.print('  removed ' + removed);

// ---- reposition the tail: approvers paired, activity stream last ----
gs.print('');
gs.print('=== repositioning header tail ===');

function setPos(element, position) {
  var g = new GlideRecord('sys_ui_element');
  g.addQuery('sys_ui_section', HEADER);
  g.addQuery('element', element);
  g.query();
  if (!g.next()) { gs.print('  not found: ' + element); return false; }
  g.position = position;
  g.update();
  gs.print('  ' + element + ' -> pos ' + position);
  return true;
}

function addMarker(marker, position) {
  var g = new GlideRecord('sys_ui_element');
  g.addQuery('sys_ui_section', HEADER);
  g.addQuery('element', marker);
  g.addQuery('position', position);
  g.query();
  if (g.next()) { gs.print('  marker exists: ' + marker + ' @ ' + position); return; }
  var n = new GlideRecord('sys_ui_element');
  n.initialize();
  n.sys_ui_section = HEADER;
  n.name = 'project_change_request';
  n.type = marker;      // both type and element must carry the marker (guide §4)
  n.element = marker;
  n.position = position;
  n.insert();
  gs.print('  + ' + marker + ' @ ' + position);
}

// 0..16 stay as they are (number .. work_notes, including the existing .split/.end_split block)
addMarker('.begin_split', 17);
setPos('u_additional_approvers', 18);
addMarker('.split', 19);
setPos('u_approval_not_required', 20);
addMarker('.end_split', 21);
setPos('activity.xml', 22);

// ---- verify ----
gs.print('');
gs.print('=== resulting header layout ===');
var v = new GlideRecord('sys_ui_element');
v.addQuery('sys_ui_section', HEADER);
v.orderBy('position');
v.query();
while (v.next()) {
  gs.print('  ' + v.getValue('position') + '  [' + (v.getValue('type') || 'field') + '] ' + v.getValue('element'));
}

// ---- cross-section duplicate re-check for both tables ----
gs.print('');
gs.print('=== duplicate re-check ===');
['project_change_request', 'u_pm_gates', 'pm_project'].forEach(function (table) {
  var seen = {};
  var s = new GlideRecord('sys_ui_section');
  s.addQuery('name', table);
  s.query();
  while (s.next()) {
    var e = new GlideRecord('sys_ui_element');
    e.addQuery('sys_ui_section', s.getUniqueValue());
    e.query();
    while (e.next()) {
      var el2 = e.getValue('element') + '';
      if (!el2 || el2.charAt(0) == '.') { continue; }
      var key = s.getValue('view') + '|' + el2;   // duplicates only matter within the same view
      seen[key] = (seen[key] || 0) + 1;
    }
  }
  var dupes = [];
  for (var k in seen) { if (seen[k] > 1) { dupes.push(k.split('|')[1] + ' x' + seen[k]); } }
  gs.print('  ' + table + ': ' + (dupes.length ? dupes.join(', ') : 'no duplicates'));
});
