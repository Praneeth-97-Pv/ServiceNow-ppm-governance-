(function executeRule(current, previous) {

    // M0 lives on the demand, which is created long before the milestone is raised, so the
    // financial snapshot is taken when approval is first requested rather than at insert.
    if (!current.u_m0_state) { current.u_m0_state = 'open'; }

    var isInsert = current.operation() == 'insert';
    var requesting = isInsert
        ? (current.approval == 'requested')
        : current.approval.changesTo('requested');
    if (!requesting) { return; }

    var data = new GateFinancialsAjax().buildDemandPayload(current.getUniqueValue());

    function numOf(raw) {
        var s = (raw || '') + '';
        if (s.indexOf(';') > -1) { s = s.split(';')[1]; }
        var n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    function setIfEmpty(field, value) {
        if (numOf(current.getValue(field)) > 0) { return; }
        var n = parseFloat(value);
        if (isNaN(n) || n === 0) { return; }
        current.setValue(field, '' + n);
    }

    // Derived from the demand's own cost plans
    setIfEmpty('u_total_incurred_cost',  data.total_incurred_cost);
    setIfEmpty('u_total_remaining_cost', data.total_remaining_cost);
    setIfEmpty('u_incurred_cost',        data.fy_incurred_cost);
    setIfEmpty('u_remaining_cost',       data.fy_remaining_cost);

})(current, previous);
