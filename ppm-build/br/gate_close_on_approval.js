(function executeRule(current, previous) {

    // Approved closes the Gate. Rejected leaves it Open for rework.
    if (current.u_approval.changesTo("approved")) {
        current.u_state = "closed";
    }

})(current, previous);
