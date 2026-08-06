// Build: per-policy "time cards do not generate labor cost".
//
// Design (after the rate-type route was disproven in 42_prove_ratetype_shared.js):
//   - new field  time_sheet_policy.u_zero_labor_cost   (mirrors OOB update_resource_plan)
//   - guarded early return in TaskRateAPI.getRateForTimecard(), the only actuals-only rate feed
//
// Planning is untouched: it runs RMRates -> RMRateModelApi, which never calls TaskRateAPI.
// Idempotent. Safe to re-run.

var MARKER = 'PPM-ZERO-LABOR-COST';
var FIELD = 'u_zero_labor_cost';

function log(s) { gs.print(s); }

// ---------------------------------------------------------------- 1. update set
var us = new GlideRecord('sys_update_set');
us.addQuery('name', 'PPM Zero Labor Cost');
us.addQuery('state', 'in progress');
us.query();
if (!us.next()) {
    us.initialize();
    us.setValue('name', 'PPM Zero Labor Cost');
    us.setValue('description', 'Per-time-sheet-policy suppression of labor cost from time cards. ' +
        'Rate model continues to drive planned cost.');
    us.insert();
    log('created update set ' + us.getUniqueValue());
} else {
    log('reusing update set ' + us.getUniqueValue());
}
gs.getSession().set('sys_update_set', us.getUniqueValue());

// ---------------------------------------------------------------- 2. the policy field
var dict = new GlideRecord('sys_dictionary');
dict.addQuery('name', 'time_sheet_policy');
dict.addQuery('element', FIELD);
dict.query();
if (dict.next()) {
    log('field time_sheet_policy.' + FIELD + ' already exists');
} else {
    dict.initialize();
    dict.setValue('name', 'time_sheet_policy');
    dict.setValue('element', FIELD);
    dict.setValue('column_label', 'Time cards do not generate labor cost');
    dict.setValue('internal_type', 'boolean');
    dict.setValue('default_value', 'false');
    dict.insert();
    log('created field time_sheet_policy.' + FIELD);
}

// ---------------------------------------------------------------- 3. patch TaskRateAPI
var si = new GlideRecord('sys_script_include');
if (!si.get('name', 'TaskRateAPI')) {
    log('!! TaskRateAPI not found - aborting');
} else {
    var script = si.getValue('script');

    if (script.indexOf(MARKER) > -1) {
        log('TaskRateAPI already patched');
    } else {
        var anchor = '    getRateForTimecard: function() {';
        var occurrences = script.split(anchor).length - 1;

        if (occurrences !== 1) {
            log('!! expected exactly 1 anchor in TaskRateAPI, found ' + occurrences +
                ' - aborting, no change made');
        } else {
            // one single replacement: helper method, then the guarded original opening
            var replacement =
                '    /* ' + MARKER + ' */\n' +
                '    _zeroLaborCostPolicy: function() {\n' +
                '        var userGr = this.timecard.user.getRefRecord();\n' +
                '        if (!userGr.isValidRecord())\n' +
                '            return false;\n' +
                '        var policy = new GlideRecord("time_sheet_policy");\n' +
                '        var policyId = userGr.getValue("time_sheet_policy");\n' +
                '        if (JSUtil.notNil(policyId)) {\n' +
                '            if (!policy.get(policyId))\n' +
                '                return false;\n' +
                '        } else if (!policy.get("is_default", "1"))\n' +
                '            return false;\n' +
                '        return policy.getValue("' + FIELD + '") == "1";\n' +
                '    },\n' +
                '\n' +
                anchor + '\n' +
                '        /* ' + MARKER + ' -- policy-scoped: labor time contributes no cost.\n' +
                '           Actuals only. Planning runs RMRates -> RMRateModelApi, never here. */\n' +
                '        if (this._zeroLaborCostPolicy()) {\n' +
                '            var zeroCurrency = ResourceManagementUtils.getGlobalCurrencyCode(null);\n' +
                '            return new DailyRates(RateUtils.getRateObjectArrayFromRate(\n' +
                '                0, zeroCurrency, 0, this.startDate, this.endDate, false));\n' +
                '        }';

            si.setValue('script', script.replace(anchor, replacement));
            si.update();
            log('patched TaskRateAPI');
        }
    }
}

// ---------------------------------------------------------------- 4. the policy itself
var pol = new GlideRecord('time_sheet_policy');
pol.addQuery('name', 'Zero Labor Cost Policy');
pol.query();
if (pol.next()) {
    log('policy already exists: ' + pol.getUniqueValue());
} else {
    // clone the default policy so behaviour matches except for the new flag
    var def = new GlideRecord('time_sheet_policy');
    def.get('is_default', '1');
    pol.initialize();
    pol.setValue('name', 'Zero Labor Cost Policy');
    pol.setValue('week_starts_on', def.getValue('week_starts_on'));
    pol.setValue('max_hours_per_day', def.getValue('max_hours_per_day'));
    pol.setValue('max_hours_per_week', def.getValue('max_hours_per_week'));
    pol.setValue('allow_blank_time_cards', def.getValue('allow_blank_time_cards'));
    pol.setValue('allow_recall', def.getValue('allow_recall'));
    pol.setValue('recall_period_allowed', def.getValue('recall_period_allowed'));
    pol.setValue('update_resource_plan', true);   // keep actual HOURS flowing
    pol.setValue('is_default', false);
    pol.setValue(FIELD, true);
    pol.insert();
    log('created policy ' + pol.getUniqueValue());
}

log('');
log('=== state ===');
var check = new GlideRecord('time_sheet_policy');
check.query();
while (check.next())
    log('  ' + check.getValue('name') +
        ' | default=' + check.getValue('is_default') +
        ' | update_resource_plan=' + check.getValue('update_resource_plan') +
        ' | ' + FIELD + '=' + check.getValue(FIELD));
