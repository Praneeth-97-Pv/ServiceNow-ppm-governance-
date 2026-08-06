// OPTION E -- zero OOB records modified.
//
// Reverts the TaskRateAPI patch and replaces it with NEW records only:
//   - script include  PPMZeroLaborCost          (new)
//   - business rule   fm_expense_line           (new)
//   - business rule   resource_allocation_daily (new)
//
// A platform team will accept this far more readily than a patched OOB script include.
// The open question this build answers: can new BRs actually reach every consumer?
//
// Idempotent.

var MARKER = 'PPM-ZERO-LABOR-COST';
function log(s) { gs.print(s); }

// ---------------------------------------------------------------- 1. revert TaskRateAPI
var si = new GlideRecord('sys_script_include');
si.get('name', 'TaskRateAPI');
var script = si.getValue('script');

if (script.indexOf(MARKER) === -1) {
    log('TaskRateAPI already pristine');
} else {
    // remove the helper method block
    var hStart = script.indexOf('    /* ' + MARKER + ' */');
    var hEnd = script.indexOf('    getRateForTimecard: function() {', hStart);
    if (hStart > -1 && hEnd > hStart) script = script.substring(0, hStart) + script.substring(hEnd);

    // remove the guard block inside getRateForTimecard
    var gStart = script.indexOf('        /* ' + MARKER + ' --');
    if (gStart > -1) {
        var gEnd = script.indexOf('        }\n', gStart);
        if (gEnd > gStart) script = script.substring(0, gStart) + script.substring(gEnd + '        }\n'.length);
    }

    if (script.indexOf(MARKER) > -1) {
        log('!! revert incomplete, marker still present - aborting');
    } else {
        si.setValue('script', script);
        si.update();
        log('reverted TaskRateAPI to pristine');
    }
}

// ---------------------------------------------------------------- 2. new script include
var inc = new GlideRecord('sys_script_include');
if (!inc.get('name', 'PPMZeroLaborCost')) {
    inc.initialize();
    inc.setValue('name', 'PPMZeroLaborCost');
    inc.setValue('api_name', 'global.PPMZeroLaborCost');
    inc.setValue('client_callable', false);
    inc.setValue('access', 'public');
    inc.setValue('description', 'Does this user sit on a time sheet policy that suppresses labor cost?');
}
inc.setValue('script',
    'var PPMZeroLaborCost = Class.create();\n' +
    'PPMZeroLaborCost.prototype = {\n' +
    '    initialize: function() {},\n' +
    '\n' +
    '    // true when the user sits on a time sheet policy flagged to generate no labor cost.\n' +
    '    // Mirrors TimeSheetPolicy.getFromUser(): no policy on the user falls back to the default.\n' +
    '    appliesToUser: function(userId) {\n' +
    '        if (JSUtil.nil(userId))\n' +
    '            return false;\n' +
    '        var user = new GlideRecord("sys_user");\n' +
    '        if (!user.get(userId))\n' +
    '            return false;\n' +
    '        var policy = new GlideRecord("time_sheet_policy");\n' +
    '        var policyId = user.getValue("time_sheet_policy");\n' +
    '        if (JSUtil.notNil(policyId)) {\n' +
    '            if (!policy.get(policyId))\n' +
    '                return false;\n' +
    '        } else if (!policy.get("is_default", "1"))\n' +
    '            return false;\n' +
    '        return policy.getValue("u_zero_labor_cost") == "1";\n' +
    '    },\n' +
    '\n' +
    '    type: "PPMZeroLaborCost"\n' +
    '};');
if (inc.isNewRecord && !inc.getUniqueValue()) inc.insert(); else if (!inc.update()) inc.insert();
log('script include PPMZeroLaborCost in place');

// ---------------------------------------------------------------- 3. business rules
// NOTE names must stay under 40 chars (sys_script.name is VARCHAR(40))
function upsertBR(name, table, when, order, action, scriptBody, condition) {
    if (name.length > 40) { log('!! BR name too long: ' + name); return; }
    var br = new GlideRecord('sys_script');
    if (!br.get('name', name)) br.initialize();
    br.setValue('name', name);
    br.setValue('collection', table);
    br.setValue('when', when);
    br.setValue('order', order);
    br.setValue('active', true);
    br.setValue('advanced', true);
    br.setValue('action_insert', action.indexOf('insert') > -1);
    br.setValue('action_update', action.indexOf('update') > -1);
    br.setValue('condition', condition || '');
    br.setValue('script', scriptBody);
    var id = br.getUniqueValue() ? (br.update(), br.getUniqueValue()) : br.insert();
    log('  BR "' + name + '" on ' + table + ' -> ' + id);
}

upsertBR('PPM Zero Labor Cost - Expense Line', 'fm_expense_line', 'before', 150, 'insert,update',
    '(function executeRule(current, previous /*null when async*/) {\n' +
    '    if (gs.nil(current.time_card))\n' +
    '        return;\n' +
    '    var tc = current.time_card.getRefRecord();\n' +
    '    if (!tc.isValidRecord())\n' +
    '        return;\n' +
    '    if (!new PPMZeroLaborCost().appliesToUser(tc.getValue("user")))\n' +
    '        return;\n' +
    '    current.setValue("amount", current.amount.getReferenceCurrencyCode() + ";0");\n' +
    '    if (current.isValidField("amount_project_currency"))\n' +
    '        current.setValue("amount_project_currency", 0);\n' +
    '    if (current.isValidField("amount_demand_currency"))\n' +
    '        current.setValue("amount_demand_currency", 0);\n' +
    '})(current, previous);');

upsertBR('PPM Zero Labor Cost - Alloc Daily', 'resource_allocation_daily', 'before', 150, 'insert,update',
    '(function executeRule(current, previous /*null when async*/) {\n' +
    '    if (!new PPMZeroLaborCost().appliesToUser(current.getValue("user")))\n' +
    '        return;\n' +
    '    current.setValue("actual_cost", 0);\n' +
    '    current.setValue("actual_hourly_rate", 0);\n' +
    '})(current, previous);');

log('');
log('=== IMPORTANT ===');
log('ResourceActuals calls setWorkflow(false) before writing allocation dailies, so the');
log('Alloc Daily rule may never fire for time-card-driven actuals. The tests will show it.');
