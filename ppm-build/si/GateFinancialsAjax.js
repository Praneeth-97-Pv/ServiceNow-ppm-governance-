var GateFinancialsAjax = Class.create();
GateFinancialsAjax.prototype = Object.extendsObject(AbstractAjaxProcessor, {

    getProjectFinancials: function() {
        return JSON.stringify(this.buildPayload(this.getParameter("sysparm_project")));
    },

    // M0 lives on the demand, so the client script asks for demand financials instead
    getDemandFinancials: function() {
        return JSON.stringify(this.buildDemandPayload(this.getParameter("sysparm_demand")));
    },

    // Who would be asked to approve, for the confirmation dialog on the Request Approval button.
    getApproverPreview: function() {
        var table = this.getParameter("sysparm_table") + "";
        var id = this.getParameter("sysparm_id") + "";
        var out = { approvers: [], error: "" };

        var calc = new ApproverMatrixCalculator();
        var ids = [];
        if (table == "u_pm_gates") { ids = calc.getFinalApproversForGateRecord(id); }
        else if (table == "project_change_request") { ids = calc.getFinalApprovers(id); }
        else if (table == "dmn_demand") { ids = calc.getFinalApproversForDemand(id); }
        else { out.error = "Unsupported table: " + table; return JSON.stringify(out); }

        for (var i = 0; i < ids.length; i++) {
            var u = new GlideRecord("sys_user");
            if (u.get(ids[i])) { out.approvers.push(u.getValue("name")); }
        }
        out.approvers.sort();
        return JSON.stringify(out);
    },

    // Callable from client (Ajax) and from Business Rules alike
    buildPayload: function(projectId) {
        var result = {
            fy_approved_budget: "",
            total_approved_budget: "",
            phase: "",
            total_incurred_cost: 0,
            total_remaining_cost: 0,
            fy_incurred_cost: 0,
            fy_remaining_cost: 0
        };
        if (!projectId) { return result; }

        var gr = new GlideRecord("pm_project");
        if (!gr.get(projectId)) { return result; }

        result.fy_approved_budget    = this._num(gr.getValue("u_fy_approved_budget"));
        result.total_approved_budget = this._num(gr.getValue("u_total_approved_budget"));
        result.phase                 = gr.getValue("phase") || "";

        // Full scope: every task-type breakdown on the project
        var full = this._sumBreakdowns(projectId, "");
        result.total_incurred_cost  = full.actual;
        result.total_remaining_cost = full.etc;

        // Current fiscal year only
        var fy = this._currentFiscalYear();
        if (fy) {
            var scoped = this._sumBreakdowns(projectId, fy);
            result.fy_incurred_cost  = scoped.actual;
            result.fy_remaining_cost = scoped.etc;
        }

        // Fall back to the platform actual cost rollup if no breakdown actuals
        if (result.total_incurred_cost === 0) {
            result.total_incurred_cost = parseFloat(this._num(gr.getValue("work_cost"))) || 0;
        }

        return result;
    },

    // Demand equivalent. dmn_demand extends task, so its cost plan breakdowns hang off the
    // same task reference and _sumBreakdowns is reused unchanged. There is no work_cost
    // rollup on dmn_demand, so no fallback is available.
    buildDemandPayload: function(demandId) {
        var result = {
            fy_approved_budget: "",
            total_approved_budget: "",
            project_type: "",
            portfolio: "",
            total_incurred_cost: 0,
            total_remaining_cost: 0,
            fy_incurred_cost: 0,
            fy_remaining_cost: 0
        };
        if (!demandId) { return result; }

        var gr = new GlideRecord("dmn_demand");
        if (!gr.get(demandId)) { return result; }

        result.fy_approved_budget    = this._num(gr.getValue("u_fy_approved_budget"));
        result.total_approved_budget = this._num(gr.getValue("u_total_approved_budget"));
        result.project_type          = gr.getValue("u_project_type") || "";
        result.portfolio             = gr.getValue("portfolio") || "";

        var full = this._sumBreakdowns(demandId, "");
        result.total_incurred_cost  = full.actual;
        result.total_remaining_cost = full.etc;

        var fy = this._currentFiscalYear();
        if (fy) {
            var scoped = this._sumBreakdowns(demandId, fy);
            result.fy_incurred_cost  = scoped.actual;
            result.fy_remaining_cost = scoped.etc;
        }

        return result;
    },

    // breakdown_type=task avoids double counting the mirrored requirement rows
    _sumBreakdowns: function(taskId, fiscalYearId) {
        var out = { actual: 0, etc: 0 };
        var b = new GlideRecord("cost_plan_breakdown");
        b.addQuery("task", taskId);
        b.addQuery("breakdown_type", "task");
        if (fiscalYearId) { b.addQuery("fiscal_period.fiscal_year", fiscalYearId); }
        b.query();
        while (b.next()) {
            out.actual += parseFloat(b.getValue("actual") || 0) || 0;
            out.etc    += parseFloat(b.getValue("estimate_to_completion") || 0) || 0;
        }
        return out;
    },

    _currentFiscalYear: function() {
        var now = new GlideDateTime();
        var fp = new GlideRecord("fiscal_period");
        fp.addQuery("fiscal_start_date_time", "<=", now);
        fp.addQuery("fiscal_end_date_time", ">=", now);
        fp.query();
        while (fp.next()) {
            var fy = fp.getValue("fiscal_year");
            if (fy) { return fy; }
        }
        return "";
    },

    // Currency values store as "USD;1000.00"
    _num: function(raw) {
        var s = (raw || "") + "";
        if (s.indexOf(";") > -1) { s = s.split(";")[1]; }
        return s;
    },

    type: "GateFinancialsAjax"
});
