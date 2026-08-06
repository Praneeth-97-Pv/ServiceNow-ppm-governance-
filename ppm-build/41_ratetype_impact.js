// Does flipping rate_model.rate_type = true break PLANNING?
// Planning goes RMRates -> RMRateModelApi. If that path passes no rate_type, and we leave the
// existing 189 lines with an empty rate_type, planning keeps matching them. Verify, don't assume.

function dump(name) {
    var gr = new GlideRecord('sys_script_include');
    if (!gr.get('name', name)) { gs.print('!! missing ' + name); return; }
    var lines = gr.getValue('script').split('\n');
    gs.print('===== ' + name + ' (' + lines.length + ' lines) =====');
    lines.forEach(function (l, i) {
        if (/rate_type|getRate|params\[|getRateInFuncCurrency|function/.test(l))
            gs.print('  ' + (i + 1) + ': ' + l.trim().substring(0, 170));
    });
}
dump('RMRateModelApi');

gs.print('');
dump('RateModelAPI');

gs.print('');
gs.print('===== who else calls getRateInFuncCurrency / RateModelAPI =====');
['getRateInFuncCurrency', 'new RateModelAPI'].forEach(function (t) {
    var gr = new GlideRecord('sys_script_include');
    gr.addQuery('script', 'CONTAINS', t);
    gr.addQuery('active', true);
    gr.query();
    var names = [];
    while (gr.next()) names.push(gr.getValue('name'));
    gs.print('  ' + t + ' -> ' + names.join(', '));
});
