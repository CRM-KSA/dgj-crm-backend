// Public service address only. Credentials and signed sessions stay in tab memory.
window.DGJ_CONFIG = window.DGJ_CONFIG || {
  apiBase: "https://dgj-crm-backend-production.up.railway.app",
};
window.DGJSession = {
  ready: false,
  token: null,
  epoch: 0,
  writing: false,
  pending: null,
};
