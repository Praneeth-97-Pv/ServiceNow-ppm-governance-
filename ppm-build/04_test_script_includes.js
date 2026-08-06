var p = new GlideRecord('pm_project');
p.get('number', 'PRJ0010677');
gs.print('Project: ' + p.getValue('number') + ' | ' + p.getUniqueValue());
gs.print('  phase=' + p.getValue('phase') + ' portfolio=' + p.primary_portfolio.getDisplayValue());

gs.print('');
gs.print('--- fiscal period coverage for today ---');
var now = new GlideDateTime();
var fp = new GlideRecord('fiscal_period');
fp.addQuery('fiscal_start_date_time', '<=', now);
fp.addQuery('fiscal_end_date_time', '>=', now);
fp.query();
gs.print('  matching periods: ' + fp.getRowCount());
while (fp.next()) {
  gs.print('   ' + fp.getValue('short_description') + ' | type=' + fp.getValue('period_type') + ' | fiscal_year=' + fp.getValue('fiscal_year'));
}

gs.print('');
gs.print('--- breakdown types on this project ---');
var a = new GlideAggregate('cost_plan_breakdown');
a.addQuery('task', p.getUniqueValue());
a.addAggregate('COUNT'); a.addAggregate('SUM','actual'); a.addAggregate('SUM','estimate_to_completion');
a.groupBy('breakdown_type'); a.query();
while (a.next()) {
  gs.print('  ' + a.breakdown_type + ': n=' + a.getAggregate('COUNT') +
           ' actual=' + a.getAggregate('SUM','actual') + ' etc=' + a.getAggregate('SUM','estimate_to_completion'));
}

gs.print('');
gs.print('--- GateFinancialsAjax.buildPayload ---');
var payload = new GateFinancialsAjax().buildPayload(p.getUniqueValue());
gs.print(JSON.stringify(payload, null, 2));

gs.print('');
gs.print('--- ApproverMatrixCalculator (empty matrix, expect []) ---');
gs.print('  gate lookup: ' + JSON.stringify(new ApproverMatrixCalculator().getFinalApproversForGateRecord('nonexistent')));
