// M0 Details form section on dmn_demand (Default view), plus the Approvers related list.
// Also removes the fields the platform auto-appended to the demand's default section.

var TABLE = 'dmn_demand';

function buildSection(sectionId, tableName, layout) {
    var planned = {};
    layout.forEach(function (row) { row.forEach(function (f) { if (f) { planned[f] = true; } }); });

    var existing = [];
    var scan = new GlideRecord('sys_ui_element');
    scan.addQuery('sys_ui_section', sectionId);
    scan.orderBy('position');
    scan.query();
    while (scan.next()) {
        var e = scan.getValue('element') + '';
        if (e && e.charAt(0) != '.') { existing.push(e); }
    }
    var orphans = existing.filter(function (f) { return !planned[f]; });
    gs.print('  existing: ' + (existing.join(', ') || 'none'));
    gs.print('  appended (not in plan): ' + (orphans.length ? orphans.join(', ') : 'none'));

    var wipe = new GlideRecord('sys_ui_element');
    wipe.addQuery('sys_ui_section', sectionId);
    wipe.query();
    while (wipe.next()) { wipe.deleteRecord(); }

    function addEl(type, element, pos) {
        var el = new GlideRecord('sys_ui_element');
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
            addEl('.begin_split', '.begin_split', pos++);
            addEl('field', row[0], pos++);
            addEl('.split', '.split', pos++);
            addEl('field', row[1], pos++);
            addEl('.end_split', '.end_split', pos++);
        } else {
            addEl('field', row[0], pos++);
        }
    });
    orphans.forEach(function (f) { addEl('field', f, pos++); });
    gs.print('  rebuilt with ' + pos + ' elements');
}

// ---- locate the Default view ----
var DEFAULT_VIEW = '';
var probe = new GlideRecord('sys_ui_section');
probe.addQuery('name', TABLE);
probe.addQuery('caption', 'Details');
probe.query();
while (probe.next()) {
    if (probe.view.getDisplayValue() + '' === 'Default view') { DEFAULT_VIEW = probe.getValue('view'); break; }
}
gs.print('Default view: [' + DEFAULT_VIEW + ']');

// ---- create the M0 Details section ----
gs.print('');
gs.print('===== M0 Details section =====');
var m0Section = null;
var s = new GlideRecord('sys_ui_section');
s.addQuery('name', TABLE);
s.addQuery('caption', 'M0 Details');
s.query();
if (s.next()) { m0Section = s.getUniqueValue(); gs.print('  exists -> ' + m0Section); }
else {
    var n = new GlideRecord('sys_ui_section');
    n.initialize();
    n.name = TABLE;
    n.caption = 'M0 Details';
    n.title = 'M0 Details';
    if (DEFAULT_VIEW) { n.view = DEFAULT_VIEW; }
    m0Section = n.insert();
    gs.print('  CREATED -> ' + m0Section);
}

buildSection(m0Section, TABLE, [
    ['u_p0_date',                'u_p1_date'],
    ['u_p2a_date',               'u_p2b_date'],
    ['u_p3_date',                'u_fy_approved_budget'],
    ['u_incurred_cost',          'u_remaining_cost'],
    ['u_cumulative_revenue',     'u_cumulative_rd_investment'],
    ['u_cumulative_adj_ebitda',  'u_npv'],
    ['u_total_approved_budget',  'u_total_incurred_cost'],
    ['u_total_remaining_cost',   'u_dpp']
]);

// ---- link it onto the Default view form ----
gs.print('');
gs.print('===== form section link =====');
var formId = null;
var f = new GlideRecord('sys_ui_form');
f.addQuery('name', TABLE);
if (DEFAULT_VIEW) { f.addQuery('view', DEFAULT_VIEW); } else { f.addNullQuery('view'); }
f.query();
if (f.next()) { formId = f.getUniqueValue(); gs.print('  form exists -> ' + formId); }
else {
    var nf = new GlideRecord('sys_ui_form');
    nf.initialize();
    nf.name = TABLE;
    if (DEFAULT_VIEW) { nf.view = DEFAULT_VIEW; }
    formId = nf.insert();
    gs.print('  form CREATED -> ' + formId);
}

