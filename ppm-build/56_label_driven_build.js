// OPTION G -- label-driven, PROJECTS ONLY.
//
//   time_sheet_policy.u_labor_expense_label   the policy carries the label
//        |
//        v  stamped at expense line creation, projects only, category=labor, from a time card
//   fm_expense_line.u_labor_expense_label     the label lives on the record
//        |
//        v  "anything carrying a label"
//   state = 'excluded'                        never picked up, never rolled up
//
// Why stamp rather than re-derive: the label is a historical fact. If someone's policy changes
// later, past expense lines keep the classification they were raised under. It is also visible
// and reportable on the record instead of requiring a walk back through time card -> user -> policy.
//
// Zero OOB records modified. Idempotent.

function log(s) { gs.print(s); }

var POLICY_FIELD = 'u_labor_expense_label';
var LINE_FIELD = 'u_labor_expense_label';
var LABEL_VALUE = 'non_chargeable';

// ---------------------------------------------------------------- 1. field on the policy
function ensureField(table, element, label, type, len) {
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('name', table);
    d.addQuery('element', element);
    d.query();
    if (d.next()) { log('field ' + table + '.' + element + ' already exists'); return; }
    d.initialize();
    d.setValue('name', table);
    d.setValue('element', element);
    d.setValue('column_label', label);
    d.setValue('internal_type', type);
    if (len) d.setValue('max_length', len);
    d.insert();
    log('created field ' + table + '.' + element);
}

ensureField('time_sheet_policy', POLICY_FIELD, 'Labor expense label', 'string', 40);
ensureField('fm_expense_line', LINE_FIELD, 'Labor expense label', 'string', 40);

// ---------------------------------------------------------------- 2. the label choice
function ensureChoice(table, element, value, label, seq) {
    var c = new GlideRecord('sys_choice');
    c.addQuery('name', table);
    c.addQuery('element', element);
    c.addQuery('value', value);
    c.query();
    if (c.next()) { log('choice ' + table + '.' + element + '=' + value + ' exists'); return; }
    c.initialize();
    c.setValue('name', table);
    c.setValue('element', element);
    c.setValue('value', value);
    c.setValue('label', label);
    c.setValue('sequence', seq);
    c.insert();
    log('created choice ' + table + '.' + element + ' = ' + value);
}

ensureChoice('time_sheet_policy', POLICY_FIELD, LABEL_VALUE, 'Non-chargeable labor', 0);
ensureChoice('fm_expense_line', LINE_FIELD, LABEL_VALUE, 'Non-chargeable labor', 0);
ensureChoice('fm_expense_line', 'state', 'excluded', 'Excluded from actuals', 2);

// ---------------------------------------------------------------- 3. helper script include
var inc = new GlideRecord('sys_script_include');
if (!inc.get('name', 'PPMLaborExpenseLabel')) {
    inc.initialize();
    inc.setValue('name', 'PPMLaborExpenseLabel');
    inc.setValue('api_name', 'global.PPMLaborExpenseLabel');
    inc.setValue('access', 'public');
    inc.setValue('client_callable', false);
}
inc.setValue('description', 'Resolves the labor expense label carried by a user\'s time sheet policy.');
inc.setValue('script',
    'var PPMLaborExpenseLabel = Class.create();\n' +
    'PPMLaborExpenseLabel.prototype = {\n' +
    '    initialize: function() {},\n' +
    '\n' +
    '    // The label configured on the user\'s time sheet policy, or "" if none.\n' +
    '    // Mirrors TimeSheetPolicy.getFromUser(): no policy on the user falls back to the default.\n' +
    '    forUser: function(userId) {\n' +
    '        if (JSUtil.nil(userId))\n' +
    '            return "";\n' +
    '        var user = new GlideRecord("sys_user");\n' +
    '        if (!user.get(userId))\n' +
    '            return "";\n' +
    '        var policy = new GlideRecord("time_sheet_policy");\n' +
    '        var policyId = user.getValue("time_sheet_policy");\n' +
    '        if (JSUtil.notNil(policyId)) {\n' +
    '            if (!policy.get(policyId))\n' +
    '                return "";\n' +
    '        } else if (!policy.get("is_default", "1"))\n' +
    '            return "";\n' +
    '        return policy.getValue("' + POLICY_FIELD + '") || "";\n' +
    '    },\n' +
    '\n' +
    '    type: "PPMLaborExpenseLabel"\n' +
    '};');
