// Discovery: how rate lines are keyed, and whether the rate model is rate-type aware.
// Read-only. Answers the questions that decide whether a zero-cost rate type is config-only.

var RM = 'daf6052adb5823009ef63a2b7c961942'; // "Group -> User -> Role"

gs.print('===== RateModelConstants =====');
var C = new RateModelConstants();
['WILD_CARD', 'SEPARATOR', 'PATTERN', 'WEIGHTAGE', 'RATE_TYPE', 'RATE_MODEL_LINE'].forEach(function (k) {
    gs.print('  ' + k + ' = ' + JSON.stringify(C[k]));
});

gs.print('===== rate_model columns =====');
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'rate_model');
d.addNotNullQuery('element');
d.query();
var cols = [];
while (d.next()) cols.push(d.getValue('element') + ':' + d.getValue('internal_type'));
gs.print('  ' + cols.join(', '));

gs.print('===== the model itself =====');
var m = new GlideRecord('rate_model');
m.get(RM);
gs.print('  name=' + m.getValue('name'));
var rmObj = new RateModel(RM);
gs.print('  RateModel.rateType() = ' + rmObj.rateType() + '   <-- gates the rate_type filter in the engine');
gs.print('  RateModel.rmContext() = ' + rmObj.rmContext());

gs.print('===== entity attributes (the pattern columns, in order) =====');
var ea = RateModelFactory.getEntityAttrs(RM);
var n = 0;
while (ea.next()) {
    gs.print('  [' + n + '] name=' + ea.getValue('name') +
        ' | entity=' + ea.rate_model_entity.entity_key +
        ' | column=' + ea.getValue('entity_column') +
        ' | order=' + ea.getValue('order'));
    n++;
}
gs.print('  --> pattern length = ' + n + ' attributes');

gs.print('===== sample rate lines =====');
var rl = new GlideRecord('rate_model_line');
rl.addQuery('rate_model', RM);
rl.orderBy('weightage');
rl.setLimit(8);
rl.query();
while (rl.next()) {
    gs.print('  ' + rl.getValue('number') +
        ' | rate=' + rl.getValue('rate') +
        ' | weightage=' + rl.getValue('weightage') +
        ' | rate_type=' + (rl.getDisplayValue('rate_type') || '(empty)') +
        ' | start=' + rl.getValue('start_date') + ' end=' + (rl.getValue('end_date') || '(open)'));
    gs.print('        pattern = ' + rl.getValue('pattern'));
}

gs.print('===== weightage math =====');
var U = new RateModelUtils();
gs.print('  isStarAWildCard() = ' + U.isStarAWildCard());
gs.print('  isCustomHookEnabled() = ' + U.isCustomHookEnabled());
for (var w = 0; w <= Math.pow(2, n) - 1 && w < 8; w++)
    gs.print('  getBinaryPatternStr(' + w + ',' + n + ') = ' + U.getBinaryPatternStr(w, n));
var allWild = Math.pow(2, n) - 1;
gs.print('  all-wildcard weightage would be ' + allWild + ' -> ' + U.getBinaryPatternStr(allWild, n));

gs.print('===== how many lines carry a rate_type today =====');
var ag = new GlideAggregate('rate_model_line');
ag.addQuery('rate_model', RM);
ag.addAggregate('COUNT');
ag.groupBy('rate_type');
ag.query();
while (ag.next())
    gs.print('  rate_type=' + (ag.getDisplayValue('rate_type') || '(empty)') + ' -> ' + ag.getAggregate('COUNT'));
