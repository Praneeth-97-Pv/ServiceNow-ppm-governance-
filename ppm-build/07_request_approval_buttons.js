// "Request Approval" form buttons, plus the missing approval field on the demand form.

// ---------------- 1. dmn_demand.approval was on no form at all ----------------
gs.print('===== 1. put approval on the demand form =====');
var target = null;
var s = new GlideRecord('sys_ui_section');
s.addQuery('name', 'dmn_demand');
s.query();
while (s.next()) {
  if ((s.view.getDisplayValue() + '') !== 'Default view') { continue; }
  var probe = new GlideRecord('sys_ui_element');
  probe.addQuery('sys_ui_section', s.getUniqueValue());
  probe.addQuery('element', 'u_m0_state');
  probe.query();
  if (probe.next()) { target = { sec: s.getUniqueValue(), pos: parseInt(probe.getValue('position')) || 0 }; break; }
}
if (!target) {
  // fall back to the section holding u_project_type
  var s2 = new GlideRecord('sys_ui_section');
  s2.addQuery('name', 'dmn_demand');
  s2.query();
  while (s2.next()) {
    if ((s2.view.getDisplayValue() + '') !== 'Default view') { continue; }
    var p2 = new GlideRecord('sys_ui_element');
    p2.addQuery('sys_ui_section', s2.getUniqueValue());
    p2.addQuery('element', 'u_project_type');
    p2.query();
    if (p2.next()) { target = { sec: s2.getUniqueValue(), pos: parseInt(p2.getValue('position')) || 0 }; break; }
  }
}

if (!target) { gs.print('  could not locate the M0 fields on the Default view'); }
else {
  var exists = new GlideRecord('sys_ui_element');
  exists.addQuery('sys_ui_section', target.sec);
  exists.addQuery('element', 'approval');
  exists.query();
  if (exists.next()) { gs.print('  approval already present at pos ' + exists.getValue('position')); }
  else {
    // shift everything after the M0 state field down one slot
    var shift = new GlideRecord('sys_ui_element');
    shift.addQuery('sys_ui_section', target.sec);
    shift.addQuery('position', '>', target.pos);
    shift.query();
    while (shift.next()) {
      shift.position = (parseInt(shift.getValue('position')) || 0) + 1;
      shift.update();
    }
    var el = new GlideRecord('sys_ui_element');
    el.initialize();
    el.sys_ui_section = target.sec;
    el.name = 'dmn_demand';
    el.type = 'field';
    el.element = 'approval';
    el.position = target.pos + 1;
    gs.print('  approval ADDED at pos ' + (target.pos + 1) + ' -> ' + el.insert());
  }
}

// ---------------- 2. Request Approval buttons ----------------
gs.print('');
gs.print('===== 2. Request Approval UI actions =====');

function clientScript(table, field, label) {
  // No dialog. The button just requests approval; the Approvers related list is the UI for
  // seeing and actioning who was asked. If the matrix matches nothing, the server-side rule
  // says so via a standard error message.
  return "g_form.setValue('" + field + "', 'requested');\n" +
         "g_form.save();\n";
}

function upsertAction(cfg) {
  var ua = new GlideRecord('sys_ui_action');
  ua.addQuery('table', cfg.table);
  ua.addQuery('name', cfg.name);
  ua.query();
  var rec;
  if (ua.next()) { rec = ua; gs.print('  UPDATED  ' + cfg.table + ' / ' + cfg.name); }
  else {
    rec = new GlideRecord('sys_ui_action');
    rec.initialize();
    rec.table = cfg.table;
    rec.name = cfg.name;
    gs.print('  CREATED  ' + cfg.table + ' / ' + cfg.name);
  }
  rec.action_name = cfg.action;
  rec.form_button = true;
  rec.form_context_menu = false;
  rec.list_button = false;
  rec.client = true;
  rec.onclick = '';
  rec.script = cfg.script;
  rec.condition = cfg.condition;
  rec.active = true;
  rec.order = 100;
  rec.hint = cfg.hint;
  if (rec.getUniqueValue()) { rec.update(); } else { rec.insert(); }
}

upsertAction({
  table: 'u_pm_gates',
  name: 'Request Approval',
  action: 'request_gate_approval',
  hint: 'Request approval - approvers are generated into the Approvers tab',
  condition: "current.u_approval != 'requested' && current.u_approval != 'approved' && !current.isNewRecord()",
  script: clientScript('u_pm_gates', 'u_approval', 'Gate approval')
});

upsertAction({
  table: 'project_change_request',
  name: 'Request Approval',
  action: 'request_cr_approval',
  hint: 'Request approval - approvers are generated into the Approvers tab',
  condition: "current.approval != 'requested' && current.approval != 'approved' && !current.isNewRecord()",
  script: clientScript('project_change_request', 'approval', 'Change Request approval')
});

upsertAction({
  table: 'dmn_demand',
  name: 'Request M0 Approval',
  action: 'request_m0_approval',
  hint: 'Request M0 approval - approvers are generated into the Approvers tab',
  condition: "current.active == true && current.type == 'project' && current.project.nil() " +
             "&& current.approval != 'requested' && current.approval != 'approved' && !current.isNewRecord()",
  script: clientScript('dmn_demand', 'approval', 'M0 approval')
});

// ---------------- 3. verify ----------------
gs.print('');
gs.print('===== verify =====');
var v = new GlideRecord('sys_ui_action');
v.addEncodedQuery('tableINu_pm_gates,project_change_request,dmn_demand^nameLIKERequest');
v.query();
while (v.next()) {
  gs.print('  ' + v.getValue('table') + ' | "' + v.getValue('name') + '" | button=' + v.getValue('form_button') +
           ' client=' + v.getValue('client') + ' active=' + v.getValue('active') +
           ' | script ' + (v.getValue('script') || '').length + ' chars');
}

gs.print('');
[['u_pm_gates', 'u_approval'], ['project_change_request', 'approval'], ['dmn_demand', 'approval']].forEach(function (pair) {
  var found = [];
  var sec = new GlideRecord('sys_ui_section');
  sec.addQuery('name', pair[0]);
  sec.query();
  while (sec.next()) {
    var e = new GlideRecord('sys_ui_element');
    e.addQuery('sys_ui_section', sec.getUniqueValue());
    e.addQuery('element', pair[1]);
    e.query();
    if (e.next()) { found.push(sec.view.getDisplayValue() + ' pos ' + e.getValue('position')); }
  }
  gs.print('  ' + pair[0] + '.' + pair[1] + ' on form: ' + (found.length ? found.join(', ') : 'NO'));
});
