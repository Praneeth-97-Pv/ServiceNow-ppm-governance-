// Gate process scaffolding — what makes the guide's section 8.1 lifecycle actually usable.
// Follows the OOB PPM conventions found on pm_project / project_change_request.

// ---------------- 1. Auto-numbering (PRJ/PCR convention: 7 digits, start 10000) ----------------
gs.print('===== 1. Numbering =====');
var sn = new GlideRecord('sys_number');
sn.addQuery('category', 'u_pm_gates');
sn.query();
if (sn.next()) {
  gs.print('  exists: prefix=' + sn.getValue('prefix'));
} else {
  var n = new GlideRecord('sys_number');
  n.initialize();
  n.category = 'u_pm_gates';
  n.prefix = 'GATE';
  n.maximum_digits = 7;
  n.number = 10000;
  gs.print('  created sys_number GATE0010000+ -> ' + n.insert());
}

// ---------------- 2. Related list: Gates on the project ----------------
// Guide 8.1 "Gate created from a project" needs this to exist.
gs.print('');
gs.print('===== 2. Gates related list on pm_project =====');
var rl = new GlideRecord('sys_ui_related_list');
rl.addQuery('name', 'pm_project');
rl.query();
while (rl.next()) {
  var view = rl.view.getDisplayValue() || '(default)';
  var dupe = new GlideRecord('sys_ui_related_list_entry');
  dupe.addQuery('list_id', rl.getUniqueValue());
  dupe.addQuery('related_list', 'u_pm_gates.u_parent');
  dupe.query();
  if (dupe.next()) { gs.print('  ' + view + ': already present'); continue; }

  var maxPos = 0;
  var e = new GlideRecord('sys_ui_related_list_entry');
  e.addQuery('list_id', rl.getUniqueValue());
  e.query();
  while (e.next()) {
    var pp = parseInt(e.getValue('position')) || 0;
    if (pp > maxPos) { maxPos = pp; }
  }
  var neu = new GlideRecord('sys_ui_related_list_entry');
  neu.initialize();
  neu.list_id = rl.getUniqueValue();
  neu.related_list = 'u_pm_gates.u_parent';
  neu.position = maxPos + 1;
  gs.print('  ' + view + ': added -> ' + neu.insert());
}

// ---------------- 3. Navigation ----------------
gs.print('');
gs.print('===== 3. Application menu and modules =====');
var app = new GlideRecord('sys_app_application');
app.addQuery('title', 'Project Gates');
app.query();
var appId;
if (app.next()) { appId = app.getUniqueValue(); gs.print('  menu exists'); }
else {
  var a = new GlideRecord('sys_app_application');
  a.initialize();
  a.title = 'Project Gates';
  a.name = 'Project Gates';
  a.active = true;
  a.order = 1000;
  appId = a.insert();
  gs.print('  menu CREATED -> ' + appId);
}

function addModule(title, table, linkType, order, filter) {
  var m = new GlideRecord('sys_app_module');
  m.addQuery('application', appId);
  m.addQuery('title', title);
  m.query();
  if (m.next()) { gs.print('  module exists: ' + title); return; }
  var n2 = new GlideRecord('sys_app_module');
  n2.initialize();
  n2.application = appId;
  n2.title = title;
  n2.name = table;
  n2.link_type = linkType;
  n2.order = order;
  n2.active = true;
  if (filter) { n2.filter = filter; }
  gs.print('  module CREATED: ' + title + ' -> ' + n2.insert());
}

addModule('All Gates', 'u_pm_gates', 'LIST', 100, '');
addModule('Open Gates', 'u_pm_gates', 'LIST', 200, 'u_state=open');
addModule('Awaiting Approval', 'u_pm_gates', 'LIST', 300, 'u_approval=requested');
addModule('Create New Gate', 'u_pm_gates', 'NEW', 400, '');
addModule('Approver Matrix', 'u_approver_matrix', 'LIST', 500, '');

// ---------------- 4. ACLs ----------------
gs.print('');
gs.print('===== 4. Table ACLs =====');
function acl(table, operation, roles) {
  var existing = new GlideRecord('sys_security_acl');
  existing.addQuery('name', table);
  existing.addQuery('operation', operation);
  existing.addQuery('type', 'record');
  existing.query();
  var aclId;
  if (existing.next()) {
    aclId = existing.getUniqueValue();
    gs.print('  acl exists: ' + table + '.' + operation);
  } else {
    var a2 = new GlideRecord('sys_security_acl');
    a2.initialize();
    a2.name = table;
    a2.operation = operation;
    a2.type = 'record';
    a2.admin_overrides = true;
    a2.active = true;
    a2.description = 'Created by PPM CR and Gate replication';
    aclId = a2.insert();
    gs.print('  acl CREATED: ' + table + '.' + operation);
  }
  roles.forEach(function (roleName) {
    var r = new GlideRecord('sys_user_role');
    if (!r.get('name', roleName)) { gs.print('    role missing: ' + roleName); return; }
    var link = new GlideRecord('sys_security_acl_role');
    link.addQuery('sys_security_acl', aclId);
    link.addQuery('sys_user_role', r.getUniqueValue());
    link.query();
    if (link.next()) { return; }
    var l = new GlideRecord('sys_security_acl_role');
    l.initialize();
    l.sys_security_acl = aclId;
    l.sys_user_role = r.getUniqueValue();
    l.insert();
    gs.print('    + role ' + roleName);
  });
}

var PM_WRITE = ['it_project_manager', 'it_portfolio_manager'];
var PM_READ = ['it_project_manager', 'it_portfolio_manager', 'it_project_user', 'sn_ppm_read'];

acl('u_pm_gates', 'read', PM_READ);
acl('u_pm_gates', 'write', PM_WRITE);
acl('u_pm_gates', 'create', PM_WRITE);
acl('u_pm_gates', 'delete', ['it_portfolio_manager']);

acl('u_approver_matrix', 'read', PM_READ);
acl('u_approver_matrix', 'write', ['it_portfolio_manager']);
acl('u_approver_matrix', 'create', ['it_portfolio_manager']);
acl('u_approver_matrix', 'delete', ['it_portfolio_manager']);

gs.print('');
gs.print('DONE');
