// Guide section 4 — two-column form sections.
// u_pm_gates is a new table with no sections yet, so they are created first.

// ---------- 4.1 Reusable layout builder (verbatim from the guide) ----------
function buildSection(sectionId, tableName, layout) {
    var planned = {};
    layout.forEach(function (row) {
        row.forEach(function (f) { if (f) { planned[f] = true; } });
    });

    var existing = [];
    var scan = new GlideRecord("sys_ui_element");
    scan.addQuery("sys_ui_section", sectionId);
    scan.orderBy("position");
    scan.query();
    while (scan.next()) {
        var e = scan.getValue("element") + "";
        if (e && e.charAt(0) != ".") { existing.push(e); }
    }
    var orphans = existing.filter(function (f) { return !planned[f]; });
    gs.print("  Existing: " + (existing.join(", ") || "none"));
    gs.print("  Not in plan (appended): " + (orphans.length ? orphans.join(", ") : "none"));

    var wipe = new GlideRecord("sys_ui_element");
    wipe.addQuery("sys_ui_section", sectionId);
    wipe.query();
    while (wipe.next()) { wipe.deleteRecord(); }

    function addEl(type, element, pos) {
        var el = new GlideRecord("sys_ui_element");
        el.initialize();
        el.sys_ui_section = sectionId;
        el.name = tableName;
        el.type = type;
        el.element = element;
        el.position = pos;
        el.insert();
    }

    var pos = 0;
    layout.forEach(function (row) {
        if (row[1]) {
            addEl(".begin_split", ".begin_split", pos++);
            addEl("field", row[0], pos++);
            addEl(".split", ".split", pos++);
            addEl("field", row[1], pos++);
            addEl(".end_split", ".end_split", pos++);
        } else {
            addEl("field", row[0], pos++);
        }
    });
    orphans.forEach(function (f) { addEl("field", f, pos++); });
    gs.print("  Rebuilt with " + pos + " elements");
}

// ---------- helpers to create missing sections / forms ----------
function getSection(table, caption) {
    var s = new GlideRecord("sys_ui_section");
    s.addQuery("name", table);
    s.addQuery("caption", caption);
    s.query();
    if (s.next()) { return s.getUniqueValue(); }
    return null;
}

function createSection(table, caption, view) {
    var existing = getSection(table, caption);
    if (existing) { gs.print("  section exists: " + caption + " -> " + existing); return existing; }
    var s = new GlideRecord("sys_ui_section");
    s.initialize();
    s.name = table;
    s.caption = caption;
    s.title = caption;
    if (view) { s.view = view; }
    var id = s.insert();
    gs.print("  section CREATED: " + caption + " -> " + id);
    return id;
}

function getOrCreateForm(table, view) {
    var f = new GlideRecord("sys_ui_form");
    f.addQuery("name", table);
    if (view) { f.addQuery("view", view); } else { f.addNullQuery("view"); }
    f.query();
    if (f.next()) { gs.print("  form exists: " + f.getUniqueValue()); return f.getUniqueValue(); }
    var n = new GlideRecord("sys_ui_form");
    n.initialize();
    n.name = table;
    if (view) { n.view = view; }
    var id = n.insert();
    gs.print("  form CREATED: " + id);
    return id;
}

function linkSection(formId, sectionId, position) {
    var fs = new GlideRecord("sys_ui_form_section");
    fs.addQuery("sys_ui_form", formId);
    fs.addQuery("sys_ui_section", sectionId);
    fs.query();
    if (fs.next()) {
        fs.position = position;
        fs.update();
        gs.print("  link updated: pos " + position);
        return;
    }
    var n = new GlideRecord("sys_ui_form_section");
    n.initialize();
    n.sys_ui_form = formId;
    n.sys_ui_section = sectionId;
    n.position = position;
    n.insert();
    gs.print("  link created: pos " + position);
}

// Reuse whatever view the existing PCR default section uses.
var DEFAULT_VIEW = "";
var probe = new GlideRecord("sys_ui_section");
probe.addQuery("name", "project_change_request");
probe.query();
if (probe.next()) { DEFAULT_VIEW = probe.getValue("view") || ""; }
gs.print("Default view: [" + DEFAULT_VIEW + "]");

// ================= u_pm_gates =================
gs.print("");
gs.print("===== u_pm_gates sections =====");
var gateHeader = createSection("u_pm_gates", "Gate", DEFAULT_VIEW);
var gateDetails = createSection("u_pm_gates", "Gate Details", DEFAULT_VIEW);
var gateForm = getOrCreateForm("u_pm_gates", DEFAULT_VIEW);
linkSection(gateForm, gateHeader, 0);
linkSection(gateForm, gateDetails, 1);

