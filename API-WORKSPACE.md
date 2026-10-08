# Workspace API

These routes extend the original authenticated `/api/records`, `/api/me`, `/api/team` and manager-account API. All workspace requests require a valid signed Better Auth bearer and an enabled `crm_members` identity. CORS is not the access boundary.

- `GET /api/workspace`: complete currently authorized snapshot in `{state}`. Includes the six core collections, visible supplements, the caller's preferences/views and filtered audit metadata.
- `POST /api/workspace`: atomic create/update/trash/restore/purge diff with an `Idempotency-Key` UUID. Body `{operations, preferences?}`; response `{state, replayed}`. Max 1,000 operations.
- `GET /api/workspace/export`: manager only, returns a fresh authorized `{state}` for CSV/report/backup export.

Operation: `{kind, id, action, version, data?}`. `kind` is a core record type or `notes`, `attachments`, `employmentHistory`, `emailDrafts`, `activity`. Create uses version 0; other actions use the current returned version. IDs are UUIDs. Core field input uses strict allowlists; ownership, history and timestamps are server-stamped. `trash`, `restore` and `purge` take no `data`.

Preference payload: `{version, prefs, views}`. Personal preference version conflicts return 412. Legacy PUT `/api/preferences` preserves the workspace subdocument. A request key cannot be reused for a different payload. Replayed requests still recheck membership and return a newly authorized view.

Six core types use `crm_records` and validated `crm_links`. Small supplements use the `crm_settings` `workspace-aux` JSON document; batch fingerprints use `workspace-request:<actorId>:<requestUUID>`. No new schema migration is needed. Persistent request fingerprints need a retention strategy before large-scale use.

Meeting-to-report, report-to-complaint and report-action task IDs are validated back references or graph links. Report submission stages the complete final graph before writing, avoiding partial meeting/task saves. Submitted meeting reports cannot be duplicated for the same meeting. Changes are serialized through the existing advisory lock and transaction.

Notes may be edited by the author or a manager. Attachments and communication events are immutable. Email drafts are private to the author, and recipients may change without moving the draft to another opportunity. Parent-record privacy applies transitively. Managers alone delete notes/files, trash/restore/purge core records, and export. A member's own draft may be removed by its author. Purging a parent checks linked core dependencies and removes authorized supplements.

Malformed file data or mismatched declared byte size returns 400. Each file max 1.5 MiB; total attachment storage max 3 MiB. Workspace JSON limit is 6 MB, parsed only after API authorization. Core writes, supplements, preferences and audit entries succeed or roll back together.

Typical errors: 400 invalid fields/links, 401 signed-out/expired token, 403 account/role restriction, 404 unavailable record, 409 duplicate report/dependency/request-key conflict, 412 stale record/preferences, 413 capacity/body limit. Error responses do not include secrets or database details.