var maxPos = 0;
var fs = new GlideRecord('sys_ui_form_section');
fs.addQuery('sys_ui_form', formId);
fs.query();
gs.print('  existing sections on form: ' + fs.getRowCount());
while (fs.next()) {
    var pp = parseInt(fs.getValue('position')) || 0;
    if (pp > maxPos) { maxPos = pp; }
}
var link = new GlideRecord('sys_ui_form_section');
link.addQuery('sys_ui_form', formId);
link.addQuery('sys_ui_section', m0Section);
link.query();
if (link.next()) { gs.print('  already linked at pos ' + link.getValue('position')); }
else {
    var nl = new GlideRecord('sys_ui_form_section');
    nl.initialize();
    nl.sys_ui_form = formId;
    nl.sys_ui_section = m0Section;
    nl.position = maxPos + 1;
    gs.print('  linked at pos ' + (maxPos + 1) + ' -> ' + nl.insert());
}

// ---- remove auto-appended duplicates from every other demand section ----
gs.print('');
gs.print('===== removing auto-appended duplicates =====');
var owned = {};
var o = new GlideRecord('sys_ui_element');
o.addQuery('sys_ui_section', m0Section);
o.query();
while (o.next()) {
    var ov = o.getValue('element') + '';
    if (ov && ov.charAt(0) != '.') { owned[ov] = true; }
}

// These stay on the main form alongside approval, mirroring the Gate header.
var KEEP_ON_HEADER = { u_project_type: true, u_m0_state: true,
                       u_additional_approvers: true, u_approval_not_required: true };

var removed = 0;
var secs = new GlideRecord('sys_ui_section');
secs.addQuery('name', TABLE);
secs.query();
while (secs.next()) {
    if (secs.getUniqueValue() == m0Section) { continue; }
    var els = new GlideRecord('sys_ui_element');
    els.addQuery('sys_ui_section', secs.getUniqueValue());
    els.query();
    while (els.next()) {
        var el = els.getValue('element') + '';
        if (owned[el] && !KEEP_ON_HEADER[el]) {
            els.deleteRecord();
            removed++;
        }
    }
}
gs.print('  removed ' + removed + ' duplicated element(s)');

// ---- Approvers related list ----
gs.print('');
gs.print('===== Approvers related list =====');
var rl = new GlideRecord('sys_ui_related_list');
rl.addQuery('name', TABLE);
rl.query();
var any = false;
while (rl.next()) {
    any = true;
    var view = rl.view.getDisplayValue() || '(default)';
    var dupe = new GlideRecord('sys_ui_related_list_entry');
    dupe.addQuery('list_id', rl.getUniqueValue());
    dupe.addQuery('related_list', 'sysapproval_approver.sysapproval');
    dupe.query();
    if (dupe.next()) { gs.print('  ' + view + ': already present'); continue; }
    var mp = 0;
    var ee = new GlideRecord('sys_ui_related_list_entry');
    ee.addQuery('list_id', rl.getUniqueValue());
    ee.query();
    while (ee.next()) { var q = parseInt(ee.getValue('position')) || 0; if (q > mp) { mp = q; } }
    var ne = new GlideRecord('sys_ui_related_list_entry');
    ne.initialize();
    ne.list_id = rl.getUniqueValue();
    ne.related_list = 'sysapproval_approver.sysapproval';
    ne.position = mp + 1;
    gs.print('  ' + view + ': added -> ' + ne.insert());
}
if (!any) {
    var nrl = new GlideRecord('sys_ui_related_list');
    nrl.initialize();
    nrl.name = TABLE;
    var listId = nrl.insert();
    var entry = new GlideRecord('sys_ui_related_list_entry');
    entry.initialize();
    entry.list_id = listId;
    entry.related_list = 'sysapproval_approver.sysapproval';
    entry.position = 0;
    gs.print('  related list CREATED -> ' + listId + ' entry ' + entry.insert());
}

// ---- duplicate re-check ----
gs.print('');
gs.print('===== duplicate re-check =====');
var seen = {};
var chk = new GlideRecord('sys_ui_section');
chk.addQuery('name', TABLE);
chk.query();
while (chk.next()) {
    var ce = new GlideRecord('sys_ui_element');
    ce.addQuery('sys_ui_section', chk.getUniqueValue());
    ce.query();
    while (ce.next()) {
        var cv = ce.getValue('element') + '';
        if (!cv || cv.charAt(0) == '.') { continue; }
        var key = chk.getValue('view') + '|' + cv;
        seen[key] = (seen[key] || 0) + 1;
    }
}
var dupes = [];
for (var k in seen) { if (seen[k] > 1) { dupes.push(k.split('|')[1] + ' x' + seen[k]); } }
gs.print('  ' + TABLE + ': ' + (dupes.length ? dupes.join(', ') : 'no duplicates'));
