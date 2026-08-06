(function executeRule(current, previous) {

    // Rolls individual approver decisions up onto the parent record's approval field.
    // The PPM guide generates sysapproval_approver records but never consumes them, so
    // without this nothing ever moves a Gate, Change Request or Demand out of "requested".
    var FIELD_BY_TABLE = {
        'u_pm_gates': 'u_approval',
        'project_change_request': 'approval',
        'dmn_demand': 'approval'
    };

    var table = current.source_table + '';
    var field = FIELD_BY_TABLE[table];
    if (!field) { return; }

    var docId = current.document_id + '';
    if (!docId) { return; }

    var parent = new GlideRecord(table);
    if (!parent.get(docId)) { return; }

    // Only act while the parent is actually awaiting a decision.
    if ((parent.getValue(field) + '') != 'requested') { return; }

    function countBy(state) {
        var a = new GlideAggregate('sysapproval_approver');
        a.addQuery('document_id', docId);
        a.addQuery('source_table', table);
        a.addQuery('state', state);
        a.addAggregate('COUNT');
        a.query();
        a.next();
        return parseInt(a.getAggregate('COUNT')) || 0;
    }

    var rejected = countBy('rejected');
    var pending  = countBy('requested');

    if (rejected > 0) {
        parent.setValue(field, 'rejected');
    } else if (pending === 0 && countBy('approved') > 0) {
        parent.setValue(field, 'approved');
    } else {
        return;
    }

    parent.update();
    gs.info('Approval rollup: ' + table + '/' + docId + ' -> ' + parent.getValue(field));

})(current, previous);
