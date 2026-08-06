function onChange(control, oldValue, newValue, isLoading, isTemplate) {
    if (isLoading || isTemplate) { return; }
    if (!newValue) { return; }
    if (!g_form.isNewRecord()) { return; }

    function setIfEmptyNum(field, raw) {
        var existing = parseFloat(g_form.getValue(field));
        if (!isNaN(existing) && existing > 0) { return; }
        var val = parseFloat(raw);
        if (isNaN(val) || val === 0) { return; }
        g_form.setValue(field, "" + val);
    }

    var ga = new GlideAjax("GateFinancialsAjax");
    ga.addParam("sysparm_name", "getProjectFinancials");
    ga.addParam("sysparm_project", newValue);
    ga.getXMLAnswer(function(answer) {
        if (!answer) { return; }
        var data = JSON.parse(answer);
        setIfEmptyNum("u_last_approved_budget", data.fy_approved_budget);
        setIfEmptyNum("u_total_approved_budget", data.total_approved_budget);
        setIfEmptyNum("u_incurred_cost_to_date", data.fy_incurred_cost);
        setIfEmptyNum("u_total_incurred_cost_to_date", data.total_incurred_cost);
    });
}
