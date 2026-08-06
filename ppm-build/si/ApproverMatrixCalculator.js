var ApproverMatrixCalculator = Class.create();
ApproverMatrixCalculator.prototype = {
    initialize: function() {},

    // ---------- CHANGE REQUEST ----------
    getFinalApprovers: function(pcrSysId) {
        var pcr = new GlideRecord("project_change_request");
        if (!pcr.get(pcrSysId)) {
            gs.error("ApproverMatrixCalculator: PCR not found - " + pcrSysId);
            return [];
        }
        var project = new GlideRecord("pm_project");
        if (!pcr.parent || !project.get(pcr.parent)) {
            gs.error("ApproverMatrixCalculator: Parent project not found - " + pcrSysId);
            return [];
        }
        var projectType = project.u_project_type + "";
        var portfolio = project.primary_portfolio + "";
        if (!projectType || !portfolio) {
            gs.warn("ApproverMatrixCalculator: Project Type or Portfolio not set - " + project.getUniqueValue());
            return [];
        }

        // PCR rows carry no phase
        var approverSet = this._lookup(projectType, portfolio, null);
        this._applyOverrides(approverSet, pcr);
        return this._toArray(approverSet);
    },

    // ---------- GATE ----------
    getFinalApproversForGateRecord: function(gateSysId) {
        var gate = new GlideRecord("u_pm_gates");
        if (!gate.get(gateSysId)) {
            gs.error("ApproverMatrixCalculator: Gate not found - " + gateSysId);
            return [];
        }
        var project = new GlideRecord("pm_project");
        if (!gate.u_parent || !project.get(gate.u_parent)) {
            gs.error("ApproverMatrixCalculator: Parent project not found - " + gateSysId);
            return [];
        }
        var projectType = project.u_project_type + "";
        var portfolio = project.primary_portfolio + "";
        var phase = gate.u_phase + "";
        if (!projectType || !portfolio || !phase) {
            gs.warn("ApproverMatrixCalculator: Missing type, portfolio, or phase - " + gateSysId);
            return [];
        }

        var approverSet = this._lookup(projectType, portfolio, phase);
        this._applyOverrides(approverSet, gate);
        return this._toArray(approverSet);
    },

    // ---------- M0 (DEMAND) ----------
    // M0 lives on the demand itself. Type and portfolio come straight off the demand,
    // and M0 matrix rows are keyed on the reserved phase value "m0".
    getFinalApproversForDemand: function(demandSysId) {
        var demand = new GlideRecord("dmn_demand");
        if (!demand.get(demandSysId)) {
            gs.error("ApproverMatrixCalculator: Demand not found - " + demandSysId);
            return [];
        }
        var projectType = demand.u_project_type + "";
        var portfolio = demand.portfolio + "";
        if (!projectType || !portfolio) {
            gs.warn("ApproverMatrixCalculator: Project Type or Portfolio not set on demand - " + demandSysId);
            return [];
        }

        var approverSet = this._lookup(projectType, portfolio, "m0");
        this._applyOverrides(approverSet, demand);
        return this._toArray(approverSet);
    },

    // ---------- shared ----------
    _lookup: function(projectType, portfolio, phase) {
        var approverSet = {};
        var matrix = new GlideRecord("u_approver_matrix");
        matrix.addQuery("u_project_type", projectType);
        matrix.addQuery("u_portfolio", portfolio);
        if (phase) { matrix.addQuery("u_phase", phase); }
        else { matrix.addNullQuery("u_phase"); }
        matrix.addQuery("u_active", true);
        matrix.query();
        while (matrix.next()) {
            approverSet[matrix.u_approver + ""] = true;
        }
        return approverSet;
    },

    _applyOverrides: function(approverSet, record) {
        var notRequired = (record.u_approval_not_required + "").split(",");
        for (var i = 0; i < notRequired.length; i++) {
            if (notRequired[i]) { delete approverSet[notRequired[i]]; }
        }
        var additional = (record.u_additional_approvers + "").split(",");
        for (var j = 0; j < additional.length; j++) {
            if (additional[j]) { approverSet[additional[j]] = true; }
        }
    },

    _toArray: function(approverSet) {
        var out = [];
        for (var sysId in approverSet) { out.push(sysId); }
        return out;
    },

    type: "ApproverMatrixCalculator"
};
