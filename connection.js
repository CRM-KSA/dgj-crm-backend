const DGJConnection = (() => {
  const session = window.DGJSession;
  const apiBase = new URL(window.DGJ_CONFIG.apiBase).origin;
  let revision = 0,
    refreshSequence = 0;
  const auxiliary = [
    "notes",
    "attachments",
    "employmentHistory",
    "emailDrafts",
    "activity",
  ];
  const metadata = [
    "id",
    "entityType",
    "ownerId",
    "actorId",
    "version",
    "createdAt",
    "updatedAt",
    "deletedAt",
    "deletedBy",
    "history",
    "stageHistory",
    "lastStageChangedAt",
    "submittedAt",
  ];
  const stable = (v) =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, stable(v[k])]),
          )
        : v;
  const same = (a, b) =>
    JSON.stringify(stable(a)) === JSON.stringify(stable(b));
  function bodyOf(kind, row) {
    return Object.fromEntries(
      Object.entries(row).filter(
        ([k]) =>
          !metadata.includes(k) &&
          !(auxiliary.includes(kind) && ["visibility", "time"].includes(k)),
      ),
    );
  }
  function setStatus(text) {
    const el = document.getElementById("sync-status");
    if (el) el.textContent = text;
  }
  function alert(message, mode = "network") {
    const el = document.getElementById("connection-alert");
    el.hidden = false;
    el.querySelector("span").textContent = message;
    el.querySelector("[data-retry-save]").hidden = mode !== "pending";
    el.querySelector("[data-refresh-data]").hidden = mode === "pending";
  }
  function clearAlert() {
    document.getElementById("connection-alert").hidden = true;
  }
  function apply(state) {
    db = normalizeDB(state);
    setStatus("Connected · Refresh");
  }
  function clearSession(message = "") {
    session.epoch++;
    session.ready = false;
    session.token = null;
    session.pending = null;
    session.writing = false;
    db = normalizeDB(null);
    USERS.splice(0);
    user = { id: "", name: "", initials: "", role: "member" };
    query = "";
    regionFilter = "";
    activeProfile = null;
    page = "Home";
    reportFlow = null;
    opportunityFlow = null;
    detailRecord = null;
    importRows = [];
    for (const k of Object.keys(scopes)) delete scopes[k];
    ui.filters = {};
    ui.selected = {};
    ui.pagination = {};
    ui.sort = {};
    ui.bannerHidden = false;
    document.getElementById("search").value = "";
    document.getElementById("nav").replaceChildren();
    document.getElementById("main").replaceChildren();
    closeDialog();
    document.getElementById("modal").replaceChildren();
    document.getElementById("toast").textContent = "";
    document.getElementById("toast").style.display = "none";
    document.body.classList.add("signed-out");
    document.getElementById("login-shell").hidden = false;
    document.getElementById("login-error").textContent = message;
    document.getElementById("login-form").reset();
    clearAlert();
    document.querySelector(".account span").textContent = "";
    document.querySelector(".account .avatar").textContent = "";
  }
  async function request(path, { method = "GET", body, key } = {}) {
    const epoch = session.epoch,
      headers = { "Content-Type": "application/json" };
    if (session.token) headers.Authorization = "Bearer " + session.token;
    if (key) headers["Idempotency-Key"] = key;
    let res;
    try {
      res = await fetch(apiBase + path, {
        method,
        headers,
        credentials: "omit",
        cache: "no-store",
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      const error = new Error(
        "Connection failed. Check your connection and try again.",
      );
      error.network = true;
      throw error;
    }
    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (epoch !== session.epoch)
      throw Object.assign(new Error("Session changed."), {
        sessionChanged: true,
      });
    if (!res.ok) {
      const error = new Error(
        data.error?.message ||
          data.message ||
          "Unable to complete this request.",
      );
      error.status = res.status;
      error.code = data.error?.code || data.code;
      if (
        session.ready &&
        (res.status === 401 || error.code === "ACCOUNT_DISABLED")
      )
        clearSession("Your session ended. Sign in again.");
      throw error;
    }
    return { data, token: res.headers.get("set-auth-token") };
  }
  async function refresh() {
    if (!session.ready || session.writing || session.pending) return false;
    const epoch = session.epoch,
      priorRevision = revision,
      sequence = ++refreshSequence;
    try {
      setStatus("Refreshing…");
      const result = await request("/api/workspace");
      if (
        epoch !== session.epoch ||
        priorRevision !== revision ||
        sequence !== refreshSequence ||
        session.writing ||
        session.pending
      )
        return false;
      apply(result.data.state);
      clearAlert();
      render();
      return true;
    } catch (error) {
      if (!error.sessionChanged && session.ready) {
        setStatus("Offline · Retry");
        alert(error.message);
      }
      return false;
    }
  }
  function difference(next) {
    const operations = [];
    for (const kind of [...RECORD_TYPES, ...auxiliary]) {
      const prior = new Map(
        (db[kind] || [])
          .filter((r) => kind !== "activity" || r.kind === "interaction")
          .map((r) => [r.id, r]),
      );
      const rows = (next[kind] || []).filter(
        (r) => kind !== "activity" || r.kind === "interaction",
      );
      for (const row of rows) {
        const old = prior.get(row.id);
        prior.delete(row.id);
        const data = bodyOf(kind, row);
        if (!old)
          operations.push({
            kind,
            id: row.id,
            action: "create",
            version: 0,
            data,
          });
        else if (!!old.deletedAt !== !!row.deletedAt)
          operations.push({
            kind,
            id: row.id,
            action: row.deletedAt ? "trash" : "restore",
            version: old.version,
          });
        else if (!same(bodyOf(kind, old), data))
          operations.push({
            kind,
            id: row.id,
            action: "update",
            version: old.version,
            data,
          });
      }
      for (const old of prior.values())
        if (kind !== "activity")
          operations.push({
            kind,
            id: old.id,
            action:
              RECORD_TYPES.includes(kind) && !old.deletedAt ? "trash" : "purge",
            version: old.version,
          });
    }
    const prefs = next.preferences?.[user.id] || {},
      views = (next.savedViews || []).filter((v) => v.ownerId === user.id);
    const payload = { operations };
    if (
      !same(prefs, db.preferences?.[user.id] || {}) ||
      !same(
        views,
        (db.savedViews || []).filter((v) => v.ownerId === user.id),
      )
    )
      payload.preferences = {
        version: db.preferenceVersion || 0,
        prefs,
        views,
      };
    return payload;
  }
  async function commit(payload, key) {
    const epoch = session.epoch;
    revision++;
    session.writing = true;
    setStatus("Saving…");
    const buttons = [
      ...document.querySelectorAll(
        "#modal button[type=submit],#modal .formbuttons .primary",
      ),
    ].filter((b) => !b.disabled);
    buttons.forEach((b) => (b.disabled = true));
    try {
      const result = await request("/api/workspace", {
        method: "POST",
        body: payload,
        key,
      });
      if (epoch !== session.epoch) return false;
      session.pending = null;
      apply(result.data.state);
      clearAlert();
      return true;
    } catch (error) {
      if (epoch !== session.epoch || !session.ready) return false;
      if (error.network || error.status >= 500) {
        session.pending = { payload, key };
        alert(
          "Save confirmation was not received. Retry the same save to avoid duplicates.",
          "pending",
        );
      } else {
        session.pending = null;
        alert(
          error.status === 412
            ? "Another person changed this data. Refresh and review the latest record before saving again."
            : error.message,
        );
        if (error.status === 412) closeDialog();
      }
      setStatus("Save failed");
      toast(error.message);
      return false;
    } finally {
      if (epoch === session.epoch) session.writing = false;
      buttons.forEach((b) => {
        if (b.isConnected) b.disabled = false;
      });
    }
  }
  persist = async function (next) {
    if (!session.ready) return false;
    if (session.writing) {
      toast("A save is already in progress.");
      return false;
    }
    if (session.pending) {
      toast("Retry the pending save before making another change.");
      return false;
    }
    const payload = difference(next);
    if (!payload.operations.length && !payload.preferences) return true;
    return commit(payload, crypto.randomUUID());
  };
  transact = async function (change) {
    const next = structuredClone(db);
    change(next);
    return persist(next);
  };
  async function signIn(event) {
    event.preventDefault();
    const form = event.target,
      button = form.querySelector("button");
    button.disabled = true;
    document.getElementById("login-error").textContent = "";
    session.epoch++;
    try {
      const response = await request("/api/auth/sign-in/email", {
        method: "POST",
        body: {
          email: form.elements.email.value.trim(),
          password: form.elements.password.value,
          rememberMe: false,
        },
      });
      if (!response.token)
        throw new Error("A signed session was not returned.");
      session.token = response.token;
      const [me, team, state] = await Promise.all([
        request("/api/me"),
        request("/api/team"),
        request("/api/workspace"),
      ]);
      user = me.data.user;
      USERS.splice(
        0,
        USERS.length,
        ...team.data.users.map((u) => ({
          ...u,
          initials: u.name
            .split(/\s+/)
            .slice(0, 2)
            .map((n) => n[0])
            .join("")
            .toUpperCase(),
        })),
      );
      if (!USERS.some((u) => u.id === user.id)) USERS.push({ ...user });
      apply(state.data.state);
      session.ready = true;
      form.reset();
      document.body.classList.remove("signed-out");
      document.getElementById("login-shell").hidden = true;
      render();
    } catch (error) {
      clearSession(error.message);
    } finally {
      button.disabled = false;
    }
  }
  async function signOut() {
    const pending = request("/api/auth/sign-out", {
      method: "POST",
      body: {},
    }).catch(() => {});
    clearSession();
    await pending;
  }
  async function accounts() {
    if (!isManager()) return;
    try {
      const result = await request("/api/users");
      const d = showDialog(
        `<h2>Team Accounts</h2><p class="smallnote">Create accounts and manage CRM access.</p><div>${result.data.users.map((u) => `<div class="account-row"><div class="grow"><b>${esc(u.name)}</b><small>${esc(u.email)} · ${esc(u.role)} · ${u.enabled ? "Enabled" : "Disabled"}</small></div>${u.id === user.id ? "" : `<button class="secondary compact" data-account-toggle="${esc(u.id)}" data-enabled="${!u.enabled}">${u.enabled ? "Disable" : "Enable"}</button>`}</div>`).join("")}</div><form id="create-account"><h3>Add Account</h3><div class="form-grid">${fieldHTML("Name", "name", "", "text", true)}${fieldHTML("Email", "email", "", "email", true)}${fieldHTML("Initial Password (12–128 characters)", "password", "", "password", true, 'minlength="12" maxlength="128" autocomplete="new-password"')}${selectHTML("Access", "role", "member", ["member", "manager"])}</div><p class="smallnote">Share initial credentials with the person privately. They can change their password after signing in.</p><div class="formbuttons"><button type="button" class="secondary" data-close>Close</button><button class="primary" type="submit">Create Account</button></div></form>`,
      );
      d.classList.add("dialog-wide");
      d.querySelector("form").onsubmit = async (e) => {
        e.preventDefault();
        const b = e.target.querySelector("button[type=submit]");
        b.disabled = true;
        try {
          await request("/api/users", {
            method: "POST",
            body: Object.fromEntries(new FormData(e.target)),
          });
          const team = await request("/api/team");
          USERS.splice(0, USERS.length, ...team.data.users);
          await accounts();
          toast("Account created.");
        } catch (error) {
          toast(error.message);
          if (b.isConnected) b.disabled = false;
        }
      };
      d.querySelectorAll("[data-account-toggle]").forEach(
        (b) =>
          (b.onclick = async () => {
            b.disabled = true;
            try {
              await request(
                "/api/users/" +
                  encodeURIComponent(b.dataset.accountToggle) +
                  "/access",
                {
                  method: "PATCH",
                  body: { enabled: b.dataset.enabled === "true" },
                },
              );
              const team = await request("/api/team");
              USERS.splice(0, USERS.length, ...team.data.users);
              await accounts();
            } catch (error) {
              toast(error.message);
              b.disabled = false;
            }
          }),
      );
    } catch (error) {
      toast(error.message);
    }
  }
  function changePassword() {
    const d = showDialog(
      `<form id="change-password"><h2>Change Password</h2>${fieldHTML("Current Password", "currentPassword", "", "password", true, 'autocomplete="current-password"')}${fieldHTML("New Password (12–128 characters)", "newPassword", "", "password", true, 'minlength="12" maxlength="128" autocomplete="new-password"')}<div class="formbuttons"><button class="secondary" type="button" data-close>Cancel</button><button class="primary" type="submit">Update Password</button></div></form>`,
    );
    d.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button[type=submit]");
      b.disabled = true;
      try {
        const response = await request("/api/auth/change-password", {
          method: "POST",
          body: {
            ...Object.fromEntries(new FormData(e.target)),
            revokeOtherSessions: true,
          },
        });
        if (response.token) session.token = response.token;
        closeDialog();
        toast("Password changed. Other sessions were signed out.");
      } catch (error) {
        toast(error.message);
        if (b.isConnected) b.disabled = false;
      }
    };
  }
  async function exportedState() {
    if (session.writing || session.pending)
      throw new Error("Finish the current save before exporting.");
    const priorRevision = revision;
    const state = (await request("/api/workspace/export")).data.state;
    if (priorRevision !== revision || session.writing || session.pending)
      throw new Error("Data changed while preparing the export. Try again.");
    return state;
  }
  const oldCsv = csv;
  csv = async function () {
    if (!isManager()) return toast("Only the General Manager can export.");
    try {
      const fresh = await exportedState();
      apply(fresh);
      oldCsv();
    } catch (error) {
      toast(error.message);
    }
  };
  const oldExportReport = exportReport;
  exportReport = async function (id) {
    if (!isManager()) return toast("Only the General Manager can export.");
    try {
      apply(await exportedState());
      oldExportReport(id);
    } catch (error) {
      toast(error.message);
    }
  };
  backupVisibleData = async function () {
    if (!isManager()) return;
    try {
      download(
        "DGJ-CRM-backup.json",
        JSON.stringify(await exportedState(), null, 2),
        "application/json",
      );
      toast("Backup exported.");
    } catch (error) {
      toast(error.message);
    }
  };
  settings = function () {
    return `<div class="pageheading"><h1>Settings</h1></div><div class="settings-account"><section class="panel"><h3>Your Account</h3><p>${esc(user.name)} · ${esc(user.email)}</p><p class="smallnote">${isManager() ? "General Manager" : "Team Member"} · Data is stored in the shared CRM database.</p><div class="account-controls"><button class="secondary" id="real-password">Change Password</button>${isManager() ? '<button class="secondary" id="real-accounts">Team Accounts</button><button class="secondary" id="real-backup">Download Backup</button><label class="secondary">Restore CRM Backup<input id="restore" type="file" accept="application/json,.json" hidden></label>' : ""}<button class="secondary" id="real-signout">Sign Out</button></div></section><section class="panel"><h3>Connection</h3><p>Railway · PostgreSQL</p><p class="smallnote">Saved records are available to authorized teammates. Private records are restricted by the server.</p><button class="secondary" id="real-refresh">Refresh Data</button></section></div>`;
  };
  document.getElementById("login-form").onsubmit = signIn;
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === "real-signout") await signOut();
    if (b.id === "real-accounts") await accounts();
    if (b.id === "real-password") changePassword();
    if (b.id === "real-backup") await backupVisibleData();
    if (
      b.id === "real-refresh" ||
      b.id === "sync-status" ||
      b.hasAttribute("data-refresh-data")
    ) {
      if (document.getElementById("modal").open)
        return toast("Close the form before refreshing.");
      if (session.pending)
        return toast("Retry the pending save before refreshing.");
      await refresh();
    }
    if (b.hasAttribute("data-retry-save") && session.pending) {
      const p = session.pending;
      if (await commit(p.payload, p.key)) {
        closeDialog();
        render();
        toast("Saved successfully.");
      }
    }
  });
  setInterval(() => {
    if (
      document.visibilityState === "visible" &&
      !document.getElementById("modal").open
    )
      refresh();
  }, 45000);
  clearSession();
  return { request, refresh, clearSession, signOut };
})();
