(function executeRule(current, previous) {

    // Approved closes M0. Rejected leaves it open for rework, mirroring the Gate behaviour.
    if (current.approval.changesTo('approved')) {
        current.u_m0_state = 'closed';
    }

})(current, previous);