gs.print("");
gs.print("--- 4.3 Gate header ---");
buildSection(gateHeader, "u_pm_gates", [
    ["u_number",               "u_gate_type"],
    ["u_parent",               "u_phase"],
    ["u_state",                "u_approval"],
    ["u_title",                null],
    ["u_description",          null],
    ["u_additional_approvers", "u_approval_not_required"]
]);

gs.print("");
gs.print("--- 4.4 Gate Details ---");
buildSection(gateDetails, "u_pm_gates", [
    ["u_p0_date",                "u_p1_date"],
    ["u_p2a_date",               "u_p2b_date"],
    ["u_p3_date",                "u_fy_approved_budget"],
    ["u_incurred_cost",          "u_remaining_cost"],
    ["u_cumulative_revenue",     "u_cumulative_rd_investment"],
    ["u_cumulative_adj_ebitda",  "u_npv"],
    ["u_total_approved_budget",  "u_total_incurred_cost"],
    ["u_total_remaining_cost",   "u_dpp"]
]);

// ================= project_change_request =================
gs.print("");
gs.print("===== project_change_request sections =====");
var pcrHeader = null;
var ph = new GlideRecord("sys_ui_section");
ph.addQuery("name", "project_change_request");
ph.query();
if (ph.next()) { pcrHeader = ph.getUniqueValue(); gs.print("  header section: " + pcrHeader); }

var pcrDetails = createSection("project_change_request", "PCR Details", DEFAULT_VIEW);
var pcrForm = getOrCreateForm("project_change_request", DEFAULT_VIEW);
if (pcrHeader) { linkSection(pcrForm, pcrHeader, 0); }
linkSection(pcrForm, pcrDetails, 1);

gs.print("");
gs.print("--- 4.5 PCR Details ---");
buildSection(pcrDetails, "project_change_request", [
    ["u_p0_date",                     "u_p1_date"],
    ["u_p2a_date",                    "u_p2b_date"],
    ["u_p3_date",                     "u_last_approved_budget"],
    ["u_requested_budget",            "u_incurred_cost_to_date"],
    ["u_cumulative_revenue",          "u_cumulative_rd_investment"],
    ["u_cumulative_adj_ebitda",       "u_npv"],
    ["u_total_approved_budget",       "u_total_incurred_cost_to_date"],
    ["u_total_requested_budget",      "u_dpp"]
]);

// ---------- 4.7 Approvers related list ----------
function addApproversRelatedList(tableName) {
    var rl = new GlideRecord("sys_ui_related_list");
    rl.addQuery("name", tableName);
    rl.query();
    var found = false;
    while (rl.next()) {
        found = true;
        var dupe = new GlideRecord("sys_ui_related_list_entry");
        dupe.addQuery("list_id", rl.sys_id);
        dupe.addQuery("related_list", "sysapproval_approver.sysapproval");
        dupe.query();
        if (dupe.next()) { gs.print("  " + tableName + " [" + rl.view.getDisplayValue() + "] already present"); continue; }

        var maxPos = 0;
        var e = new GlideRecord("sys_ui_related_list_entry");
        e.addQuery("list_id", rl.sys_id);
        e.query();
        while (e.next()) {
            var pp = parseInt(e.getValue("position")) || 0;
            if (pp > maxPos) { maxPos = pp; }
        }
        var neu = new GlideRecord("sys_ui_related_list_entry");
        neu.initialize();
        neu.list_id = rl.sys_id;
        neu.related_list = "sysapproval_approver.sysapproval";
        neu.position = maxPos + 1;
        gs.print("  " + tableName + " [" + rl.view.getDisplayValue() + "] added: " + neu.insert());
    }
    if (!found) {
        // No related list record yet — create one for the default view.
        var n = new GlideRecord("sys_ui_related_list");
        n.initialize();
        n.name = tableName;
        var listId = n.insert();
        var entry = new GlideRecord("sys_ui_related_list_entry");
        entry.initialize();
        entry.list_id = listId;
        entry.related_list = "sysapproval_approver.sysapproval";
        entry.position = 0;
        gs.print("  " + tableName + " related list CREATED: " + listId + " entry " + entry.insert());
    }
}

gs.print("");
gs.print("--- 4.7 Approvers related list ---");
addApproversRelatedList("u_pm_gates");
addApproversRelatedList("project_change_request");

gs.print("");
gs.print("DONE");
