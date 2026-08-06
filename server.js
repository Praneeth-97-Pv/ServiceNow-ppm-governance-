#!/usr/bin/env node
/**
 * ServiceNow MCP server — zero dependencies, stdio transport.
 *
 * Speaks JSON-RPC 2.0 over stdin/stdout (newline-delimited). Anything written
 * to stdout that is not a protocol message will break the client, so all
 * diagnostics go to stderr.
 *
 * Config comes from the environment or from a .env file next to this script.
 */

const fs = require('fs');
const path = require('path');

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'servicenow', version: '1.0.0' };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function isTruthy(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

/** Accepts `dev12345`, `dev12345.service-now.com`, or a full URL. */
function normalizeInstance(raw) {
  if (!raw) return null;
  let value = String(raw).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value)) {
    if (!value.includes('.')) value += '.service-now.com';
    value = 'https://' + value;
  }
  return value;
}

const CONFIG = {
  instance: normalizeInstance(
    process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_INSTANCE
  ),
  username: process.env.SERVICENOW_USERNAME,
  password: process.env.SERVICENOW_PASSWORD,
  readOnly: isTruthy(process.env.SERVICENOW_READ_ONLY, false),
  allowScripts: isTruthy(process.env.SERVICENOW_ALLOW_SCRIPTS, true),
  maxChars: Number(process.env.SERVICENOW_MAX_RESPONSE_CHARS || 40000),
  timeoutMs: Number(process.env.SERVICENOW_TIMEOUT_MS || 60000),
};

const PLACEHOLDER = /^(your-|<|CHANGE_?ME|xxx+$)/i;

function configProblem() {
  if (!CONFIG.instance) return 'SERVICENOW_INSTANCE_URL is not set.';
  if (!CONFIG.username) return 'SERVICENOW_USERNAME is not set.';
  if (!CONFIG.password) return 'SERVICENOW_PASSWORD is not set.';
  if (PLACEHOLDER.test(CONFIG.username) || PLACEHOLDER.test(CONFIG.password)) {
    return 'Credentials still contain placeholder values.';
  }
  return null;
}

const CONFIG_HELP = `Edit ${path.join(__dirname, '.env')} and set:
  SERVICENOW_INSTANCE_URL=https://devXXXXX.service-now.com
  SERVICENOW_USERNAME=admin
  SERVICENOW_PASSWORD=<your PDI admin password>`;

