# ServiceNow MCP server

A small stdio MCP server that connects Claude Code to a ServiceNow Personal Developer
Instance. No dependencies — plain Node, one file.

## Setup

1. Wake your PDI at <https://developer.servicenow.com> (**Manage instance**). PDIs hibernate
   after ~10 days idle, and the admin password is shown on that page.
2. Open `.env` and fill in `SERVICENOW_INSTANCE_URL`, `SERVICENOW_USERNAME`,
   `SERVICENOW_PASSWORD`.
3. Verify the connection:

   ```bash
   /usr/local/bin/node /Users/melvingibson/projects/servicenow-mcp/server.js --doctor
   ```

4. Restart Claude Code. It reads `../.mcp.json` and will ask you to approve the server once.

## Tools

| Tool | Purpose |
| --- | --- |
| `servicenow_query_table` | Query any table with an encoded query, field list, paging, sorting |
| `servicenow_get_record` | Fetch one record by `sys_id` |
| `servicenow_aggregate` | Count / sum / avg / min / max, optionally grouped |
| `servicenow_list_tables` | Find table names by name or label |
| `servicenow_describe_table` | Columns, types, references and inheritance chain for a table |
| `servicenow_create_record` | Insert a record |
| `servicenow_update_record` | Patch a record |
| `servicenow_delete_record` | Delete a record |
| `servicenow_execute_script` | Run a server-side background script (needs `admin`) |
| `servicenow_request` | Call any REST endpoint — Attachment, Import Set, Scripted REST APIs |

Between the Table API tools and `servicenow_request`, this reaches everything a PDI exposes
over REST.

## Configuration

All settings live in `.env`:

| Variable | Default | Effect |
| --- | --- | --- |
| `SERVICENOW_INSTANCE_URL` | — | `dev12345`, `dev12345.service-now.com` or a full URL |
| `SERVICENOW_USERNAME` | — | Usually `admin` on a PDI |
| `SERVICENOW_PASSWORD` | — | From the developer portal |
| `SERVICENOW_READ_ONLY` | `false` | `true` hides every write tool entirely |
| `SERVICENOW_ALLOW_SCRIPTS` | `true` | `false` hides the background-script tool |
| `SERVICENOW_MAX_RESPONSE_CHARS` | `40000` | Truncates oversized responses |
| `SERVICENOW_TIMEOUT_MS` | `60000` | Per-request timeout |

Changes take effect when Claude Code restarts the server.

## Notes

- **Auth is HTTP Basic** over TLS, which a PDI supports out of the box. OAuth would need an
  entry in **System OAuth → Application Registry**; basic auth avoids that setup.
- **Credentials live only in `.env`**, which is gitignored and not referenced by `.mcp.json`
  — so the config file stays safe to commit or share.
- **`servicenow_execute_script`** drives `/sys.scripts.do` (the Scripts - Background page).
  There is no REST API for this, and basic auth alone does not open a UI session on this
  instance — UI pages 302 to the login screen. So the tool performs a real form login against
  `/login.do` first, caches the session cookies, and re-logs in automatically if the session
  goes stale. It needs the `admin` role. Set `SERVICENOW_ALLOW_SCRIPTS=false` to drop it.
- **Background scripts default to `record_for_rollback: true`**, so a run can be undone from
  **System Rollback → Rollback Contexts** in the UI. Pass `record_for_rollback: false` only for
  large read-only scripts.
- **Deletes are irreversible** — unlike scripts, they get no rollback context.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `401` | Wrong password, or the PDI was reclaimed and reissued new credentials |
| `403` | The account lacks the role for that table, or an ACL denies it |
| "appears to be hibernating" | Wake the instance from the developer portal |
| Server missing in Claude Code | Restart it; approve the `.mcp.json` prompt; re-run `--doctor` |
