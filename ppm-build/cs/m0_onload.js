function onLoad() {
    // A demand already exists long before M0 is raised, so unlike the Gate script this
    // deliberately does NOT bail on existing records - it fills the empty snapshot fields
    // so the user can see the numbers before requesting approval.
    if (g_form.getValue("type") != "project") { return; }

    function setIfEmptyNum(field, raw) {
        var existing = parseFloat(g_form.getValue(field));
        if (!isNaN(existing) && existing > 0) { return; }
        var val = parseFloat(raw);
        if (isNaN(val) || val === 0) { return; }
        g_form.setValue(field, "" + val);
    }

    var ga = new GlideAjax("GateFinancialsAjax");
    ga.addParam("sysparm_name", "getDemandFinancials");
    ga.addParam("sysparm_demand", g_form.getUniqueValue());
    ga.getXMLAnswer(function(answer) {
        if (!answer) { return; }
        var data = JSON.parse(answer);
        setIfEmptyNum("u_total_incurred_cost", data.total_incurred_cost);
        setIfEmptyNum("u_total_remaining_cost", data.total_remaining_cost);
        setIfEmptyNum("u_incurred_cost", data.fy_incurred_cost);
        setIfEmptyNum("u_remaining_cost", data.fy_remaining_cost);
    });
}