function authHeader() {
  const token = Buffer.from(`${CONFIG.username}:${CONFIG.password}`).toString('base64');
  return 'Basic ' + token;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

class SnError extends Error {}

/** A hibernating PDI serves an HTML page instead of the API. */
function detectHibernation(text) {
  return /hibernat/i.test(text) && /instance/i.test(text);
}

async function snFetch(pathname, { method = 'GET', query, body, headers = {}, raw = false } = {}) {
  const problem = configProblem();
  if (problem) throw new SnError(`${problem}\n\n${CONFIG_HELP}`);

  const url = new URL(pathname, CONFIG.instance);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const requestHeaders = {
    Authorization: authHeader(),
    Accept: raw ? '*/*' : 'application/json',
    ...headers,
  };
  let payload;
  if (body !== undefined) {
    if (typeof body === 'string') {
      payload = body;
    } else {
      payload = JSON.stringify(body);
      requestHeaders['Content-Type'] = 'application/json';
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: payload,
      signal: controller.signal,
      redirect: 'manual',
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new SnError(`Request to ${url.pathname} timed out after ${CONFIG.timeoutMs}ms.`);
    }
    throw new SnError(`Could not reach ${CONFIG.instance}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();

  if (raw) return { status: response.status, headers: response.headers, text };

  if (response.status === 401) {
    throw new SnError(
      'ServiceNow rejected the credentials (401). Check SERVICENOW_USERNAME / SERVICENOW_PASSWORD. ' +
        'PDI passwords reset when the instance is reclaimed.'
    );
  }
  if (response.status === 403) {
    throw new SnError(
      `ServiceNow denied access (403) to ${url.pathname}. The user likely lacks the required role, ` +
        'or an ACL blocks this table.'
    );
  }
  if (detectHibernation(text)) {
    throw new SnError(
      `The PDI at ${CONFIG.instance} appears to be hibernating. Wake it at ` +
        'https://developer.servicenow.com (Manage instance → Wake instance), then retry.'
    );
  }

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new SnError(
      `Expected JSON from ${url.pathname} but got a non-JSON response (HTTP ${response.status}). ` +
        `First 300 chars:\n${text.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    const detail = json && json.error ? `${json.error.message || ''} ${json.error.detail || ''}`.trim() : '';
    throw new SnError(`ServiceNow returned HTTP ${response.status} for ${url.pathname}. ${detail}`.trim());
  }

  return json;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toFieldList(value) {
  if (!value) return undefined;
  const list = Array.isArray(value) ? value : String(value).split(',');
  const cleaned = list.map((entry) => String(entry).trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(',') : undefined;
}

function clampLimit(value, fallback = 25, max = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function requireWrite(action) {
  if (CONFIG.readOnly) {
    throw new SnError(
      `Refusing to ${action}: this server is in read-only mode. ` +
        'Set SERVICENOW_READ_ONLY=false in .env to allow writes.'
    );
  }
}

function render(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (text.length <= CONFIG.maxChars) return text;
  return (
    text.slice(0, CONFIG.maxChars) +
    `\n\n…[truncated ${text.length - CONFIG.maxChars} more characters. ` +
    'Narrow the result with `fields`, a tighter `query`, or a smaller `limit`.]'
  );
}

/** Walks the table inheritance chain, base class last. */
async function tableHierarchy(table) {
  const chain = [];
  let current = table;
  for (let depth = 0; depth < 12 && current; depth++) {
    const result = await snFetch('/api/now/table/sys_db_object', {
      query: {
        sysparm_query: `name=${current}`,
        sysparm_fields: 'name,label,super_class',
        sysparm_limit: 1,
        sysparm_exclude_reference_link: 'true',
      },
    });
    const row = result.result && result.result[0];
    if (!row) break;
    chain.push({ name: row.name, label: row.label });
    const parent = row.super_class && typeof row.super_class === 'object'
      ? row.super_class.value
      : row.super_class;
    if (!parent) break;
    const parentRow = await snFetch('/api/now/table/sys_db_object', {
      query: {
        sysparm_query: `sys_id=${parent}`,
        sysparm_fields: 'name',
        sysparm_limit: 1,
        sysparm_exclude_reference_link: 'true',
      },
    });
    current = parentRow.result && parentRow.result[0] ? parentRow.result[0].name : null;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Background script execution (/sys.scripts.do)
// ---------------------------------------------------------------------------

/**
 * Basic auth does not create a UI session — /sys.scripts.do is a UI page, so it needs real
 * session cookies obtained through a form login. This jar holds them for the process lifetime.
 */
const session = { jar: new Map(), active: false };

function absorbCookies(headers) {
  let list;
  if (typeof headers.getSetCookie === 'function') {
    list = headers.getSetCookie();
  } else {
    const joined = headers.get('set-cookie');
    // Split only where a new `name=` pair begins, so `Expires=Tue, 01 Jan …` survives.
    list = joined ? joined.split(/,\s*(?=[A-Za-z0-9_\-.]+=)/) : [];
  }
  for (const cookie of list) {
    const pair = cookie.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) session.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader() {
  return [...session.jar].map(([key, value]) => `${key}=${value}`).join('; ');
}

/** Pulls sysparm_ck out of a hidden input (attribute order varies) or the g_ck global. */
function extractToken(html) {
  for (const tag of html.match(/<input\b[^>]*>/gi) || []) {
    if (/name\s*=\s*["']sysparm_ck["']/i.test(tag)) {
      const match = tag.match(/value\s*=\s*["']([^"']+)["']/i);
      if (match) return match[1];
    }
  }
  const global = html.match(/var\s+g_ck\s*=\s*['"]([^'"]+)['"]/);
  if (global) return global[1];
  const json = html.match(/"sysparm_ck"\s*:\s*"([^"]+)"/);
  if (json) return json[1];
  return null;
}

async function uiFetch(pathname, options = {}) {
  const url = new URL(pathname, CONFIG.instance);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      redirect: 'manual',
      signal: controller.signal,
      headers: { Cookie: cookieHeader(), ...(options.headers || {}) },
    });
    absorbCookies(response.headers);
    return { status: response.status, headers: response.headers, text: await response.text() };
  } catch (err) {
    if (err.name === 'AbortError') throw new SnError(`Request to ${pathname} timed out.`);
    throw new SnError(`Could not reach ${CONFIG.instance}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Logs in via /login.do so UI pages become reachable. */
async function ensureSession(force = false) {
  if (session.active && !force) return;
  session.jar.clear();
  session.active = false;

  const page = await uiFetch('/login.do');
  const token = extractToken(page.text);
  if (!token) {
    throw new SnError(
      `Could not read the login form at ${CONFIG.instance}/login.do (HTTP ${page.status}). ` +
        'If the instance uses SSO or MFA, form login is not possible — background scripts are unavailable.'
    );
  }

  const form = new URLSearchParams({
    user_name: CONFIG.username,
    user_password: CONFIG.password,
    sysparm_ck: token,
    not_important: '',
    sys_action: 'sysverb_login',
  });

  const result = await uiFetch('/login.do', {
    method: 'POST',
    body: form.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  // A successful login redirects; a failed one re-renders the form with an error.
  const redirected = result.status >= 300 && result.status < 400;
  if (!redirected || /login_failed|invalid|incorrect/i.test(result.headers.get('location') || '')) {
    throw new SnError(
      'Form login was rejected. The Table API credentials work, so this usually means the ' +
        'account must change its password on next login, or the instance requires MFA/SSO for UI access.'
    );
  }
  session.active = true;
}

function stripHtml(html) {
  const pre = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((m) => m[1]);
  const source = pre.length ? pre.join('\n') : html;
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function executeScript(script, { scope = 'global', recordForRollback = true } = {}) {
  const problem = configProblem();
  if (problem) throw new SnError(`${problem}\n\n${CONFIG_HELP}`);

  // Sessions expire; on a stale one the token vanishes, so log in again and retry once.
  let token = null;
  for (let attempt = 0; attempt < 2 && !token; attempt++) {
    await ensureSession(attempt > 0);
    const page = await uiFetch('/sys.scripts.do');
    if (detectHibernation(page.text)) {
      throw new SnError(`The PDI at ${CONFIG.instance} appears to be hibernating.`);
    }
    token = extractToken(page.text);
    if (!token) session.active = false;
  }

  if (!token) {
    throw new SnError(
      'Opened a session but /sys.scripts.do did not render the script form. The account needs the ' +
        '`admin` role for Scripts - Background. Everything else in this server still works.'
    );
  }

  const fields = {
    script,
    sysparm_ck: token,
    sys_scope: scope,
    runscript: 'Run script',
    quota_managed_transaction: 'on',
  };
  if (recordForRollback) fields.record_for_rollback = 'on';

  const run = await uiFetch('/sys.scripts.do', {
    method: 'POST',
    body: new URLSearchParams(fields).toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (detectHibernation(run.text)) {
    throw new SnError(`The PDI at ${CONFIG.instance} appears to be hibernating.`);
  }

  const output = stripHtml(run.text);
  return output || `Script ran (HTTP ${run.status}) but produced no output.`;
}

/**
 * Scripts - Background interleaves gs.print output with cache-flush chatter, slow-query SQL and
 * business-rule timings. Keep the script's own output plus anything that looks like a failure.
 */
const NOISE = [
  /^\[CacheFlushLog\]/,
  /^Time( to setup reverse map)?:/,
  /^(Creating|Altering|Adding|Duplicate) (table|storage|column|index|index\(es\))/i,
  /^Slow business rule /,
  /^DBUtil /,
  /^\[\d+:\d{2}:\d{2}\.\d+\]/,
  /^\[TableChunkCopier\]/,
  /^(GraphQL API|Replication is not enabled|UA Listener|LicensingTableCreateListener)/,
  /^(TableCreate|DBTable\.create|getStorageTable|Compiles:|Cache name:|Total (classes|loaders)|Interpreted compiles:|#+ Compiler Stats)/,
  /^SELECT /,
  /^Background message, type:info/,
];

const FAILURE = /(Exception|SyntaxError|TypeError|ReferenceError|is not defined|Evaluator:|Cannot (read|find)|java\.lang\.)/;
const STACK = /^(at |com\.glide|java\.base|java\.lang|org\.mozilla|jdk\.internal)/;
// Platform internals that arrive on the *** Script: channel rather than as plain log lines.
const PLATFORM_CHATTER = /^(Begin|End) ResourceSupport|^Dictionary reference length \(Business Rule\)/;

function filterScriptOutput(raw) {
  const lines = raw.split('\n');
  const printed = [];
  const problems = [];
  // A multi-line gs.print only prefixes its first line, so later lines must be carried through.
  let continuing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const marker = trimmed.match(/^\*\*\*\s*Script:\s?(.*)$/);
    if (marker) {
      continuing = !PLATFORM_CHATTER.test(marker[1]);
      if (continuing) printed.push(marker[1]);
      continue;
    }
    if (!trimmed) {
      if (continuing) printed.push('');
      continue;
    }
    if (NOISE.some((pattern) => pattern.test(trimmed)) || STACK.test(trimmed)) {
      continuing = false;
      continue;
    }
    if (FAILURE.test(trimmed)) {
      problems.push(trimmed);
      continuing = false;
      continue;
    }
    if (continuing) printed.push(trimmed);
  }

  // No gs.print output at all means something went wrong — show everything rather than nothing.
  if (!printed.length && !problems.length) return raw;

  let result = printed.join('\n');
  if (problems.length) {
    const unique = [...new Set(problems)].slice(0, 20);
    result += `\n\n--- warnings / errors (${problems.length}) ---\n${unique.join('\n')}`;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const READ_TOOLS = [
  {
    name: 'servicenow_query_table',
    description:
      'Query any ServiceNow table via the Table API. Use an encoded query string (the same ' +
      'syntax the list-view filter produces, e.g. "active=true^priority<=2^ORDERBYDESCsys_updated_on"). ' +
      'Works for every table: incident, change_request, sys_user, cmdb_ci, sys_script, sc_request, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name, e.g. "incident" or "sys_user".' },
        query: {
          type: 'string',
          description:
            'Encoded query, e.g. "active=true^priority=1". Omit to return all records. ' +
            'Operators: = != > < >= <= LIKE STARTSWITH ENDSWITH ISEMPTY ISNOTEMPTY IN NOT IN. ' +
            'Join with ^ (AND), ^OR (OR), ^NQ (new query).',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to return. Strongly recommended — omitting this returns every column.',
        },
        limit: { type: 'integer', description: 'Max records (default 25, max 1000).' },
        offset: { type: 'integer', description: 'Records to skip, for paging.' },
        order_by: { type: 'string', description: 'Field to sort by.' },
        order_desc: { type: 'boolean', description: 'Sort descending (default false).' },
        display_value: {
          type: 'string',
          enum: ['true', 'false', 'all'],
          description:
            '"true" (default) returns human-readable values, "false" returns raw values/sys_ids, ' +
            '"all" returns both.',
        },
      },
      required: ['table'],
    },
    handler: async (args) => {
      const query = args.query || '';
      const orderClause = args.order_by
        ? `${query ? '^' : ''}ORDERBY${args.order_desc ? 'DESC' : ''}${args.order_by}`
        : '';
      const result = await snFetch(`/api/now/table/${encodeURIComponent(args.table)}`, {
        query: {
          sysparm_query: query + orderClause,
          sysparm_fields: toFieldList(args.fields),
          sysparm_limit: clampLimit(args.limit),
          sysparm_offset: args.offset,
          sysparm_display_value: args.display_value || 'true',
          sysparm_exclude_reference_link: 'true',
        },
      });
      const rows = result.result || [];
      return `${rows.length} record(s) from ${args.table}:\n\n${render(rows)}`;
    },
  },

  {
    name: 'servicenow_get_record',
    description: 'Fetch a single record by sys_id from any table.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        sys_id: { type: 'string' },
        fields: { type: 'array', items: { type: 'string' } },
        display_value: { type: 'string', enum: ['true', 'false', 'all'] },
      },
      required: ['table', 'sys_id'],
    },
    handler: async (args) => {
      const result = await snFetch(
        `/api/now/table/${encodeURIComponent(args.table)}/${encodeURIComponent(args.sys_id)}`,
        {
          query: {
            sysparm_fields: toFieldList(args.fields),
            sysparm_display_value: args.display_value || 'all',
            sysparm_exclude_reference_link: 'true',
          },
        }
      );
      return render(result.result);
    },
  },

  {
    name: 'servicenow_aggregate',
    description:
      'Count, sum, average, min or max records via the Aggregate API, optionally grouped. ' +
      'Use this instead of pulling rows when you only need totals — e.g. open incidents by priority.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        query: { type: 'string', description: 'Encoded query to filter before aggregating.' },
        group_by: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to group by, e.g. ["priority","state"].',
        },
        count: { type: 'boolean', description: 'Include a record count (default true).' },
        sum_fields: { type: 'array', items: { type: 'string' } },
        avg_fields: { type: 'array', items: { type: 'string' } },
        min_fields: { type: 'array', items: { type: 'string' } },
        max_fields: { type: 'array', items: { type: 'string' } },
      },
      required: ['table'],
    },
    handler: async (args) => {
      const result = await snFetch(`/api/now/stats/${encodeURIComponent(args.table)}`, {
        query: {
          sysparm_query: args.query,
          sysparm_count: args.count === false ? undefined : 'true',
          sysparm_group_by: toFieldList(args.group_by),
          sysparm_sum_fields: toFieldList(args.sum_fields),
          sysparm_avg_fields: toFieldList(args.avg_fields),
          sysparm_min_fields: toFieldList(args.min_fields),
          sysparm_max_fields: toFieldList(args.max_fields),
          sysparm_display_value: 'true',
        },
      });
      return render(result.result);
    },
  },

  {
    name: 'servicenow_list_tables',
    description:
      'Search the instance for tables by name or label. Use this to discover the right table ' +
      'name before querying (e.g. "task", "cmdb", "catalog").',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Substring matched against both table name and label.' },
        limit: { type: 'integer', description: 'Max tables to return (default 50).' },
      },
    },
    handler: async (args) => {
      const search = (args.search || '').trim();
      const filter = search ? `nameLIKE${search}^ORlabelLIKE${search}` : '';
      const result = await snFetch('/api/now/table/sys_db_object', {
        query: {
          sysparm_query: `${filter}${filter ? '^' : ''}ORDERBYname`,
          sysparm_fields: 'name,label,super_class,sys_scope',
          sysparm_limit: clampLimit(args.limit, 50),
          sysparm_display_value: 'true',
          sysparm_exclude_reference_link: 'true',
        },
      });
      const rows = result.result || [];
      const lines = rows.map((row) => `${row.name}  —  ${row.label}${row.super_class ? `  (extends ${row.super_class})` : ''}`);
      return `${rows.length} table(s):\n\n${render(lines.join('\n'))}`;
    },
  },

  {
    name: 'servicenow_describe_table',
    description:
      'List the columns of a table, including fields inherited from parent tables. Returns each ' +
      "field's name, label, type, reference target and mandatory flag. Use before writing a query " +
      'so field names and reference targets are correct.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        include_inherited: {
          type: 'boolean',
          description: 'Include fields from parent tables (default true).',
        },
      },
      required: ['table'],
    },
    handler: async (args) => {
      const chain = await tableHierarchy(args.table);
      if (!chain.length) {
        throw new SnError(`No table named "${args.table}" exists on this instance.`);
      }
      const targets = args.include_inherited === false ? [chain[0]] : chain;
      const sections = [];
      for (const entry of targets) {
        const result = await snFetch('/api/now/table/sys_dictionary', {
          query: {
            sysparm_query: `name=${entry.name}^elementISNOTEMPTY^ORDERBYelement`,
            sysparm_fields: 'element,column_label,internal_type,reference,mandatory,max_length',
            sysparm_limit: 500,
            sysparm_display_value: 'true',
            sysparm_exclude_reference_link: 'true',
          },
        });
        const fields = (result.result || []).map((row) => ({
          field: row.element,
          label: row.column_label,
          type: row.internal_type,
          reference: row.reference || undefined,
          mandatory: row.mandatory === 'true' || undefined,
        }));
        sections.push(`### ${entry.name} (${entry.label}) — ${fields.length} field(s)\n${JSON.stringify(fields, null, 2)}`);
      }
      const inheritance = chain.map((entry) => entry.name).join(' → ');
      return render(`Inheritance: ${inheritance}\n\n${sections.join('\n\n')}`);
    },
  },
];

const WRITE_TOOLS = [
  {
    name: 'servicenow_create_record',
    description: 'Insert a new record into any table. Returns the created record including its sys_id.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        fields: {
          type: 'object',
          description: 'Field/value pairs, e.g. {"short_description":"Printer down","urgency":"2"}.',
          additionalProperties: true,
        },
      },
      required: ['table', 'fields'],
    },
    handler: async (args) => {
      requireWrite(`create a record in ${args.table}`);
      const result = await snFetch(`/api/now/table/${encodeURIComponent(args.table)}`, {
        method: 'POST',
        body: args.fields,
        query: { sysparm_exclude_reference_link: 'true' },
      });
      return `Created in ${args.table}:\n\n${render(result.result)}`;
    },
  },

  {
    name: 'servicenow_update_record',
    description: 'Update an existing record by sys_id. Only the fields you pass are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        sys_id: { type: 'string' },
        fields: { type: 'object', additionalProperties: true },
      },
      required: ['table', 'sys_id', 'fields'],
    },
    handler: async (args) => {
      requireWrite(`update ${args.table}/${args.sys_id}`);
      const result = await snFetch(
        `/api/now/table/${encodeURIComponent(args.table)}/${encodeURIComponent(args.sys_id)}`,
        {
          method: 'PATCH',
          body: args.fields,
          query: { sysparm_exclude_reference_link: 'true' },
        }
      );
      return `Updated ${args.table}/${args.sys_id}:\n\n${render(result.result)}`;
    },
  },

  {
    name: 'servicenow_delete_record',
    description:
      'Delete a record by sys_id. This is irreversible — confirm with the user before calling it.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        sys_id: { type: 'string' },
      },
      required: ['table', 'sys_id'],
    },
    handler: async (args) => {
      requireWrite(`delete ${args.table}/${args.sys_id}`);
      await snFetch(
        `/api/now/table/${encodeURIComponent(args.table)}/${encodeURIComponent(args.sys_id)}`,
        { method: 'DELETE' }
      );
      return `Deleted ${args.table}/${args.sys_id}.`;
    },
  },

  {
    name: 'servicenow_execute_script',
    description:
      'Run a server-side background script (GlideRecord, GlideSystem, etc.) and return its output, ' +
      'the same as Scripts - Background in the UI. Requires the admin role. Powerful and unsandboxed: ' +
      'a script can modify or delete data, so confirm destructive scripts with the user first. ' +
      'Use gs.print()/gs.info() to produce output.',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string', description: 'Server-side JavaScript to execute.' },
        scope: { type: 'string', description: 'Application scope (default "global").' },
        record_for_rollback: {
          type: 'boolean',
          description:
            'Record the run so it can be undone from System Rollback (default true). ' +
            'Only set false for large read-only scripts where the rollback context is wasteful.',
        },
        verbose: {
          type: 'boolean',
          description:
            'Return the raw page output including cache-flush chatter, slow-query SQL and business-rule ' +
            'timings. Default false, which returns only gs.print output plus any errors.',
        },
      },
      required: ['script'],
    },
    handler: async (args) => {
      requireWrite('execute a background script');
      if (!CONFIG.allowScripts) {
        throw new SnError(
          'Background script execution is disabled. Set SERVICENOW_ALLOW_SCRIPTS=true in .env to enable it.'
        );
      }
      const output = await executeScript(args.script, {
        scope: args.scope || 'global',
        recordForRollback: args.record_for_rollback !== false,
      });
      return render(args.verbose ? output : filterScriptOutput(output));
    },
  },

  {
    name: 'servicenow_request',
    description:
      'Escape hatch: call any ServiceNow REST endpoint directly. Use for APIs the other tools do ' +
      'not cover — Attachment API, Import Set API, Aggregate variants, or your own Scripted REST APIs ' +
      '(/api/<scope>/<name>/...).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path starting with /, e.g. "/api/now/attachment".' },
        method: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] },
        query: { type: 'object', additionalProperties: true, description: 'Query-string parameters.' },
        body: { type: 'object', additionalProperties: true, description: 'JSON request body.' },
      },
      required: ['path'],
    },
    handler: async (args) => {
      const method = (args.method || 'GET').toUpperCase();
      if (method !== 'GET') requireWrite(`send a ${method} to ${args.path}`);
      const result = await snFetch(args.path, {
        method,
        query: args.query,
        body: args.body,
      });
      return render(result);
    },
  },
];

const TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.name, tool]));

function visibleTools() {
  return TOOLS.filter((tool) => {
    if (CONFIG.readOnly && WRITE_TOOLS.includes(tool)) return false;
    if (!CONFIG.allowScripts && tool.name === 'servicenow_execute_script') return false;
    return true;
  }).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(message) {
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      const clientVersion = params && params.protocolVersion;
      respond(id, {
        protocolVersion: clientVersion || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
      return;
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;

    case 'ping':
      if (!isNotification) respond(id, {});
      return;

    case 'tools/list':
      respond(id, { tools: visibleTools() });
      return;

    case 'tools/call': {
      const name = params && params.name;
      const tool = TOOL_MAP.get(name);
      if (!tool) {
        respond(id, {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        });
        return;
      }
      try {
        const text = await tool.handler((params && params.arguments) || {});
        respond(id, { content: [{ type: 'text', text }] });
      } catch (err) {
        const detail = err instanceof SnError ? err.message : `${err.name}: ${err.message}`;
        respond(id, { content: [{ type: 'text', text: detail }], isError: true });
      }
      return;
    }

    default:
      if (!isNotification) respondError(id, -32601, `Method not found: ${method}`);
  }
}

function startServer() {
  let buffer = '';
  let inFlight = 0;
  let closed = false;

  // Requests are async, so stdin closing must not kill work that has not answered yet.
  const exitWhenDrained = () => {
    if (closed && inFlight === 0) process.exit(0);
  };

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        process.stderr.write(`[servicenow-mcp] skipped malformed line\n`);
        continue;
      }
      inFlight++;
      handleMessage(message)
        .catch((err) => {
          process.stderr.write(`[servicenow-mcp] ${err.stack || err.message}\n`);
          if (message.id !== undefined && message.id !== null) {
            respondError(message.id, -32603, err.message);
          }
        })
        .finally(() => {
          inFlight--;
          exitWhenDrained();
        });
    }
  });
  process.stdin.on('end', () => {
    closed = true;
    exitWhenDrained();
  });
  process.stderr.write(
    `[servicenow-mcp] ready — instance=${CONFIG.instance || '(unset)'} readOnly=${CONFIG.readOnly}\n`
  );
}

