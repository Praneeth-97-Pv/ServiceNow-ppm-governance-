// The build script's gs.getSession().set('sys_update_set', ...) did not take effect, so the
// changes landed in whatever set the session was already on ("PPM CR and Gate Replication").
// Find every update record belonging to this feature and move it to "PPM Zero Labor Cost".

var TARGET = 'PPM Zero Labor Cost';

var target = new GlideRecord('sys_update_set');
if (!target.get('name', TARGET)) { gs.print('!! target update set missing'); }
var targetId = target.getUniqueValue();
gs.print('target update set: ' + targetId);

// Identify this feature's records by their sys_update_xml name, which is <table>_<sys_id>
var si = new GlideRecord('sys_script_include');
si.get('name', 'TaskRateAPI');
var wanted = [
    'sys_script_include_' + si.getUniqueValue()
];

gs.print('');
gs.print('===== locating update records =====');

// script include
wanted.forEach(function (n) {
    var x = new GlideRecord('sys_update_xml');
    x.addQuery('name', n);
    x.query();
    gs.print('  ' + n + ' -> ' + x.getRowCount() + ' record(s)');
    while (x.next()) {
        gs.print('      currently in "' + x.update_set.getDisplayValue() + '"  type=' + x.getValue('type'));
        x.setValue('update_set', targetId);
        x.update();
        gs.print('      -> moved to ' + TARGET);
    }
});

// dictionary + label for the new field
var dx = new GlideRecord('sys_update_xml');
dx.addQuery('name', 'CONTAINS', 'u_zero_labor_cost');
dx.query();
gs.print('  u_zero_labor_cost -> ' + dx.getRowCount() + ' record(s)');
while (dx.next()) {
    gs.print('      ' + dx.getValue('type') + ' currently in "' + dx.update_set.getDisplayValue() + '"');
    dx.setValue('update_set', targetId);
    dx.update();
    gs.print('      -> moved to ' + TARGET);
}

gs.print('');
gs.print('===== final contents of ' + TARGET + ' =====');
var f = new GlideRecord('sys_update_xml');
f.addQuery('update_set', targetId);
f.orderBy('type');
f.query();
gs.print('  ' + f.getRowCount() + ' record(s)');
while (f.next()) gs.print('   ' + f.getValue('type') + '  ::  ' + f.getValue('name'));

gs.print('');
gs.print('===== confirm the CR set is clean again =====');
var cr = new GlideRecord('sys_update_set');
cr.get('name', 'PPM CR and Gate Replication');
var c = new GlideAggregate('sys_update_xml');
c.addQuery('update_set', cr.getUniqueValue());
c.addAggregate('COUNT');
c.query(); c.next();
gs.print('  PPM CR and Gate Replication now holds ' + c.getAggregate('COUNT') + ' records');

gs.print('');
gs.print('NOTE: time_sheet_policy rows are DATA, not configuration -- they are never captured in');
gs.print('      an update set. The policy record and the user assignments must be recreated or');
gs.print('      scripted in any target instance.');
