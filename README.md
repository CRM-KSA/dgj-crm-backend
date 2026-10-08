# Connected source

This folder is for continued development. User deployment instructions are in `../START-HERE-AR.md`.

- `DGJ-CRM-connected`: original frontend source, connection adapter and self-contained `dist/index.html`.
- `DGJ-CRM-backend-connected`: full structured backend source, tests and environment example. No credentials, `node_modules`, or `.env` are included.
- `build-connected.py`: standard-library Python builder; embeds original assets/styles and hashes final inline scripts for CSP.

Use Node 24. From `DGJ-CRM-backend-connected`, `npm ci` then `npm test`. To regenerate the published HTML, run `python3 build-connected.py` from this folder, then copy `DGJ-CRM-connected/dist/index.html` to the bundle's `frontend/index.html`.

Both backend layouts use the same source code. The root deployment update Dockerfile copies flattened root filenames into `/app/src`; this developer copy uses normal `src`, `public` and `migrations` folders. Choose the Dockerfile matching the layout of the repository being deployed.

Authentication and transport are isolated in `auth-runtime.js` and `connection.js`. Domain records and UI remain in the original frontend files. Later Microsoft integration should preserve the server's authorization, transaction and ownership boundaries while replacing the relevant identity/storage adapters.
