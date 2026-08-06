// PROOF: the PLANNING path also derives rate_type from the user's time sheet policy.
// If true, a "Zero Cost" rate type cannot separate planned from actual cost -- it would zero both.
// Read-only.

var RM = 'daf6052adb5823009ef63a2b7c961942';

// A user on a policy that has allow_multiple_rate_types = true
var pol = new GlideRecord('time_sheet_policy');
pol.addQuery('allow_multiple_rate_types', true);
pol.addNotNullQuery('default_rate_type');
pol.setLimit(1);
pol.query();
if (!pol.next()) { gs.print('no multi-rate-type policy found'); }
gs.print('policy under test: ' + pol.getValue('name') +
    ' | default_rate_type=' + pol.getDisplayValue('default_rate_type'));

var u = new GlideRecord('sys_user');
u.addQuery('time_sheet_policy', pol.getUniqueValue());
u.setLimit(1);
u.query();
u.next();
gs.print('user under test: ' + u.getDisplayValue() + ' (' + u.getUniqueValue() + ')');

// 1. What the ACTUALS path resolves as rate_type -- straight from the policy
var tsp = TimeSheetPolicy.getFromUser(u);
gs.print('');
gs.print('ACTUALS  : TimeSheetPolicy.defaultRateType() = ' + tsp.defaultRateType());

// 2. What the PLANNING path resolves. RMRateModelApi.deriveRateType() mutates the params object.
var rp = new GlideRecord('resource_plan');
rp.addQuery('user_resource', u.getUniqueValue());
rp.setLimit(1);
rp.query();

if (rp.next()) {
    gs.print('resource plan: ' + rp.getDisplayValue() + ' (' + rp.getUniqueValue() + ')');
    var api = new RMRateModelApi(rp, RM, false);
    var params = api.getRateModelParams();
    gs.print('PLANNING : params BEFORE deriveRateType, rate_type = ' + params.rate_type);
    params.resource = u.getUniqueValue();
    api.deriveRateType(params);
    gs.print('PLANNING : params AFTER  deriveRateType, rate_type = ' + params.rate_type);
} else {
    gs.print('no resource plan for that user -- calling deriveRateType directly instead');
    var api2 = new RMRateModelApi(new GlideRecord('resource_plan'), RM, false);
    var p2 = { resource: u.getUniqueValue() };
    api2.deriveRateType(p2);
    gs.print('PLANNING : deriveRateType({resource: user}) -> rate_type = ' + p2.rate_type);
}

gs.print('');
gs.print('CONCLUSION: if both print the same rate type, a rate-type-keyed zero rate line');
gs.print('            zeroes PLANNED cost as well as actual. Config-only route is dead.');
