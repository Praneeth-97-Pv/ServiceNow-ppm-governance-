// Purge all test data created by 44 / 46 / 47. Safe to re-run.
var TAGS = ['ZLC-TEST', 'PVA-TEST', 'ISO-TEST', 'TS3-TEST', 'LBL-TEST', 'EDGE-TEST'];

// Scan pm_project AND dmn_demand -- the label test creates a demand too, and scanning only
// projects left it (and its labelled expense line) behind.
var projIds = [];
var demandIds = [];
TAGS.forEach(function (t) {
    var p = new GlideRecord('pm_project');
    p.addQuery('short_description', 'STARTSWITH', t);
    p.query();
    while (p.next()) projIds.push(p.getUniqueValue());

    var d = new GlideRecord('dmn_demand');
    d.addQuery('short_description', 'STARTSWITH', t);
    d.query();
    while (d.next()) demandIds.push(d.getUniqueValue());
});
gs.print('test projects found: ' + projIds.length + ', demands: ' + demandIds.length);

if (demandIds.length) {
    var dl = demandIds.join(',');
    ['fm_expense_line', 'time_card', 'resource_allocation_daily', 'resource_plan'].forEach(function (t) {
        var g = new GlideRecord(t);
        g.addQuery('task', 'IN', dl);
        g.deleteMultiple();
    });
    var dd = new GlideRecord('dmn_demand');
    dd.addQuery('sys_id', 'IN', dl);
    dd.deleteMultiple();
    gs.print('deleted ' + demandIds.length + ' demand(s) and their children');
}

if (projIds.length) {
    var idList = projIds.join(',');

    // expense lines + breakdowns
    var expIds = [];
    var e = new GlideRecord('fm_expense_line');
    e.addQuery('task', 'IN', idList);
    e.query();
    while (e.next()) expIds.push(e.getUniqueValue());
    if (expIds.length) {
        var eb = new GlideRecord('fm_expense_line_breakdown');
        eb.addQuery('expense_line', 'IN', expIds.join(','));
        eb.deleteMultiple();
        gs.print('deleted expense line breakdowns');
    }
    var e2 = new GlideRecord('fm_expense_line');
    e2.addQuery('task', 'IN', idList);
    e2.deleteMultiple();
    gs.print('deleted ' + expIds.length + ' expense lines');

    // time cards
    var tc = new GlideRecord('time_card');
    tc.addQuery('task', 'IN', idList);
    tc.deleteMultiple();
    gs.print('deleted time cards');

    // allocations + dailies via resource plans
    var planIds = [];
    var rp = new GlideRecord('resource_plan');
    rp.addQuery('task', 'IN', idList);
    rp.query();
    while (rp.next()) planIds.push(rp.getUniqueValue());

    if (planIds.length) {
        var allocIds = [];
        var al = new GlideRecord('resource_allocation');
        al.addQuery('resource_plan', 'IN', planIds.join(','));
        al.query();
        while (al.next()) allocIds.push(al.getUniqueValue());

        if (allocIds.length) {
            var ad = new GlideRecord('resource_allocation_daily');
            ad.addQuery('allocation', 'IN', allocIds.join(','));
            ad.deleteMultiple();
            gs.print('deleted allocation dailies by allocation');
        }
        var ad2 = new GlideRecord('resource_allocation_daily');
        ad2.addQuery('task', 'IN', idList);
        ad2.deleteMultiple();
        gs.print('deleted allocation dailies by task');

        var al2 = new GlideRecord('resource_allocation');
        al2.addQuery('resource_plan', 'IN', planIds.join(','));
        al2.deleteMultiple();
        gs.print('deleted ' + allocIds.length + ' allocations');

        var ra = new GlideRecord('requested_allocation');
        if (ra.isValid()) {
            ra.addQuery('resource_plan', 'IN', planIds.join(','));
            ra.deleteMultiple();
            gs.print('deleted requested allocations');
        }
    }

    var rp2 = new GlideRecord('resource_plan');
    rp2.addQuery('task', 'IN', idList);
    rp2.deleteMultiple();
    gs.print('deleted ' + planIds.length + ' resource plans');

    // cost plans the fixtures spawned
    var cp = new GlideRecord('cost_plan');
    if (cp.isValid()) {
        cp.addQuery('task', 'IN', idList);
        cp.deleteMultiple();
        gs.print('deleted cost plans');
    }

    var pr = new GlideRecord('pm_project');
    pr.addQuery('sys_id', 'IN', idList);
    pr.deleteMultiple();
    gs.print('deleted ' + projIds.length + ' projects');
}

gs.print('');
TAGS.forEach(function (t) {
    var c = new GlideAggregate('pm_project');
    c.addQuery('short_description', 'STARTSWITH', t);
    c.addAggregate('COUNT'); c.query(); c.next();
    gs.print('  remaining ' + t + ': ' + c.getAggregate('COUNT'));
});
