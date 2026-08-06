(function executeRule(current, previous) {

    var isInsert = current.operation() == 'insert';

    if (isInsert) {
        if (current.approval != 'requested') { return; }
    } else {
        if (!current.approval.changesTo('requested')) { return; }
    }

    function fail(msg) {
        if (isInsert) {
            gs.addErrorMessage(msg + ' Approval reset to Not Requested.');
            current.approval = 'not requested';
        } else {
            gs.addErrorMessage(msg);
            current.setAbortAction(true);
        }
    }

    // An inactive demand cannot hold approvals: the OOB task rule "Moot Approvals Upon
    // Cancellation" (filter active=false) voids them to not_required the moment they are
    // created, so the request would silently do nothing.
    if (!current.active) {
        fail('Cannot request M0 approval - this demand is closed. Approvals on an inactive demand are voided automatically.'); return;
    }

    // M0 only applies to demands that can become a project.
    if ((current.type + '') != 'project') {
        fail('Cannot request M0 approval - the demand type must be Project.'); return;
    }
    if (!current.u_project_type) {
        fail('Cannot request M0 approval - Project Type is not set on this demand.'); return;
    }
    if (!current.portfolio) {
        fail('Cannot request M0 approval - Portfolio is not set on this demand.'); return;
    }
    if (!current.project.nil()) {
        fail('Cannot request M0 approval - this demand has already been converted to a project.'); return;
    }

})(current, previous);
