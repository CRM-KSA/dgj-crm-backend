# DGJ CRM API — prototype integration contract

Base URL: the HTTPS backend service origin. This is a separate project from the
GitHub Pages frontend. The test panel at `/` uses these routes. The original CRM
frontend has not been changed or connected by this package.

## Authentication

POST `/api/auth/sign-in/email` with JSON `{email,password,rememberMe:false}`.
Send `Origin: https://leenaaloufi.github.io` from the GitHub Pages browser (the
browser sets it). The server returns a **signed session token in the
`set-auth-token` response header**. Read that header, not the unsigned `token`
field in the JSON body. CORS exposes this header to the allowed frontend.

Every CRM API request requires `Authorization: Bearer <signed-session-token>`.
Keep the token in tab memory; this panel uses neither localStorage nor
sessionStorage. `credentials: 'omit'` avoids dependence on third-party cookies
between GitHub Pages and Railway. The API deletes cookie headers before calling
Better Auth's session validator so an invalid bearer cannot fall back to a cookie.

Use GET `/api/me` for trusted CRM identity and role. Better Auth's own user role
is deliberately `user`; the server-owned `crm_members.role` is the CRM authority.
Do not use a frontend dropdown, email address or sign-in response to assign a role.

- POST `/api/auth/sign-out`, body `{}`: revoke the current session, then clear UI state.
- POST `/api/auth/change-password`, body `{currentPassword,newPassword,revokeOtherSessions:true}`.
  Read the returned `set-auth-token` header if present; the library may rotate the session.
- GET `/api/auth/get-session`: authentication metadata, not CRM authorization.
- Public registration, HTTP admin, impersonation, email change and deletion are closed.
- CRM API errors: `{error:{code,message}}`. Better Auth errors use the library's shape.

For all POST/PATCH/PUT/DELETE requests, the Origin header must match the exact
allowlist. This also applies to scripts/curl; provide an allowed Origin explicitly.
JSON request bodies are limited to 256 KiB on CRM routes. CORS is not a substitute
for authentication: non-browser clients must also send a valid session.

## Account routes

| Route | Access / result |
| --- | --- |
| GET `/api/me` | Enabled membership; `{user:{id,name,email,role,initials}}` |
| GET `/api/team` | Enabled memberships; IDs, names, roles for assignment |
| GET `/api/users` | Manager only; IDs, names, emails, roles, enabled state |
| POST `/api/users` | Manager only; `{name,email,password,role:'member'\|'manager'}` |
| PATCH `/api/users/:id/access` | Manager only; `{enabled:boolean}`; cannot disable self |

Provisioning is performed through a server-only Better Auth method. Only after
membership commits can a new identity access CRM data. If the identity is
provisioned but the membership write fails, it has no CRM access; recovering that
orphan requires a database administrator. There is no role-edit/reset-password
endpoint in this first package. Disabling an account revokes its sessions.

## Records

Types are exactly `Contacts`, `Opportunities`, `Meetings`, `Reports`, `Complaints`,
`Tasks`. All records use server UUIDs and version integers. Response fields follow
the existing frontend's names:

```json
{
  "record": {
    "id": "server-generated-uuid",
    "entityType": "Contacts",
    "name": "Example Contact",
    "company": "Example Company",
    "ownerId": "authenticated-user-id",
    "visibility": "shared",
    "version": 1,
    "createdAt": 1791331200000,
    "updatedAt": 1791331200000,
    "deletedAt": null,
    "deletedBy": null,
    "contactIds": []
  }
}
```

| Route | Behavior |
| --- | --- |
| GET `/api/records/:type` | `{records,total}`; authorized active data only |
| GET `/api/records/:type/:id` | `{record}` and ETag `"version"`; unauthorized/unavailable → 404 |
| POST `/api/records/:type` | Requires UUID `Idempotency-Key`; `{record,replayed}`; 201 first write, 200 retry |
| PATCH `/api/records/:type/:id` | Requires `If-Match: "version"`; partial validated change |
| POST `/api/records/:type/:id/trash` | Manager only, requires If-Match; soft delete |
| GET `/api/trash` | Manager only; authorized deleted records |
| POST `/api/trash/:type/:id/restore` | Manager only, requires If-Match; parents must be active |
| DELETE `/api/trash/:type/:id` | Manager only, requires If-Match; linked parents cannot be purged |
| GET `/api/export/:type` | Manager only; authorized JSON rows, all matching rows rather than one page |
| GET `/api/statistics` | Counts and opportunity stages/values from authorized active data |
| GET `/api/activity` | Server event metadata; own events for members, allowed All/My events for managers |
| GET `/api/preferences` | Caller-only settings |
| PUT `/api/preferences` | Caller-only `{locale?,notifications?,savedViews?}` replaces these settings |

List/trash/export/activity accept `scope=all|my`, `query`, `limit=1..100` and
`offset=0..10000`. Default limit 50. Search filters name/company/email/status.
Filtering occurs before totals and pagination. Activity does not perform text
search; it exposes structured action codes from the last 1,000 stored events.

Allowed record input fields are enumerated in `src/validation.js`. `name` is
required on create. Common fields include company/status/notes, `contactIds`,
`opportunityId`, `meetingId`, visibility. Dates use YYYY-MM-DD; money and
probability are numbers; flags are booleans, not strings. URLs require HTTPS.
Unknown/server fields (id, ownerId, timestamps, version, history) are rejected.
Do not blindly POST the full old frontend record. Map its editable fields first.

Members create shared records. Only a manager can create private contacts or
opportunities, and only the owning manager can change their visibility. Shared
records can be edited by all enabled members, preserving their original owner.
Every linked ancestor must be accessible; missing/deleted parents and cycles
are rejected or hidden. A private parent also hides dependent charts/counts.

## Safe saves

- Generate a UUID Idempotency-Key once for a new-record submission. Reuse it for
  retries with identical payload. A reused key with changed payload returns 409.
  The server rechecks current access before replaying the record.
- Store each returned `version`. PATCH/trash/restore/purge require If-Match;
  missing version → 428; stale version → 412. Refresh, show the current data and
  let the user reapply her change. Do not silently retry overwriting newer edits.
- Each CRM record change/link change/audit update commits in one PostgreSQL
  transaction. Prototype writers serialize with a PostgreSQL advisory lock.
- Complex frontend workflows (meeting report + follow-up tasks + opportunity
  stage history, merge/import, job history, attachments/email) need dedicated
  transaction endpoints before connecting those existing local functions.
- Counts show confirmed server data. Do not display “saved” while a network
  request is pending or failed. Do not turn synchronous `transact()` callsites
  into truthy Promise checks.

## Local testing and deployment

`npm test` creates an isolated PGlite database (PostgreSQL in WASM), exposes its
PostgreSQL wire protocol locally and exercises pg, Better Auth, Express, real HTTP
calls and the HTML panel through jsdom. It never uses DATABASE_URL from Railway.
It is not a live Railway/browser or native PostgreSQL load/concurrency test.

Production startup migrates auth tables and the CRM schema under a database lock,
then creates the first manager once. A database marker prevents redeployments
from resetting her credentials. Use normal schema migration review for future
versions rather than assuming every schema edit can be applied by IF NOT EXISTS.

The server's private auth IP header is overwritten from Express `req.ip`.
`TRUST_PROXY_HOPS=1` is configured for Railway; validate the topology when moving
hosts. Auth login throttling is database-backed (10 attempts per IP per 15 min).
The general API limiter is process-local (300 requests per minute per IP).
GitHub/Railway dashboard account security, billing and backups are separate from
this application's authentication.

