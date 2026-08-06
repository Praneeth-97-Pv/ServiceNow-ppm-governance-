// Guide 4.2 — finding the section sys_ids
["u_pm_gates", "project_change_request"].forEach(function (t) {
    gs.print("=== " + t + " ===");
    var s = new GlideRecord("sys_ui_section");
    s.addQuery("name", t);
    s.query();
    while (s.next()) {
        var n = new GlideAggregate('sys_ui_element');
        n.addQuery('sys_ui_section', s.getUniqueValue()); n.addAggregate('COUNT'); n.query(); n.next();
        gs.print("  " + s.getUniqueValue() + " | caption=[" + s.getValue("caption") + "]" +
                 " | view=" + s.view.getDisplayValue() + " | elements=" + n.getAggregate('COUNT'));
    }
    gs.print("  -- forms (sys_ui_form) --");
    var f = new GlideRecord('sys_ui_form');
    f.addQuery('name', t); f.query();
    while (f.next()) {
        gs.print("  FORM " + f.getUniqueValue() + " | view=" + f.view.getDisplayValue());
        var fs = new GlideRecord('sys_ui_form_section');
        fs.addQuery('sys_ui_form', f.getUniqueValue()); fs.orderBy('position'); fs.query();
        while (fs.next()) {
            gs.print("     pos=" + fs.getValue('position') + " section=" + fs.getValue('sys_ui_section'));
        }
    }
});