// ---------------------------------------------------------------------------
// Doctor: `node server.js --doctor`
// ---------------------------------------------------------------------------

async function doctor() {
  const log = (line) => process.stdout.write(line + '\n');
  log('ServiceNow MCP — connection check\n');
  log(`  instance : ${CONFIG.instance || '(not set)'}`);
  log(`  username : ${CONFIG.username || '(not set)'}`);
  log(`  password : ${CONFIG.password ? '(set, ' + CONFIG.password.length + ' chars)' : '(not set)'}`);
  log(`  readOnly : ${CONFIG.readOnly}`);
  log(`  scripts  : ${CONFIG.allowScripts}\n`);

  const problem = configProblem();
  if (problem) {
    log(`✗ ${problem}\n\n${CONFIG_HELP}`);
    process.exit(1);
  }

  try {
    const me = await snFetch('/api/now/table/sys_user', {
      query: {
        sysparm_query: `user_name=${CONFIG.username}`,
        sysparm_fields: 'user_name,name,email,sys_id',
        sysparm_limit: 1,
        sysparm_exclude_reference_link: 'true',
      },
    });
    const user = me.result && me.result[0];
    log(`✓ Authenticated to ${CONFIG.instance}`);
    if (user) log(`  Signed in as ${user.name} <${user.email || 'no email'}> (${user.user_name})`);
  } catch (err) {
    log(`✗ ${err.message}`);
    process.exit(1);
  }

  try {
    const stats = await snFetch('/api/now/stats/incident', {
      query: { sysparm_count: 'true', sysparm_query: 'active=true' },
    });
    const count = stats.result && stats.result.stats && stats.result.stats.count;
    log(`✓ Table API works — ${count} active incident(s)`);
  } catch (err) {
    log(`⚠ Table API check failed: ${err.message}`);
  }

  if (CONFIG.allowScripts && !CONFIG.readOnly) {
    try {
      const output = await executeScript("gs.print('mcp connectivity ok');");
      const ok = /mcp connectivity ok/.test(output);
      log(ok ? '✓ Background scripts work' : `⚠ Background script ran but output was unexpected:\n${output.slice(0, 300)}`);
    } catch (err) {
      log(`⚠ Background scripts unavailable: ${err.message}`);
      log('  (Everything else still works — this tool is optional.)');
    }
  }

  log(`\n${visibleTools().length} tool(s) will be exposed to Claude Code.`);
}

/** `node server.js --run <file.js> [--verbose]` — execute a script file, print filtered output. */
async function runFile(file, verbose) {
  const script = fs.readFileSync(file, 'utf8');
  const output = await executeScript(script, { recordForRollback: false });
  process.stdout.write((verbose ? output : filterScriptOutput(output)) + '\n');
}

const argv = process.argv.slice(2);
const runIndex = argv.indexOf('--run');

if (argv.includes('--doctor')) {
  doctor().catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
  });
} else if (runIndex !== -1) {
  const file = argv[runIndex + 1];
  if (!file) {
    process.stderr.write('Usage: node server.js --run <file.js> [--verbose]\n');
    process.exit(1);
  }
  runFile(file, argv.includes('--verbose')).catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
} else {
  startServer();
}
