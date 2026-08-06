(function executeRule(current, previous) {

    if (!current.parent) { return; }

    var data = new GateFinancialsAjax().buildPayload(current.parent + "");

    function numOf(raw) {
        var s = (raw || "") + "";
        if (s.indexOf(";") > -1) { s = s.split(";")[1]; }
        var n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    function setIfEmpty(targetField, value) {
        if (numOf(current.getValue(targetField)) > 0) { return; }
        var n = parseFloat(value);
        if (isNaN(n) || n === 0) { return; }
        current.setValue(targetField, "" + n);
    }

    // PM-entered budgets, copied from the project as-is
    setIfEmpty("u_last_approved_budget",  data.fy_approved_budget);
    setIfEmpty("u_total_approved_budget", data.total_approved_budget);

    // Derived from the project cost plans
    setIfEmpty("u_incurred_cost_to_date",       data.fy_incurred_cost);
    setIfEmpty("u_total_incurred_cost_to_date", data.total_incurred_cost);

})(current, previous);
