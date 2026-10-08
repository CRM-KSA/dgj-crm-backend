/* Interaction routing, contact import and validation. No network services are assumed. */
let importRows = [];
function showUndoDelete(k, id) {
  const toastBox = document.getElementById("toast");
  clearTimeout(window.toastTimer);
  toastBox.innerHTML = `<span>${singular(k)} moved to Trash.</span><button class="toast-undo" data-undo-trash="${k}" data-id="${esc(id)}">Undo</button>`;
  toastBox.style.display = "block";
  window.toastTimer = setTimeout(
    () => (toastBox.style.display = "none"),
    10000,
  );
}
const originalLinkedAccess = linkedAccess;
linkedAccess = function (x) {
  if (!originalLinkedAccess(x)) return false;
  if (
    x.recordId &&
    RECORD_TYPES.includes(x.recordType) &&
    !["Contacts", "Opportunities"].includes(x.recordType)
  ) {
    const parent = visibleRecord(x.recordType, x.recordId);
    if (!parent) return false;
  }
  if (x.meetingId && x.entityType !== "Meetings") {
    const m = visibleRecord("Meetings", x.meetingId);
    if (!m) return false;
  }
  if (x.reportId && x.entityType === "Tasks") {
    const r = visibleRecord("Reports", x.reportId);
    if (!r) return false;
  }
  return true;
};
function refreshKeepingFocus(id, position) {
  const y = window.scrollY;
  render();
  const el = document.getElementById(id);
  if (el) {
    el.focus({ preventScroll: true });
    if (
      typeof el.setSelectionRange === "function" &&
      typeof position === "number"
    )
      try {
        el.setSelectionRange(position, position);
      } catch {}
  }
  window.scrollTo(0, y);
}
function rowMenu(k, id) {
  const x = visibleRecord(k, id);
  if (!x) return;
  const profile = ["Contacts", "Opportunities"].includes(k);
  const d = showDialog(
    `${dialogTitle("Actions", x.name)}<div class="row-action-list">${profile ? `<button data-profile="${k}" data-id="${esc(id)}">${icon(k)} View Profile</button>` : k === "Meetings" ? `<button data-meeting-detail="${esc(id)}">${icon("Meetings")} Meeting Details</button>` : k === "Reports" ? `<button data-report-detail="${esc(id)}">${icon("Reports")} View Report</button>` : ""}<button data-edit="${k}" data-id="${esc(id)}">${icon("Edit")} Edit</button>${k === "Contacts" ? `<button data-link-contact-opportunity="${esc(id)}">${icon("Opportunities")} Add to Opportunity</button>` : ""}${profile ? `<button data-action-new="Meetings" data-kind="${k}" data-id="${esc(id)}">${icon("Meetings")} Schedule Meeting</button><button data-action-new="Tasks" data-kind="${k}" data-id="${esc(id)}">${icon("Tasks")} Add Task</button><button data-action-new="Reports" data-kind="${k}" data-id="${esc(id)}">${icon("Reports")} Add Report</button><button data-action-log="${k}" data-id="${esc(id)}">${icon("Email")} Log Communication</button>` : ""}${k === "Meetings" ? `<button data-meeting-report="${esc(id)}">${icon("Reports")} ${meetingReport(x) ? "View" : "Add"} Meeting Report</button><button data-ics="${esc(id)}">${icon("Meetings")} Download Calendar Event</button>` : ""}${isManager() ? `<button class="dangertext" data-delete="${k}" data-id="${esc(id)}">${icon("Trash")} Delete</button>` : ""}</div>`,
  );
  d.classList.add("dialog-medium");
}
function columnsDialog(k) {
  const hidden = userPrefs()["columns_" + k] || [];
  const d = showDialog(
    `${dialogTitle("Columns", "Choose what appears in your table.")}<div class="linkchoices">${TABLE_COLUMNS[k].map(([key, label]) => `<label><input type="checkbox" data-column-toggle="${key}" data-kind="${k}" ${hidden.includes(key) ? "" : "checked"} ${key === "name" ? "disabled" : ""}>${label}</label>`).join("")}</div><div class="formbuttons"><button class="primary" data-close>Done</button></div>`,
  );
  d.classList.add("dialog-medium");
}
function saveViewDialog() {
  const d = showDialog(
    `<form id="save-view-form">${dialogTitle("Save Contact View", "Save the current filters, columns and display mode.")} ${fieldHTML("View Name", "name", "", "text", true, 'maxlength="100"')}<div class="formbuttons"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save View</button></div></form>`,
  );
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim();
    if (!name) return;
    const existing = db.savedViews.find(
      (v) =>
        v.ownerId === user.id &&
        v.page === "Contacts" &&
        normal(v.name) === normal(name),
    );
    const view = {
      id: existing?.id || crypto.randomUUID(),
      ownerId: user.id,
      page: "Contacts",
      name,
      query,
      filters: { ...pageFilters("Contacts") },
      sort: { ...ui.sort.Contacts },
      display: ui.contactsView,
      columns: [...(userPrefs().columns_Contacts || [])],
      updatedAt: Date.now(),
    };
    if (
      await transact((next) => {
        next.savedViews = next.savedViews.filter((v) => v.id !== view.id);
        next.savedViews.push(view);
      })
    ) {
      closeDialog();
      render();
      toast("View saved.");
    }
  };
}
function stageChangeDialog(id, stage) {
  const x = visibleRecord("Opportunities", id);
  if (!x || !STAGES.includes(stage) || x.status === stage) return;
  const d = showDialog(
    `${dialogTitle("Change Opportunity Stage", x.name)}<div class="record-card"><div><small>Current stage</small><b>${esc(x.status)}</b></div><span>→</span><div><small>New stage</small><b>${esc(stage)}</b></div></div><p class="smallnote">The current stage duration is retained in the timeline.</p><div class="formbuttons"><button class="secondary" data-close>Cancel</button><button class="primary" id="ui-stage-confirm">Update Stage</button></div>`,
  );
  d.querySelector("#ui-stage-confirm").onclick = async () => {
    const r = await saveEntity("Opportunities", id, {
      name: x.name,
      company: x.company,
      status: stage,
      ...(stage === "Won"
        ? { probability: 100 }
        : stage === "Lost"
          ? { probability: 0 }
          : {}),
    });
    if (r) {
      closeDialog();
      render();
      toast("Stage updated and history retained.");
    }
  };
}
function reviewDuplicateFields(old, draft, back) {
  const keys = [
    ["Name", "name"],
    ["Company", "company"],
    ["Position", "jobTitle"],
    ["Phone", "phone"],
    ["Email", "email"],
    ["Location", "location"],
    ["Tags", "tags"],
    ["Department", "department"],
  ];
  const d = showDialog(
    `${dialogTitle("Review Changes", "Choose which new fields to apply. Existing values and employment history are retained.")}<div class="tablewrap"><table class="compare-table"><thead><tr><th>Field</th><th>Current Information</th><th>New Information</th><th>Update</th></tr></thead><tbody>${keys.map(([label, key]) => `<tr><td>${label}</td><td>${esc(old[key] || "—")}</td><td class="${draft[key] && normal(old[key]) !== normal(draft[key]) ? "new-value" : ""}">${esc(draft[key] || "—")}</td><td><input type="checkbox" data-merge-key="${key}" ${draft[key] && normal(old[key]) !== normal(draft[key]) ? "checked" : ""} ${!draft[key] ? "disabled" : ""} aria-label="Update ${label}"></td></tr>`).join("")}</tbody></table></div><div class="formbuttons"><button class="secondary" id="ui-merge-back">Back</button><button class="primary" id="ui-merge-save">Update Contact</button></div>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("#ui-merge-back").onclick = back;
  d.querySelector("#ui-merge-save").onclick = async () => {
    const changes = { name: old.name, company: old.company };
    d.querySelectorAll("[data-merge-key]:checked").forEach(
      (c) => (changes[c.dataset.mergeKey] = draft[c.dataset.mergeKey]),
    );
    const r = await saveEntity("Contacts", old.id, changes);
    if (r) {
      closeDialog();
      render();
      successDialog("Contact Updated Successfully", r, "Contacts", [
        "Selected changes saved",
        "Previous information retained in contact history",
      ]);
    }
  };
}
duplicateDialog = function (k, id, draft, matches) {
  const d = showDialog(
    `${dialogTitle("Possible Match Found", "This contact may already exist. Review the changes before updating an existing record.")}<div class="duplicatechoices">${matches.map(({ record: x, reasons }, i) => `<label class="duplicate"><input type="radio" name="duplicate" value="${esc(x.id)}" ${i === 0 ? "checked" : ""}><span>${avatarHTML(x)} <b>${esc(x.name)}</b><small>${esc(x.jobTitle || "")} · ${esc(x.company)}</small><small>${esc(reasons.join(", "))}</small></span></label>`).join("")}</div><div class="formbuttons wrap"><button class="secondary" id="ui-duplicate-back">Back</button><button class="secondary" id="ui-duplicate-new">Create Separate Contact</button><button class="primary" id="ui-duplicate-review">Review Changes</button></div>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("#ui-duplicate-back").onclick = () =>
    openForm(k, id, "", draft);
  d.querySelector("#ui-duplicate-new").onclick = async () =>
    await commitRecord(k, id, draft);
  d.querySelector("#ui-duplicate-review").onclick = () => {
    const selected = d.querySelector("[name=duplicate]:checked")?.value,
      old = visibleRecord("Contacts", selected);
    if (old)
      reviewDuplicateFields(old, draft, () =>
        duplicateDialog(k, id, draft, matches),
      );
  };
};
function duplicateReview() {
  const contacts = recordsFor("Contacts", "Contacts"),
    pairs = [];
  for (let i = 0; i < contacts.length; i++)
    for (const match of findDuplicates(contacts[i], contacts[i].id))
      if (contacts.slice(i + 1).some((x) => x.id === match.record.id))
        pairs.push([contacts[i], match.record, match.reasons]);
  const d = showDialog(
    `${dialogTitle("Possible Duplicate Contacts")}${pairs.map(([a, b, reasons]) => `<div class="review-block"><p>${esc(reasons.join(", "))}</p><div class="detail-actions"><button class="secondary" data-profile="Contacts" data-id="${esc(a.id)}">${esc(a.name)} · ${esc(a.company)}</button><button class="secondary" data-profile="Contacts" data-id="${esc(b.id)}">${esc(b.name)} · ${esc(b.company)}</button></div></div>`).join("") || emptyHTML("No duplicate matches found.")}<div class="formbuttons"><button class="primary" data-close>Done</button></div>`,
  );
  d.classList.add("dialog-medium");
}

function parseCSV(text) {
  const lines = [];
  let row = [],
    cell = "",
    quoted = false;
  const s = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (quoted && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) lines.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("Unclosed CSV quote");
  row.push(cell);
  if (row.some((x) => x.trim())) lines.push(row);
  return lines;
}
function csvToContacts(text) {
  const table = parseCSV(text);
  if (table.length < 2) return [];
  const map = {
    name: "name",
    fullname: "name",
    contactname: "name",
    company: "company",
    organisation: "company",
    organization: "company",
    email: "email",
    emailaddress: "email",
    phone: "phone",
    phonenumber: "phone",
    mobile: "phone",
    jobtitle: "jobTitle",
    position: "jobTitle",
    title: "jobTitle",
    location: "location",
    city: "location",
    tags: "tags",
    department: "department",
    linkedin: "linkedIn",
    status: "status",
    notes: "notes",
  };
  const keys = table.shift().map((h) => map[normal(h).replace(/[^a-z]/g, "")]);
  return table
    .map((row) => {
      const out = {};
      keys.forEach((key, i) => {
        if (key) out[key] = row[i]?.trim() || "";
      });
      return out;
    })
    .filter((x) => x.name);
}
function vCardToContacts(text) {
  return String(text)
    .split(/BEGIN:VCARD/i)
    .slice(1)
    .map((chunk) => {
      const out = {};
      for (const line of chunk.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
        const index = line.indexOf(":");
        if (index < 0) continue;
        const key = line.slice(0, index).split(";")[0].toUpperCase(),
          val = line
            .slice(index + 1)
            .replace(/\\n/gi, "\n")
            .replace(/\\([,;\\])/g, "$1");
        if (key === "FN") out.name = val;
        if (key === "N" && !out.name)
          out.name = val.split(";").reverse().filter(Boolean).join(" ");
        if (key === "ORG") out.company = val.split(";")[0];
        if (key === "TITLE") out.jobTitle = val;
        if (key === "EMAIL" && !out.email) out.email = val;
        if (key === "TEL" && !out.phone) out.phone = val;
        if (key === "ADR")
          out.location = val.split(";").filter(Boolean).join(", ");
      }
      return out;
    })
    .filter((x) => x.name);
}
function importDialog() {
  importRows = [];
  const d = showDialog(
    `${dialogTitle("Import Contacts", "Import a contact CSV / vCard or enter details from a business card.")}<div class="segments"><button class="selected" id="ui-import-data">CSV / vCard</button><button id="ui-import-card">Business Card</button></div><div style="margin-top:20px"><label class="upload-zone">Choose CSV or vCard file<input id="contact-import-file" type="file" accept=".csv,.vcf,text/csv,text/vcard"></label><p class="smallnote">CSV headers: Name, Company, Position, Email, Phone, Location, Tags. Up to 500 contacts per import. The preview flags duplicates before saving.</p><button class="secondary compact" id="ui-import-template">Download CSV Template</button><div id="import-preview"></div></div><div class="formbuttons"><button class="secondary" data-close>Cancel</button><button class="primary" id="ui-import-save" disabled>Import Selected</button></div>`,
  );
  d.classList.add("dialog-wide");
  d.querySelector("#contact-import-file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024)
      return toast("Choose an import file smaller than 2 MB.");
    try {
      const content = await f.text();
      importRows = /\.vcf$/i.test(f.name)
        ? vCardToContacts(content)
        : csvToContacts(content);
      if (!importRows.length)
        return toast("No contacts found. A Name column is required.");
      if (importRows.length > 500)
        return toast("Import up to 500 contacts at a time.");
      d.querySelector("#import-preview").innerHTML =
        `<h3 class="wizard-heading">Review Import (${importRows.length})</h3><p class="smallnote">Possible duplicates start unchecked. You may review them by opening Add Contact separately, or deliberately select them to create separate records.</p><div class="import-preview"><table class="table"><thead><tr><th>Import</th><th>Name</th><th>Company</th><th>Email</th><th>Check</th></tr></thead><tbody>${importRows
          .map((x, i) => {
            const duplicate =
              findDuplicates(x).length > 0 ||
              importRows
                .slice(0, i)
                .some(
                  (o) =>
                    (o.email && normal(o.email) === normal(x.email)) ||
                    (normal(o.name) === normal(x.name) &&
                      normal(o.company) === normal(x.company)),
                );
            const invalid = x.email && !validEmail(x.email);
            return `<tr><td><input type="checkbox" data-import-row="${i}" ${!duplicate && !invalid ? "checked" : ""} ${invalid ? "disabled" : ""} aria-label="Import ${esc(x.name)}"></td><td>${esc(x.name)}</td><td>${esc(x.company)}</td><td>${esc(x.email)}</td><td>${invalid ? '<span class="dangertext">Invalid email</span>' : duplicate ? '<span class="import-status">Possible duplicate</span>' : "Ready"}</td></tr>`;
          })
          .join("")}</tbody></table></div>`;
      d.querySelector("#ui-import-save").disabled = false;
    } catch {
      toast("Could not read this CSV / vCard. Check its format.");
    }
  };
}
async function commitImport() {
  const d = document.getElementById("modal"),
    selected = [...d.querySelectorAll("[data-import-row]:checked")]
      .map((c) => importRows[Number(c.dataset.importRow)])
      .filter(Boolean);
  if (!selected.length) return toast("Select at least one contact.");
  const invalid = selected.find(
    (x) => !x.name || (x.email && !validEmail(x.email)),
  );
  if (invalid) return toast("Review the contact names and email addresses.");
  const timestamp = Date.now();
  if (
    await transact((next) => {
      for (const input of selected) {
        const x = {
          ...input,
          id: crypto.randomUUID(),
          name: input.name.trim(),
          company: input.company || "",
          entityType: "Contacts",
          status: statuses.Contacts.includes(input.status)
            ? input.status
            : "Active",
          ownerId: user.id,
          visibility: "shared",
          contactIds: [],
          history: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        next.Contacts.push(x);
        addLog(next, "Contact imported", x, "Contacts");
      }
    })
  ) {
    closeDialog();
    page = "Contacts";
    activeProfile = null;
    query = "";
    ui.filters.Contacts = {};
    render();
    toast(selected.length + " contacts imported.");
  }
}
function businessCardDialog() {
  const d = showDialog(
    `<form id="business-card-form">${dialogTitle("Import Business Card", "Upload a card for reference, review its details, then import.")}<p class="notice">Automatic card recognition is not connected. Enter or paste the details below while reviewing the card.</p><label class="upload-zone">Choose a business card image<input id="business-card-file" type="file" accept="image/jpeg,image/png,image/webp"></label><img id="business-card-preview" class="business-card-preview" hidden alt="Uploaded business card"><div class="form-grid">${fieldHTML("Name", "name", "", "text", true)}${fieldHTML("Company", "company")}${fieldHTML("Position", "jobTitle")}${fieldHTML("Email", "email", "", "email")}${fieldHTML("Phone", "phone", "", "tel")}${fieldHTML("Location", "location")}</div><div class="formbuttons"><button type="button" class="secondary" id="ui-import-data">Back</button><button class="primary" type="submit">Review & Import</button></div></form>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("#business-card-file").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024)
      return toast("Choose an image smaller than 5 MB.");
    const reader = new FileReader();
    reader.onload = () => {
      const img = d.querySelector("#business-card-preview");
      img.src = reader.result;
      img.hidden = false;
    };
    reader.readAsDataURL(f);
  };
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const draft = {
        ...Object.fromEntries(new FormData(e.target)),
        status: "Active",
      },
      matches = findDuplicates(draft);
    if (matches.length) duplicateDialog("Contacts", null, draft, matches);
    else await commitRecord("Contacts", null, draft);
  };
}

function scopedBackup() {
  if (!isManager()) return;
  const data = structuredClone(db);
  for (const k of RECORD_TYPES) data[k] = data[k].filter(canRead);
  data.activity = data.activity.filter(canRead);
  data.employmentHistory = data.employmentHistory.filter(canRead);
  data.emailDrafts = data.emailDrafts.filter(
    (x) => x.ownerId === user.id && linkedAccess(x),
  );
  data.notes = data.notes.filter(supplementReadable);
  data.attachments = data.attachments.filter(supplementReadable);
  data.savedViews = data.savedViews.filter((v) => v.ownerId === user.id);
  data.preferences = { [user.id]: userPrefs() };
  download(
    "DGJ-CRM-backup.json",
    JSON.stringify(data, null, 2),
    "application/json",
  );
}
csv = function () {
  if (!isManager() || !RECORD_TYPES.includes(page))
    return toast("Only the General Manager can export.");
  const selected = ui.selected[page] || new Set(),
    rows = filteredRows(page).filter(
      (x) => !selected.size || selected.has(x.id),
    ),
    cols = [
      "name",
      "company",
      "jobTitle",
      "email",
      "phone",
      "tags",
      "status",
      "reportType",
      "summary",
      "details",
      "keyTakeaways",
      "decisions",
      "nextSteps",
      "priority",
      "severity",
      "sentiment",
      "resolution",
      "date",
      "followUpDate",
      "region",
      "service",
      "value",
      "probability",
      "startDate",
      "targetDate",
      "scope",
      "ownerId",
      "assigneeId",
      "visibility",
      "contactIds",
      "opportunityId",
      "meetingId",
      "reportId",
      "notes",
    ];
  const cell = (v) =>
    '"' +
    String(Array.isArray(v) ? v.join("; ") : (v ?? ""))
      .replace(/^[\s]*[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  download(
    `DGJ-${page}-${selected.size ? "selected" : scopes[page] || "all"}.csv`,
    "\ufeff" +
      [
        cols,
        ...rows.map((x) =>
          cols.map((c) =>
            c === "status" && page === "Tasks"
              ? taskStatus(x)
              : c === "reportType" && page === "Reports"
                ? reportType(x)
                : x[c],
          ),
        ),
      ]
        .map((r) => r.map(cell).join(","))
        .join("\r\n"),
    "text/csv;charset=utf-8",
  );
  toast("Exported " + rows.length + " records from the current view.");
};

document.addEventListener(
  "click",
  async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const a = b.dataset;
    let handled = true;
    if (a.close !== undefined) closeDialog();
    else if (a.rowMenu) rowMenu(a.rowMenu, a.id);
    else if (a.undoTrash) {
      await restoreRecord(a.undoTrash, a.id);
    } else if (a.columns) columnsDialog(a.columns);
    else if (a.sort) {
      const old = ui.sort[page];
      ui.sort[page] = { key: a.sort, dir: old?.key === a.sort ? -old.dir : 1 };
      ui.pagination[page] = 1;
      render();
    } else if (a.pageIndex) {
      ui.pagination[page] = Math.max(1, Number(a.pageIndex));
      render();
    } else if (a.chartFilter) {
      closeDialog();
      page = a.kind || page;
      activeProfile = null;
      pageFilters()[a.chartFilter] =
        a.value === "Untagged" ? "Untagged" : a.value;
      ui.pagination[page] = 1;
      query = "";
      render();
    } else if (a.monthFilter) {
      const d = new Date(a.monthFilter + "-01T12:00Z");
      d.setUTCMonth(d.getUTCMonth() + 1, 0);
      ui.period[page] = {
        value: "Custom",
        from: a.monthFilter + "-01",
        to: isoDate(d),
      };
      ui.pagination[page] = 1;
      render();
    } else if (a.period) {
      ui.period[page] = { value: a.period };
      ui.pagination[page] = 1;
      render();
    } else if (a.contactView) {
      ui.contactsView = a.contactView;
      render();
    } else if (a.taskView) {
      ui.taskView = a.taskView;
      ui.pagination.Tasks = 1;
      render();
    } else if (a.notifyTask) {
      closeDialog();
      go("Tasks");
      ui.taskView = a.notifyTask;
      render();
    } else if (a.notifyToday) {
      closeDialog();
      go("Meetings");
      ui.calendar.anchor = todayISO();
      ui.calendar.view = "Day";
      pageFilters("Meetings").dateMin = todayISO();
      pageFilters("Meetings").dateMax = todayISO();
      render();
    } else if (a.duplicateReview) duplicateReview();
    else if (a.snooze) {
      if (await setPreference("snooze_" + a.snooze, Date.now() + 2 * 3600000)) {
        closeDialog();
        render();
        toast("Reminder snoozed for 2 hours while CRM is open.");
      }
    } else if (a.calendarMove) {
      const d = new Date(ui.calendar.anchor + "T12:00Z");
      if (ui.calendar.view === "Month") {
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() + Number(a.calendarMove));
      } else
        d.setUTCDate(
          d.getUTCDate() +
            Number(a.calendarMove) * (ui.calendar.view === "Week" ? 7 : 1),
        );
      ui.calendar.anchor = isoDate(d);
      render();
    } else if (a.calendarView) {
      ui.calendar.view = a.calendarView;
      render();
    } else if (a.calendarDate) bookingForm(null, { date: a.calendarDate });
    else if (a.meetingDetail) meetingDetail(a.meetingDetail);
    else if (a.reportDetail) reportDetail(a.reportDetail);
    else if (a.reportExport) exportReport(a.reportExport);
    else if (a.meetingReport) {
      const m = visibleRecord("Meetings", a.meetingReport);
      if (!m) return;
      const r = meetingReport(m);
      if (r) reportDetail(r.id);
      else startReport(null, { reportType: "Meeting", meetingId: m.id });
    } else if (a.meetingTask) {
      const m = visibleRecord("Meetings", a.meetingTask);
      if (m)
        openForm("Tasks", null, "", {
          company: m.company,
          meetingId: m.id,
          contactIds: m.contactIds,
          opportunityId: m.opportunityId,
        });
    } else if (a.reportType) {
      reportFlow.draft.reportType = a.reportType;
      reportFlow.draft.status = ["Issue", "Complaint", "Follow-up"].includes(
        a.reportType,
      )
        ? "Open"
        : "Completed";
      if (a.reportType !== "Meeting") reportFlow.draft.meetingId = "";
      reportWizard();
    } else if (a.removeReportAction) {
      collectReport();
      reportFlow.draft.actions.splice(Number(a.removeReportAction), 1);
      reportWizard();
    } else if (a.similarView) {
      const x = visibleRecord("Opportunities", a.similarView);
      if (x) {
        const d = showDialog(
          `${dialogTitle("Existing Opportunity", x.name)}${detailFields(x, "Opportunities")}<div class="formbuttons"><button class="primary" id="ui-similar-back">Back to Review</button></div>`,
        );
        d.classList.add("dialog-medium");
      }
    } else if (a.coordinate) coordinationNote(a.coordinate);
    else if (a.changeStage) stageChangeDialog(a.id, a.changeStage);
    else if (a.successProfile) profileFor(a.successProfile, a.id);
    else if (a.manageContacts) manageContacts(a.manageContacts);
    else if (a.linkCompany) linkedCompanyForm(a.linkCompany);
    else if (a.editCompany) linkedCompanyForm(a.opportunity, a.editCompany);
    else if (a.linkContactOpportunity)
      linkContactOpportunity(a.linkContactOpportunity);
    else if (a.addNote) noteForm(a.addNote, a.id);
    else if (a.editNote) {
      const n = db.notes.find(
        (n) => n.id === a.editNote && supplementReadable(n),
      );
      if (n) noteForm(n.recordType, n.recordId, n.id);
    } else if (a.deleteNote) removeSupplement("notes", a.deleteNote);
    else if (a.addFile) attachmentForm(a.addFile, a.id);
    else if (a.downloadFile) downloadAttachment(a.downloadFile);
    else if (a.deleteFile) removeSupplement("attachments", a.deleteFile);
    else if (a.actionNew) {
      const x = visibleRecord(a.kind, a.id);
      if (x)
        openForm(a.actionNew, null, "", {
          company: x.company,
          contactIds: a.kind === "Contacts" ? [x.id] : x.contactIds || [],
          opportunityId: a.kind === "Opportunities" ? x.id : "",
        });
    } else if (a.actionLog) {
      profileFor(a.actionLog, a.id);
      communicationForm();
    } else if (b.id === "notifications" || b.id === "ui-notifications")
      notificationCenter();
    else if (b.id === "ui-hide-banner") {
      ui.bannerHidden = true;
      render();
    } else if (b.id === "ui-clear") {
      ui.filters[page] = {};
      ui.period[page] = { value: "All" };
      query = "";
      regionFilter = "";
      ui.pagination[page] = 1;
      ui.selected[page] = new Set();
      render();
    } else if (b.id === "ui-calendar-today") {
      ui.calendar.anchor = todayISO();
      render();
    } else if (b.id === "ui-save-view") saveViewDialog();
    else if (b.id === "ui-upcoming") {
      pageFilters("Meetings").dateMin = todayISO();
      pageFilters("Meetings").status = "Scheduled";
      render();
    } else if (b.id === "ui-report-action") {
      collectReport();
      reportFlow.draft.actions.push({
        name: "",
        date: reportFlow.draft.followUpDate || "",
        assigneeId: user.id,
      });
      reportWizard();
    } else if (b.id === "ui-report-back") {
      collectReport();
      reportFlow.step = Math.max(0, reportFlow.step - 1);
      reportWizard();
    } else if (b.id === "ui-report-draft") await submitReport(true);
    else if (b.id === "ui-opportunity-back") {
      collectOpportunity();
      opportunityFlow.step = Math.max(0, opportunityFlow.step - 1);
      opportunityWizard();
    } else if (b.id === "ui-similar-back") await reviewOpportunitySimilarity();
    else if (b.id === "ui-similar-continue") await createOpportunity();
    else if (b.id === "ui-coordinate-back") await reviewOpportunitySimilarity();
    else if (b.id === "ui-coordinate-copy") {
      const form = document.getElementById("coordination-form");
      const value =
        form.elements.subject.value + "\n\n" + form.elements.body.value;
      if (navigator.clipboard?.writeText)
        navigator.clipboard
          .writeText(value)
          .then(() => toast("Coordination note copied."))
          .catch(() => toast("Copy the text from the note fields."));
      else toast("Copy the text from the note fields.");
    } else if (b.id === "ui-import" || b.id === "ui-import-data")
      importDialog();
    else if (b.id === "ui-import-card") businessCardDialog();
    else if (b.id === "ui-import-template")
      download(
        "DGJ-contacts-template.csv",
        'Name,Company,Position,Email,Phone,Location,Tags\r\nSample Contact,Sample Company,Project Manager,contact@example.com,+966500000000,Riyadh,"Client, Strategic"',
        "text/csv;charset=utf-8",
      );
    else if (b.id === "ui-import-save") await commitImport();
    else if (b.id === "backup") scopedBackup();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true,
);

document.addEventListener(
  "input",
  (e) => {
    const t = e.target;
    if (t.id === "listsearch") {
      e.stopImmediatePropagation();
      query = t.value;
      ui.pagination[page] = 1;
      refreshKeepingFocus("listsearch", t.selectionStart);
    }
  },
  true,
);
document.addEventListener(
  "change",
  async (e) => {
    const t = e.target,
      a = t.dataset;
    let handled = true;
    if (a.filter) {
      pageFilters()[a.filter] = t.value;
      ui.pagination[page] = 1;
      ui.selected[page] = new Set();
      render();
    } else if (a.periodDate) {
      const p = ui.period[page] || { value: "Custom" };
      p[a.periodDate] = t.value;
      ui.period[page] = p;
      if (p.from && p.to && p.from > p.to) {
        p[a.periodDate] = "";
        toast("Start date must be before the end date.");
      }
      ui.pagination[page] = 1;
      render();
    } else if (a.selectRow) {
      const set =
        ui.selected[a.selectRow] || (ui.selected[a.selectRow] = new Set());
      if (t.checked) set.add(a.id);
      else set.delete(a.id);
      render();
    } else if (a.selectAll) {
      const k = a.selectAll,
        size = Number(userPrefs().pageSize || 8),
        index = ui.pagination[k] || 1,
        rows = filteredRows(k).slice((index - 1) * size, index * size),
        set = ui.selected[k] || (ui.selected[k] = new Set());
      for (const x of rows)
        if (t.checked) set.add(x.id);
        else set.delete(x.id);
      render();
    } else if (a.columnToggle) {
      const hidden = new Set(userPrefs()["columns_" + a.kind] || []);
      if (t.checked) hidden.delete(a.columnToggle);
      else hidden.add(a.columnToggle);
      if (await setPreference("columns_" + a.kind, [...hidden])) {
        render();
        columnsDialog(a.kind);
      }
    } else if (a.check) {
      const x = visibleRecord("Tasks", a.check);
      if (!x) return;
      const target = { ...detailRecord },
        done = t.checked;
      const r = await saveEntity("Tasks", x.id, {
        name: x.name,
        company: x.company,
        status: done ? "Completed" : "Open",
        completedAt: done ? Date.now() : null,
      });
      if (r) {
        render();
        if (target.type === "Meetings") meetingDetail(target.id);
        else if (target.type === "Reports") reportDetail(target.id);
        toast(done ? "Task completed." : "Task reopened.");
      }
    } else if (t.id === "ui-view-picker") {
      const v = db.savedViews.find(
        (v) => v.id === t.value && v.ownerId === user.id,
      );
      if (v) {
        ui.filters.Contacts = { ...v.filters };
        ui.sort.Contacts = { ...v.sort };
        query = v.query || "";
        ui.contactsView = v.display || "List";
        ui.pagination.Contacts = 1;
        await setPreference("columns_Contacts", v.columns || []);
        render();
      }
    } else if (t.id === "ui-timeline-sort") {
      ui.timelineSort = t.value;
      render();
    } else if (t.name === "meetingId" && t.closest("#report-wizard")) {
      collectReport();
      applyMeetingToReport(t.value);
      reportWizard();
    } else handled = false;
    if (handled) e.stopImmediatePropagation();
  },
  true,
);

/* Escape closes native dialogs. Follow-up indicators refresh while the CRM is open. */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelector("#addmenu")?.setAttribute("hidden", "");
    if (document.getElementById("modal").open) closeDialog();
  }
});
setInterval(() => {
  if (
    !document.getElementById("modal").open &&
    !document.querySelector("#main input:focus,#main select:focus")
  )
    render();
}, 60000);
render();
