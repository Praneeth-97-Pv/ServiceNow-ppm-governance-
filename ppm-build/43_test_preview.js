#!/usr/bin/env node
/**
 * Exercise the client-callable path the section 6 client scripts use:
 * POST /xmlhttp.do -> GateFinancialsAjax.getProjectFinancials
 *
 * This is the same request GlideAjax issues from the browser, so it proves the
 * Script Include is reachable as a client processor (not just callable server-side).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0 && !(t.slice(0, i).trim() in process.env)) {
    process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const BASE = process.env.SERVICENOW_INSTANCE_URL.replace(/\/+$/, '');
const jar = new Map();

function absorb(headers) {
  const list =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') || '').split(/,\s*(?=[A-Za-z0-9_\-.]+=)/).filter(Boolean);
  for (const c of list) {
    const pair = c.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

function token(html) {
  for (const tag of html.match(/<input\b[^>]*>/gi) || []) {
    if (/name\s*=\s*["']sysparm_ck["']/i.test(tag)) {
      const m = tag.match(/value\s*=\s*["']([^"']+)["']/i);
      if (m) return m[1];
    }
  }
  const g = html.match(/var\s+g_ck\s*=\s*['"]([^'"]+)['"]/);
  return g ? g[1] : null;
}

(async () => {
  // Form login — the same flow the MCP server uses for background scripts.
  let res = await fetch(`${BASE}/login.do`, { redirect: 'manual' });
  absorb(res.headers);
  const ck = token(await res.text());

  res = await fetch(`${BASE}/login.do`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: cookie(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      user_name: process.env.SERVICENOW_USERNAME,
      user_password: process.env.SERVICENOW_PASSWORD,
      sysparm_ck: ck,
      not_important: '',
      sys_action: 'sysverb_login',
    }).toString(),
  });
  absorb(res.headers);
  console.log('login: HTTP ' + res.status);

  // Fresh token from an authenticated page
  const page = await fetch(`${BASE}/sys.scripts.do`, { headers: { Cookie: cookie() } });
  absorb(page.headers);
  const userToken = token(await page.text());

  console.log('=== getApproverPreview (what the button calls) ===');
  const cases = [
    { table: 'dmn_demand', id: '0adc9ea6db40481025c85a35dc9619e8', label: 'M0 (demand DMND0001141)' },
    { table: 'u_pm_gates', id: '52470e6383de4b10b5ea5e65eeaad3ce', label: 'Gate (initiating)' },
  ];

  for (const c of cases) {
    const body = new URLSearchParams({
      sysparm_processor: 'GateFinancialsAjax',
      sysparm_name: 'getApproverPreview',
      sysparm_scope: 'global',
      sysparm_table: c.table,
      sysparm_id: c.id,
      sysparm_want_session_messages: 'true',
    });
    const res2 = await fetch(`${BASE}/xmlhttp.do`, {
      method: 'POST',
      headers: {
        Cookie: cookie(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-UserToken': userToken,
        Accept: 'application/xml',
      },
      body: body.toString(),
    });
    const xml = await res2.text();
    const m = xml.match(/answer="([^"]*)"/) || xml.match(/<answer>([\s\S]*?)<\/answer>/);
    if (!m) { console.log(`${c.label}: NO ANSWER -> ${xml.slice(0, 300)}`); continue; }
    const decoded = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const data = JSON.parse(decoded);
    const ok = Array.isArray(data.approvers) && data.approvers.length > 0 && !data.error;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.label}`);
    console.log(`        approvers: ${(data.approvers || []).join(', ') || '(none)'}${data.error ? ' error=' + data.error : ''}`);
  }
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
