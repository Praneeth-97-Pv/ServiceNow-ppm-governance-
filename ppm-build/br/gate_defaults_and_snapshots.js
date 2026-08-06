(function executeRule(current, previous) {

    var isInsert = current.operation() == "insert";

    // --- Phase inherited from the parent project (creation only) ---
    if (isInsert && !current.u_phase && !current.u_gate_type && current.u_parent) {
        var proj = new GlideRecord("pm_project");
        if (proj.get(current.u_parent)) { current.u_phase = proj.phase + ""; }
    }

    // --- Keep Gate Type and Phase in step (creation and update) ---
    var gateToPhase = { "p0": "initiating", "p1": "planning", "p2a": "executing",
                        "p2b": "closing", "p3": "closing" };
    var phaseToGate = { "initiating": "p0", "planning": "p1", "executing": "p2a",
                        "closing": "p2b" };
    var phase = current.u_phase + "";
    var gate  = current.u_gate_type + "";
    if (gate && gateToPhase[gate]) {
        current.u_phase = gateToPhase[gate];
    } else if (phase && phaseToGate[phase] && !gate) {
        current.u_gate_type = phaseToGate[phase];
    }

    // --- Financial snapshots, frozen at creation ---
    if (!isInsert || !current.u_parent) { return; }

    var data = new GateFinancialsAjax().buildPayload(current.u_parent + "");

    function numOf(raw) {
        var s = (raw || "") + "";
        if (s.indexOf(";") > -1) { s = s.split(";")[1]; }
        var n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    function setIfEmpty(field, value) {
        if (numOf(current.getValue(field)) > 0) { return; }
        var n = parseFloat(value);
        if (isNaN(n) || n === 0) { return; }
        current.setValue(field, "" + n);
    }

    // PM-entered budgets, copied from the project as-is
    setIfEmpty("u_fy_approved_budget",    data.fy_approved_budget);
    setIfEmpty("u_total_approved_budget", data.total_approved_budget);

    // Derived from the project cost plans
    setIfEmpty("u_total_incurred_cost",  data.total_incurred_cost);
    setIfEmpty("u_total_remaining_cost", data.total_remaining_cost);
    setIfEmpty("u_incurred_cost",        data.fy_incurred_cost);
    setIfEmpty("u_remaining_cost",       data.fy_remaining_cost);

})(current, previous);
