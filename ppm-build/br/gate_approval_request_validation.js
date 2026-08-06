(function executeRule(current, previous) {

    var isInsert = current.operation() == "insert";

    // Only relevant while approval is being requested
    if (isInsert) {
        if (current.u_approval != "requested") { return; }
    } else {
        if (!current.u_approval.changesTo("requested")) { return; }
    }

    // On insert the request is reset; on update the save is blocked
    function fail(msg) {
        if (isInsert) {
            gs.addErrorMessage(msg + " Approval reset to Not Requested.");
            current.u_approval = "not_requested";
        } else {
            gs.addErrorMessage(msg);
            current.setAbortAction(true);
        }
    }

    var project = new GlideRecord("pm_project");
    if (!current.u_parent || !project.get(current.u_parent)) {
        fail("Cannot request approval - parent project not found."); return;
    }
    if (!project.u_project_type) {
        fail("Cannot request approval - Project Type is not set on the parent project."); return;
    }
    if (!project.primary_portfolio) {
        fail("Cannot request approval - Portfolio is not set on the parent project."); return;
    }
    if (!current.u_phase) {
        fail("Cannot request approval - Phase is not set on this gate."); return;
    }

})(current, previous);
