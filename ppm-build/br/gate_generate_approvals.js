(function executeRule(current, previous) {
    var calculator = new ApproverMatrixCalculator();
    var finalApprovers = calculator.getFinalApproversForGateRecord(current.getUniqueValue());
    if (finalApprovers.length === 0) {
        gs.warn("No approvers found for gate: " + current.getUniqueValue());
        gs.addErrorMessage("No approvers match this gate in the Approver Matrix. Check the project's Project Type and Portfolio, and that matrix rows exist for this phase.");
        return;
    }
    var finalSet = {};
    for (var i = 0; i < finalApprovers.length; i++) { finalSet[finalApprovers[i]] = true; }

    var existingMap = {};
    var eq = new GlideRecord("sysapproval_approver");
    eq.addQuery("document_id", current.getUniqueValue());
    eq.addQuery("source_table", "u_pm_gates");
    eq.query();
    while (eq.next()) { existingMap[eq.approver + ""] = eq.getUniqueValue(); }

    for (var approverId in finalSet) {
        if (existingMap[approverId]) {
            var rec = new GlideRecord("sysapproval_approver");
            rec.get(existingMap[approverId]);
            if (rec.state == "rejected") { rec.state = "requested"; rec.update(); }
        } else {
            var ar = new GlideRecord("sysapproval_approver");
            ar.initialize();
            ar.approver = approverId;
            ar.source_table = "u_pm_gates";
            ar.document_id = current.getUniqueValue();
            ar.sysapproval = current.getUniqueValue();
            ar.state = "requested";
            ar.insert();
        }
    }

    for (var exId in existingMap) {
        if (!finalSet[exId]) {
            var rr = new GlideRecord("sysapproval_approver");
            rr.get(existingMap[exId]);
            rr.state = "not_required";
            rr.update();
        }
    }
})(current, previous);
