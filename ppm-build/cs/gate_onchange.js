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

    function setIfEmptyVal(field, raw) {
        if (g_form.getValue(field)) { return; }
        if (!raw) { return; }
        g_form.setValue(field, raw);
    }

    var ga = new GlideAjax("GateFinancialsAjax");
    ga.addParam("sysparm_name", "getProjectFinancials");
    ga.addParam("sysparm_project", newValue);
    ga.getXMLAnswer(function(answer) {
        if (!answer) { return; }
        var data = JSON.parse(answer);
        setIfEmptyNum("u_fy_approved_budget", data.fy_approved_budget);
        setIfEmptyNum("u_total_approved_budget", data.total_approved_budget);
        setIfEmptyNum("u_total_incurred_cost", data.total_incurred_cost);
        setIfEmptyNum("u_total_remaining_cost", data.total_remaining_cost);
        setIfEmptyNum("u_incurred_cost", data.fy_incurred_cost);
        setIfEmptyNum("u_remaining_cost", data.fy_remaining_cost);
        setIfEmptyVal("u_phase", data.phase);
    });
}