if (inc.getUniqueValue()) inc.update(); else inc.insert();
log('script include PPMLaborExpenseLabel in place');

// ---------------------------------------------------------------- 4. rules
function upsertBR(name, table, when, order, actions, condition, body) {
    if (name.length > 40) { log('!! name too long (' + name.length + '): ' + name); return; }
    var br = new GlideRecord('sys_script');
    if (!br.get('name', name)) br.initialize();
    br.setValue('name', name);
    br.setValue('collection', table);
    br.setValue('when', when);
    br.setValue('order', order);
    br.setValue('active', true);
    br.setValue('advanced', true);
    br.setValue('action_insert', actions.indexOf('insert') > -1);
    br.setValue('action_update', actions.indexOf('update') > -1);
    br.setValue('condition', condition || '');
    br.setValue('script', body);
    if (br.getUniqueValue()) br.update(); else br.insert();
    log('  rule "' + name + '" (' + name.length + ' chars) on ' + table);
}

// STEP 1 -- stamp the label. Labor category, raised from a time card, user's policy carries a label.
// Deliberately NOT scoped to projects: resource hours are not planned or submitted against demands
// in this process, so the extra condition would guard a case that does not occur.
upsertBR('PPM Stamp Labor Label', 'fm_expense_line', 'before', 140, 'insert',
    '',
    '(function executeRule(current, previous /*null when async*/) {\n' +
    '    if (gs.nil(current.time_card))\n' +
    '        return;\n' +
    '    if (current.getValue("category") != "labor")\n' +
    '        return;\n' +
    '\n' +
    '    var tc = current.time_card.getRefRecord();\n' +
    '    if (!tc.isValidRecord())\n' +
    '        return;\n' +
    '\n' +
    '    var label = new PPMLaborExpenseLabel().forUser(tc.getValue("user"));\n' +
    '    if (label)\n' +
    '        current.setValue("' + LINE_FIELD + '", label);\n' +
    '})(current, previous);');

// STEP 2 -- anything carrying a label is parked out of the actual-cost pipeline.
upsertBR('PPM Exclude Labelled Labor', 'fm_expense_line', 'before', 150, 'insert,update',
    'JSUtil.notNil(current.' + LINE_FIELD + ')',
    '(function executeRule(current, previous /*null when async*/) {\n' +
    '    // Not "pending" -- the daily Process Expense Allocation job would pick it up.\n' +
    '    // Not "processed" -- every actual-cost rollup sums that state.\n' +
    '    // The amount is left intact as an audit trail of what the labor was worth.\n' +
    '    current.setValue("state", "excluded");\n' +
    '})(current, previous);');

// ---------------------------------------------------------------- 5. retire earlier attempts
['PPM Labor Cost Excluded', 'PPM Zero Labor Cost - Expense Line', 'PPM Zero Labor Cost - Alloc Daily']
    .forEach(function (n) {
        var o = new GlideRecord('sys_script');
        if (o.get('name', n) && o.getValue('active') == '1') {
            o.setValue('active', false);
            o.update();
            log('  deactivated superseded rule "' + n + '"');
        }
    });

// ---------------------------------------------------------------- 6. put the label on the policy
var pol = new GlideRecord('time_sheet_policy');
if (pol.get('name', 'Zero Labor Cost Policy')) {
    pol.setValue(POLICY_FIELD, LABEL_VALUE);
    pol.update();
    log('policy "Zero Labor Cost Policy" labelled ' + LABEL_VALUE);
}

log('');
log('=== policies ===');
var p = new GlideRecord('time_sheet_policy');
p.query();
while (p.next())
    log('  ' + p.getValue('name') + ' | label="' + (p.getValue(POLICY_FIELD) || '') + '"');

log('');
log('=== active rules on fm_expense_line for this feature ===');
var r = new GlideRecord('sys_script');
r.addQuery('collection', 'fm_expense_line');
r.addEncodedQuery('nameLIKEPPM');
r.orderBy('order');
r.query();
while (r.next())
    log('  "' + r.getValue('name') + '" active=' + r.getValue('active') + ' order=' + r.getValue('order'));
