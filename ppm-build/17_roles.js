gs.print('=== PPM-related roles ===');
var r = new GlideRecord('sys_user_role');
r.addEncodedQuery('nameLIKEproject^ORnameLIKEportfolio^ORnameLIKEppm^ORnameLIKEpm_');
r.orderBy('name'); r.query();
while(r.next()){ gs.print('  ' + r.getValue('name') + '  |  ' + (r.getValue('description')||'').substring(0,60)); }

gs.print('');
gs.print('=== what the app menu/module match actually was ===');
var m = new GlideRecord('sys_app_module');
m.addEncodedQuery('titleLIKEgate^ORname=u_pm_gates');
m.query();
while(m.next()){ gs.print('  module: ' + m.getValue('title') + ' | table=' + m.getValue('name') + ' | app=' + m.application.getDisplayValue()); }
var ap = new GlideRecord('sys_app_application');
ap.addEncodedQuery('titleLIKEgate'); ap.query();
while(ap.next()){ gs.print('  app: ' + ap.getValue('title')); }

gs.print('');
gs.print('=== NumberManager availability ===');
try {
  var nm = new NumberManager('incident');
  gs.print('  NumberManager works, sample next for incident (not consumed): OK');
} catch(e) { gs.print('  NumberManager unavailable: ' + e); }

gs.print('');
gs.print('=== how OOB PPM tables number themselves ===');
var sn = new GlideRecord('sys_number');
sn.addEncodedQuery('category=pm_project^ORcategory=project_change_request');
sn.query();
while(sn.next()){ gs.print('  ' + sn.getValue('category') + ' prefix=' + sn.getValue('prefix') + ' digits=' + sn.getValue('maximum_digits') + ' next=' + sn.getValue('number')); }
