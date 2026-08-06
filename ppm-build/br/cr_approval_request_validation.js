(function executeRule(current, previous) {

    var isInsert = current.operation() == "insert";

    if (isInsert) {
        if (current.approval != "requested") { return; }
    } else {
        if (!current.approval.changesTo("requested")) { return; }
    }

    function fail(msg) {
        if (isInsert) {
            gs.addErrorMessage(msg + " Approval reset to Not Requested.");
            current.approval = "not requested";
        } else {
            gs.addErrorMessage(msg);
            current.setAbortAction(true);
        }
    }

    var project = new GlideRecord("pm_project");
    if (!current.parent || !project.get(current.parent)) {
        fail("Cannot request approval - the parent project could not be found."); return;
    }
    if (!project.u_project_type) {
        fail("Cannot request approval - Project Type is not set on the parent project."); return;
    }
    if (!project.primary_portfolio) {
        fail("Cannot request approval - Portfolio is not set on the parent project."); return;
    }

})(current, previous);
