var ep = new GlideRecord('sys_extension_point');
ep.addEncodedQuery('nameLIKEDemandConversion');
ep.query();
while(ep.next()){ gs.print('  extension point: ' + ep.getValue('name') + ' | ' + ep.getUniqueValue()); }
var impl = new GlideRecord('sys_extension_instance');
impl.query();
gs.print('  total extension instances on instance: ' + impl.getRowCount());
var i2 = new GlideRecord('sys_extension_instance');
i2.addEncodedQuery('extension_pointLIKEDemandConversion');
i2.query();
gs.print('  DemandConversionFieldMap implementations: ' + i2.getRowCount());
while(i2.next()){ gs.print('    ' + i2.getValue('name')); }
