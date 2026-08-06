// OPTION F -- classify labor lines into a THIRD state so they are never picked up or rolled up.
//
//   'pending'   -> the daily "Process Expense Allocation" job picks these up and processes them
//   'processed' -> every actual-cost rollup sums these
//   'excluded'  -> NEW. Neither. The line keeps its REAL amount as an audit trail.
//
// Zero OOB records modified: one new choice, one new business rule, one new script include
// (already created by 48). Replaces the amount-zeroing rule.
//
// Idempotent.

function log(s) { gs.print(s); }

// ---------------------------------------------------------------- 1. the new state
var c = new GlideRecord('sys_choice');
c.addQuery('name', 'fm_expense_line');
c.addQuery('element', 'state');
c.addQuery('value', 'excluded');
c.query();
if (c.next()) {
    log('choice "excluded" already exists');
} else {
    c.initialize();
    c.setValue('name', 'fm_expense_line');
    c.setValue('element', 'state');
    c.setValue('value', 'excluded');
    c.setValue('label', 'Excluded from actuals');
    c.setValue('sequence', 2);
    c.setValue('inactive', false);
    c.insert();
    log('created choice fm_expense_line.state = "excluded"');
}

// ---------------------------------------------------------------- 2. retire the zeroing rule
var old = new GlideRecord('sys_script');
if (old.get('name', 'PPM Zero Labor Cost - Expense Line')) {
    old.setValue('active', false);
    old.update();
    log('deactivated the amount-zeroing rule (superseded)');
}

// ---------------------------------------------------------------- 3. the classifier rule
var NAME = 'PPM Labor Cost Excluded';       // 23 chars, well under the 40 limit
var br = new GlideRecord('sys_script');
if (!br.get('name', NAME)) br.initialize();
br.setValue('name', NAME);
br.setValue('collection', 'fm_expense_line');
br.setValue('when', 'before');
br.setValue('order', 150);
br.setValue('active', true);
br.setValue('advanced', true);
br.setValue('action_insert', true);
br.setValue('action_update', true);
br.setValue('description',
    'Labor expense lines raised from a time card, for users on a time sheet policy flagged ' +
    'u_zero_labor_cost, are parked in state "excluded". The daily allocation job only picks up ' +
    '"pending" and every actual-cost rollup only sums "processed", so the line never reaches ' +
    'actual cost. The amount is left intact as an audit trail.');
br.setValue('script',
    '(function executeRule(current, previous /*null when async*/) {\n' +
    '    if (gs.nil(current.time_card))\n' +
    '        return;\n' +
    '    if (current.getValue("category") != "labor")\n' +
    '        return;\n' +
    '    var tc = current.time_card.getRefRecord();\n' +
    '    if (!tc.isValidRecord())\n' +
    '        return;\n' +
    '    if (!new PPMZeroLaborCost().appliesToUser(tc.getValue("user")))\n' +
    '        return;\n' +
    '\n' +
    '    // Park it. Not "pending" (the daily allocation job would process it) and not\n' +
    '    // "processed" (every actual-cost rollup sums that state). Amount is left alone.\n' +
    '    current.setValue("state", "excluded");\n' +
    '})(current, previous);');
var id = br.getUniqueValue() ? (br.update(), br.getUniqueValue()) : br.insert();
log('business rule "' + NAME + '" -> ' + id);

// ---------------------------------------------------------------- state
log('');
log('=== rules on fm_expense_line for this feature ===');
var all = new GlideRecord('sys_script');
all.addQuery('collection', 'fm_expense_line');
all.addEncodedQuery('nameLIKEPPM');
all.query();
while (all.next())
    log('  "' + all.getValue('name') + '" active=' + all.getValue('active') +
        ' when=' + all.getValue('when') + ' order=' + all.getValue('order'));

log('');
log('=== state choices now ===');
var ch = new GlideRecord('sys_choice');
ch.addQuery('name', 'fm_expense_line');
ch.addQuery('element', 'state');
ch.orderBy('sequence');
ch.query();
while (ch.next()) log('  ' + ch.getValue('value') + ' = ' + ch.getValue('label'));
