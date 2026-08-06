// Can OOB Rate Type carry the label instead of custom fields?
//
// If time_sheet_policy.default_rate_type (OOB) lands on time_card.rate_type (OOB), a rule can
// dot-walk to it and we need ZERO custom fields and ZERO custom script includes.
//
// Three things to establish:
//   1. Does the policy's default rate type actually reach the time card?
//   2. Is rate_type on the expense line populated, or must we dot-walk via time_card?
//   3. SIDE EFFECT: getRateCardWithRateType filters labor rate cards by rate type. A rate type
//      with no matching rate card falls back to com.snc.time_card.default_rate. Does that change
//      the amount on rate-card (no rate model) projects?
// Read-only.

gs.print('===== 1. where does time_card.rate_type come from? =====');
['sys_script', 'sys_script_include', 'sys_script_client'].forEach(function (t) {
    var gr = new GlideRecord(t);
    if (!gr.isValid()) return;
    gr.addQuery('script', 'CONTAINS', 'defaultRateType');
    gr.query();
    while (gr.next())
        gs.print('  [' + t + '] ' + gr.getValue('name') +
            (gr.isValidField('collection') ? ' on ' + gr.getValue('collection') : '') +
            ' active=' + (gr.isValidField('active') ? gr.getValue('active') : '-') +
            (gr.isValidField('when') ? ' when=' + gr.getValue('when') : ''));
});

gs.print('');
var b = new GlideRecord('sys_script');
if (b.get('name', 'SetUserIsAllowedForMultipleRateTypes')) {
    gs.print('  --- SetUserIsAllowedForMultipleRateTypes (' + b.getValue('when') + ') ---');
    gs.print(b.getValue('script').substring(0, 700));
}

gs.print('');
gs.print('===== 2. is rate_type on fm_expense_line populated today? =====');
var d = new GlideRecord('sys_dictionary');
d.addQuery('name', 'fm_expense_line');
d.addQuery('element', 'rate_type');
d.query();
gs.print('  field exists: ' + d.hasNext());

var ag = new GlideAggregate('fm_expense_line');
ag.addAggregate('COUNT');
ag.groupBy('rate_type');
ag.query();
while (ag.next())
    gs.print('  expense lines with rate_type="' + (ag.getDisplayValue('rate_type') || '(empty)') +
        '" -> ' + ag.getAggregate('COUNT'));

gs.print('');
gs.print('  how _createExpenseLine sets it:');
var si = new GlideRecord('sys_script_include');
si.get('name', 'TaskRateProcessor');
si.getValue('script').split('\n').forEach(function (l, i) {
    if (/rate_type|rateType/.test(l)) gs.print('    ' + (i + 1) + ': ' + l.trim().substring(0, 140));
});

gs.print('');
gs.print('===== 3. SIDE EFFECT: labor rate cards are filtered by rate type =====');
var lrc = new GlideRecord('fm_labor_rate_card');
lrc.query();
while (lrc.next())
    gs.print('  rate card "' + lrc.getValue('name') + '" rate=' + lrc.getValue('hourly_rate') +
        ' rate_type="' + (lrc.getDisplayValue('rate_type') || '(empty)') + '"' +
        ' active=' + lrc.getValue('active'));
gs.print('  --> a NEW rate type matches none of these, so getRateCardWithRateType returns null');
gs.print('  --> and the rate falls back to com.snc.time_card.default_rate = ' +
    gs.getProperty('com.snc.time_card.default_rate'));

gs.print('');
gs.print('===== 4. is the rate model rate-type aware? (decides if planning is at risk) =====');
var rm = new GlideRecord('rate_model');
rm.query();
while (rm.next())
    gs.print('  "' + rm.getValue('name') + '" rate_type flag = ' + rm.getValue('rate_type') +
        '  (false => rate type is ignored by the engine, so it is a free label)');

gs.print('');
gs.print('===== 5. can a user change their own rate type on a time card? =====');
var rr = new GlideRecord('sys_script');
if (rr.get('name', 'Restrict Ratetype Update')) {
    gs.print('  --- Restrict Ratetype Update (' + rr.getValue('when') + ', active=' +
        rr.getValue('active') + ') ---');
    gs.print(rr.getValue('script').substring(0, 800));
}
