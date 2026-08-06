(function executeRule(current, previous) {

    if (!current.parent) { return; }
    var project = new GlideRecord("pm_project");
    if (!project.get(current.parent)) { return; }

    var changed = false;

    // --- On approval, the requested budget becomes the project FY budget ---
    if (current.approval.changesTo("approved")) {
        var reqStr = current.u_requested_budget + "";
        var reqNum = parseFloat(reqStr);
        if (reqStr && !isNaN(reqNum) && reqNum !== 0) {
            project.u_fy_approved_budget = reqStr;
            changed = true;
        }
    }

    // --- A changed P3 date drives the project approved end date ---
    if (current.u_p3_date.changes()) {
        var p3 = current.u_p3_date + "";
        if (p3 && (project.approved_end_date + "") != p3) {
            project.approved_end_date = p3;
            changed = true;
        }
    }

    if (changed) { project.update(); }

})(current, previous);
