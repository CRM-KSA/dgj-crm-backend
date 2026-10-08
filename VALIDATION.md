# DGJ CRM connected build — 2026-10-07

Changes prepared locally; no remote repository, Railway deployment, GitHub Pages deployment, or production database was changed by this task.

## Validation

- Node v24.19.0. `npm test` uses the existing pinned dependencies.
- 26 tests pass: 16 original backend/setup tests and 10 connected workspace/front-end/packaging tests.
- PostgreSQL protocol integration uses an independent PGlite database and socket server for each test file, the real `pg` client, Express, and Better Auth.
- The original CRM HTML runs in jsdom and signs in against the test HTTP API. Tests exercise shared saves of all six entity types, career history, note/file forms, personal preferences, rendered pages, escaping, and session cleanup.
- Report wizard tests exercise actual meeting/report/task submission and complaint/report creation in atomic server transactions.
- Backup restoration, Trash restoration and permanent deletion, including supplement cascading, are checked through the CRM UI and API.
- Shared/private access, author restrictions, enabled accounts, signed tokens, anonymous denial, member export denial, assignment checks, ownership stamps, and server validation are exercised.
- An HTTP response is intentionally lost after the server commits. The frontend does not claim success; replay with the same idempotency key saves once. A stale edit receives 412 and does not overwrite another user's change.
- A delayed refresh is held until after a save and cannot overwrite the newer confirmed client state.
- Recipient changes preserve private email drafts; legacy preference updates preserve workspace views; UI activity pruning does not delete saved communication history.
- Every inline script hash in the delivered Content Security Policy matches its final DOM text. All stylesheet and image assets required by the standalone frontend are embedded.
- Original `style.css`, `workspace.css` and the three original PNG assets remain byte-identical. Added connection styles provide sign-in and account controls.
- All 17 flattened Docker COPY source filenames exist, including `workspace-api.js`. `package-lock.json` is unchanged and no runtime dependency was added.

## Practical limits

- No actual browser visual or layout QA was available. jsdom tests verify logic and DOM state, not browser rendering or CSP enforcement; CSP hashes were checked separately.
- Docker image build, native PostgreSQL deployment, live Railway connectivity, GitHub repository contents, and live GitHub Pages deployment were not verified by this run. User confirmed the original Railway backend page opens.
- Existing schema is reused. Workspace writes take the existing transaction/advisory lock. The prototype reads up to 10,000 core records and stores small supplements in `crm_settings`; scale-up requires query/object-storage work.
- Attachments are limited to 1.5 MiB each, 3 MiB total for the prototype. They are stored in the database as validated data URLs, not in OneDrive or Dropbox.
- Public signup is closed. The initial manager and manager-created accounts sign in with email/password. Bearer tokens stay in tab memory, so page reload requires login again. No Microsoft SSO, MFA, email password-recovery flow, or mail-sending integration is included.
- New shared storage does not silently import demonstration records or old browser-only data. Restore supports connected backups with valid UUID record identities; legacy backup migration is a separate task.
- Current-parent permissions filter historical snapshots. Hidden linked back-reference IDs are removed from workspace responses. Core records have server-stamped change history; communication events are append-only in the adapter.

## Included reproducible source

`developer/DGJ-CRM-backend-connected` has the structured source and a structured Dockerfile. From that folder, run `npm ci` then `npm test` using Node 24. Its tests reference the sibling `developer/DGJ-CRM-connected/dist/index.html`.

From `developer`, run `python3 build-connected.py` to regenerate the self-contained frontend after editing source. Copy the generated `DGJ-CRM-connected/dist/index.html` to the root `frontend/index.html`. Regeneration updates script hashes after embedding assets; editing inline scripts directly in the generated file requires rebuilding those hashes.

The root `backend-updates/Dockerfile` is intentionally different: it builds the user's existing flattened backend GitHub repository. Upload the five root update files together into that repository; do not copy the structured developer Dockerfile there.
