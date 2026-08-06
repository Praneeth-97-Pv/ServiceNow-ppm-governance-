// Guide section 3 — label renames and dictionary flags. Verbatim from the document.

function updateLabel(tableName, elementName, newLabel) {
    var d = new GlideRecord("sys_dictionary");
    d.addQuery("name", tableName);
    d.addQuery("element", elementName);
    d.query();
    if (d.next()) {
        d.column_label = newLabel;
        d.update();
        gs.print("LABEL: " + elementName + " -> " + newLabel);
    } else {
        gs.print("NOT FOUND: " + tableName + "." + elementName);
    }
}

gs.print("=== 3.1 label renames ===");
updateLabel("project_change_request", "u_last_approved_budget", "Last Approved FY Budget");
updateLabel("project_change_request", "u_incurred_cost_to_date", "FY Incurred Cost to Date");
updateLabel("project_change_request", "u_requested_budget", "FY Requested Budget");
updateLabel("u_pm_gates", "u_incurred_cost", "FY Incurred Cost");
updateLabel("u_pm_gates", "u_remaining_cost", "FY Remaining Cost");

function setDictionary(element, readOnly, defaultValue) {
    var d = new GlideRecord("sys_dictionary");
    d.addQuery("name", "u_pm_gates");
    d.addQuery("element", element);
    d.query();
    if (!d.next()) { gs.print("NOT FOUND: " + element); return; }
    d.read_only = readOnly;
    if (defaultValue !== null) { d.default_value = defaultValue; }
    d.update();
    gs.print(element + " read_only=" + readOnly +
             (defaultValue !== null ? " default=" + defaultValue : ""));
}

gs.print("");
gs.print("=== 3.2 read-only and defaults on u_pm_gates ===");
setDictionary("u_parent", true, null);
setDictionary("u_phase", true, null);
setDictionary("u_state", true, "open");
setDictionary("u_fy_approved_budget", true, null);
