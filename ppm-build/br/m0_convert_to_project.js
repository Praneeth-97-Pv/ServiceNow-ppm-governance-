(function executeRule(current, previous) {

    // On full M0 approval the demand becomes a project, using the same OOB helper the
    // "Create Project" UI action calls. The helper copies the standard field set, maps
    // portfolio -> primary_portfolio, links demand.project and advances the demand state.
    if (!current.approval.changesTo('approved')) { return; }

    var demandId = current.getUniqueValue();

    if ((current.type + '') != 'project') {
        gs.warn('M0 approved but demand type is not Project - no conversion. Demand ' + demandId);
        return;
    }
    if (!current.project.nil()) {
        gs.warn('M0 approved but demand already linked to a project - no conversion. Demand ' + demandId);
        return;
    }

    var result;
    try {
        result = new DemandToProjectCreationHelper().createProject(demandId, 'pm_project');
    } catch (e) {
        gs.error('M0 conversion failed for demand ' + demandId + ': ' + e);
        gs.addErrorMessage('M0 approved, but project creation failed: ' + e);
        return;
    }

    if (!result || !result.sys_id) {
        var why = (result && result.error) ? result.error : 'helper returned no project';
        gs.error('M0 conversion produced no project for demand ' + demandId + ': ' + why);
        gs.addErrorMessage('M0 approved, but no project was created: ' + why);
        return;
    }

    // Carry the M0-specific fields the OOB helper does not know about.
    var project = new GlideRecord('pm_project');
    if (project.get(result.sys_id)) {
        project.u_project_type         = current.getValue('u_project_type');
        project.u_fy_approved_budget   = current.getValue('u_fy_approved_budget');
        project.u_total_approved_budget = current.getValue('u_total_approved_budget');
        project.update();
    }

    gs.info('M0 conversion: demand ' + current.getValue('number') + ' -> project ' + result.number);
    gs.addInfoMessage('M0 approved. Project ' + result.number + ' created from this demand.');

})(current, previous);
