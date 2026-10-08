/* Profile overview, career history, notes and local attachments. */
const relatedSupplement = (row, k, id) =>
  row.recordType === k && row.recordId === id;
function linkedCompaniesSection(x) {
  const companies = [
    { id: "primary", name: x.company, relationship: "Client", primary: true },
    ...(Array.isArray(x.linkedCompanies) ? x.linkedCompanies : []),
  ].filter((c) => c.name);
  return `<div class="sectiontoolbar"><h3 class="wizard-heading">Linked Companies</h3><button class="secondary compact" data-link-company="${esc(x.id)}">＋ Link Company</button></div>${companies.map((c) => `<div class="related-person">${icon("Companies")}<div class="grow"><b>${esc(c.name)}</b><small>${esc(c.relationship || "Related Company")}</small></div>${c.primary ? '<span class="pill status-active">Primary</span>' : `<button class="secondary compact" data-edit-company="${esc(c.id)}" data-opportunity="${esc(x.id)}">Edit</button>`}</div>`).join("") || emptyHTML("No companies linked.")}`;
}
function linkedCompanyForm(id, companyId) {
  const o = visibleRecord("Opportunities", id);
  if (!o) return;
  const old = o.linkedCompanies?.find((c) => c.id === companyId);
  const d = showDialog(
    `<form id="linked-company-form">${dialogTitle(old ? "Edit Linked Company" : "Link Company", o.name)}${fieldHTML("Company Name", "name", old?.name, "text", true)}${selectHTML("Relationship", "relationship", old?.relationship || "Consultant", ["Client", "Joint Venture Partner", "Consultant", "Contractor", "Developer", "Other"])}${textareaHTML("Notes", "notes", old?.notes)}<div class="formbuttons"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save Company</button></div></form>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    if (!v.name.trim()) return;
    if (normal(v.name) === normal(o.company))
      return toast("This is already the primary company.");
    const record = { ...old, ...v, id: old?.id || crypto.randomUUID() },
      companies = (o.linkedCompanies || []).filter((c) => c.id !== record.id);
    if (companies.some((c) => normal(c.name) === normal(record.name)))
      return toast("That company is already linked.");
    companies.push(record);
    if (
      await saveEntity("Opportunities", id, {
        name: o.name,
        company: o.company,
        linkedCompanies: companies,
      })
    ) {
      closeDialog();
      render();
      toast("Company linked to opportunity.");
    }
  };
}
function supplementReadable(row) {
  const p = visibleRecord(row.recordType, row.recordId);
  return !!p && inScope(p);
}
function profileNotes(k, id) {
  return db.notes
    .filter((n) => relatedSupplement(n, k, id) && supplementReadable(n))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
function profileFiles(k, id) {
  return db.attachments
    .filter((n) => relatedSupplement(n, k, id) && supplementReadable(n))
    .sort((a, b) => b.createdAt - a.createdAt);
}
profileFor = function (k, id) {
  if (!["Contacts", "Opportunities"].includes(k)) return;
  const x = visibleRecord(k, id);
  if (!x) return toast("Profile is not available.");
  closeDialog();
  activeProfile = { type: k, id };
  profileTab = "Overview";
  page = k;
  query = "";
  regionFilter = "";
  document.getElementById("search").value = "";
  render();
  window.scrollTo(0, 0);
};
function profileStats(k, x) {
  const isContact = k === "Contacts";
  if (isContact) return "";
  return statCards([
    {
      label: "Value (SAR)",
      value: numberLabel(x.value),
      icon: "Opportunities",
    },
    {
      label: "Expected Close",
      value: dateLabel(x.targetDate),
      icon: "Meetings",
    },
    {
      label: "Total Duration",
      value: oppDuration(x) === null ? "—" : oppDuration(x) + " days",
      icon: "Clock",
    },
    {
      label: "Days in Current Stage",
      value: stageDuration(x) === null ? "—" : stageDuration(x) + " days",
      icon: "Clock",
    },
    {
      label: "Probability",
      value: x.probability === undefined ? "—" : x.probability + "%",
      icon: "Opportunities",
    },
    {
      label: "Type / Location",
      value: esc(x.opportunityType || "—"),
      icon: "Pin",
      note: x.region || "Not recorded",
    },
  ]);
}
function contactChannels(x) {
  const email =
      x.email && validEmail(x.email)
        ? `<a href="mailto:${encodeURIComponent(x.email)}">${esc(x.email)}</a>`
        : esc(x.email || "Not recorded"),
    phone = x.phone
      ? `<a href="tel:${esc(x.phone.replace(/[^+\d]/g, ""))}">${esc(x.phone)}</a>`
      : "Not recorded",
    linked = safeHTTPS(x.linkedIn);
  return `<div class="profilecontact-strip">${[
    ["Email", "Email", email],
    ["Phone", "Phone", phone],
    ["Pin", "Location", esc(x.location || "Not recorded")],
    [
      "Contacts",
      "LinkedIn",
      linked
        ? `<a href="${esc(linked)}" target="_blank" rel="noopener noreferrer">${esc(x.linkedIn)}</a>`
        : "Not recorded",
    ],
  ]
    .map(
      ([i, l, v]) =>
        `<div class="contact-channel">${icon(i)}<div><small>${l}</small><span>${v}</span></div></div>`,
    )
    .join("")}</div>`;
}
function profileOverview(k, x) {
  const tasks = relatedRows("Tasks", k, x.id)
      .filter((t) => t.status !== "Completed")
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")),
    meetings = relatedRows("Meetings", k, x.id)
      .filter((m) => m.status === "Scheduled" && m.date >= todayISO())
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    contacts =
      k === "Opportunities"
        ? recordsFor("Contacts", k).filter((c) => x.contactIds?.includes(c.id))
        : recordsFor("Contacts", k).filter(
            (c) => c.id !== x.id && normal(c.company) === normal(x.company),
          ),
    opps =
      k === "Contacts"
        ? recordsFor("Opportunities", k).filter((o) =>
            o.contactIds?.includes(x.id),
          )
        : [];
  const about =
    k === "Contacts"
      ? `<dl class="profiledetails">${[
          ["Company", x.company],
          ["Position", x.jobTitle],
          ["Department", x.department],
          ["Preferred Contact Method", x.preferredChannel],
          ["Location", x.location],
        ]
          .map(
            ([l, v]) =>
              `<div><dt>${l}</dt><dd>${esc(v || "Not recorded")}</dd></div>`,
          )
          .join(
            "",
          )}</dl>${x.notes ? '<p class="eventdetail">' + esc(x.notes) + "</p>" : ""}`
      : detailFields(x, k);
  return `<div class="profile-overview">${panelHTML(k === "Contacts" ? "About This Contact" : "About This Opportunity", about, `<button class="secondary compact" data-edit="${k}" data-id="${esc(x.id)}">Edit</button>`)}${panelHTML(
    "Next Steps",
    tasks
      .slice(0, 5)
      .map(
        (t) =>
          `<div class="deadline-row"><input type="checkbox" data-check="${esc(t.id)}" aria-label="Complete ${esc(t.name)}"><button data-edit="Tasks" data-id="${esc(t.id)}">${esc(t.name)}</button><span class="${taskStatus(t) === "Overdue" ? "dangertext" : ""}">${dateLabel(t.date)}</span></div>`,
      )
      .join("") || emptyHTML("No pending linked tasks."),
    '<button class="secondary compact" data-profile-new="Tasks">＋ Add Task</button>',
  )}${panelHTML("Upcoming Meetings", meetings.slice(0, 3).map(meetingListCard).join("") || emptyHTML("No upcoming linked meetings."), '<button class="secondary compact" data-profile-new="Meetings">＋ Schedule</button>')}${panelHTML("Recent Activity", profileTimeline(k, x.id), '<button class="link" data-profiletab="Timeline">View All</button>')}${panelHTML(
    k === "Contacts" ? "Linked Opportunities" : "Related Contacts",
    k === "Contacts"
      ? opps
          .map(
            (o) =>
              `<div class="row"><div class="grow">${profileLink("Opportunities", o.id, o.name)}<small>${esc(o.company)}</small></div>${pillHTML(o.status)}</div>`,
          )
          .join("") || emptyHTML("No linked opportunities.")
      : contacts
          .slice(0, 6)
          .map(
            (c) =>
              `<div class="related-person">${avatarHTML(c)}<div class="grow">${profileLink("Contacts", c.id, c.name)}<small>${esc(c.jobTitle || c.company)}</small></div><span class="tag">${esc(x.contactRoles?.[c.id] || "Contact")}</span></div>`,
          )
          .join("") || emptyHTML("No linked contacts."),
    k === "Contacts"
      ? '<button class="secondary compact" data-profile-new="Opportunities">＋ Add Opportunity</button>'
      : `<button class="secondary compact" data-manage-contacts="${esc(x.id)}">＋ Link Contact</button>`,
    "span-two",
  )}</div>`;
}
function profileInfo(k, x) {
  const contacts = k === "Contacts";
  return `<aside class="profileinfo"><h2>${contacts ? "Contact Information" : "Opportunity Details"}</h2><dl>${(contacts
    ? [
        ["Email", x.email],
        ["Phone", x.phone],
        ["Company", x.company],
        ["Position", x.jobTitle],
        ["Preferred Method", x.preferredChannel],
      ]
    : [
        ["Reference", x.reference],
        ["Company", x.company],
        ["Stage", x.status],
        ["Service Line", x.service],
        ["Region", x.region],
      ]
  )
    .map(([l, v]) => `<dt>${l}</dt><dd>${esc(v || "Not recorded")}</dd>`)
    .join(
      "",
    )}</dl><div class="profilesummary">${["Meetings", "Tasks", "Reports"].map((t) => `<div><b>${relatedRows(t, k, x.id).length}</b><span>${t}</span></div>`).join("")}</div><button class="secondary fullwidth" data-profile-new="Meetings">＋ Schedule Meeting</button><button class="secondary fullwidth" data-profile-new="Tasks">＋ Add Task</button><button class="secondary fullwidth" data-profile-new="Reports">＋ Add Report</button><button class="secondary fullwidth" id="logcommunication">＋ Log Communication</button></aside>`;
}
profilePage = function () {
  const { type: k, id } = activeProfile,
    x = visibleRecord(k, id);
  if (!x) return emptyHTML("This profile is no longer available.");
  const contact = k === "Contacts",
    notes = profileNotes(k, id),
    files = profileFiles(k, id),
    menu = contact
      ? [
          "Overview",
          "Timeline",
          "Company History",
          "Related Contacts",
          "Opportunities",
          "Meetings",
          "Tasks",
          "Reports",
          "Complaints",
          "Communication",
          "Notes",
          "Files",
          "Details",
        ]
      : [
          "Overview",
          "Timeline",
          "Contacts",
          "Meetings",
          "Tasks",
          "Reports",
          "Complaints",
          "Communication",
          "Notes",
          "Files",
          "Details",
        ];
  let content = "";
  if (profileTab === "Overview")
    content =
      profileOverview(k, x) +
      (contact ? "" : panelHTML("Companies", linkedCompaniesSection(x)));
  else if (profileTab === "Timeline") content = profileTimeline(k, id);
  else if (
    profileTab === "Company History" ||
    profileTab === "Employment History"
  )
    content = `<div class="profile-overview">${panelHTML("Company History", employmentSection(id))}${panelHTML("Related Contacts – Same Company", sameCompanyPeople(x))}</div>`;
  else if (
    profileTab === "Related Contacts" ||
    profileTab === "Contacts" ||
    profileTab === "Related Records"
  )
    content = relatedPeople(k, x);
  else if (profileTab === "Opportunities") content = linkedOpportunities(x);
  else if (profileTab === "Communication")
    content =
      `<div class="sectiontoolbar"><span class="muted">Calls, emails, messages and notes</span><button class="primary" id="logcommunication">＋ Log Communication</button></div>` +
      profileTimeline(k, id, true) +
      (contact ? "" : draftSection(x));
  else if (profileTab === "Details") content = detailFields(x, k);
  else if (profileTab === "Notes") content = notesSection(k, id);
  else if (profileTab === "Files") content = filesSection(k, id);
  else content = relationTable(profileTab, k, id);
  return `<div class="profilebreadcrumb"><button id="backprofiles">← Back to ${k}</button></div><section class="profilehero"><div class="profileavatar">${contact ? esc(initials(x.name)) : icon("Opportunities")}</div><div class="profileheading"><div class="profiletype">${contact ? "CONTACT" : "OPPORTUNITY"} PROFILE</div><h1>${esc(x.name)}</h1><p>${esc(x.company)}${contact && x.jobTitle ? " · " + esc(x.jobTitle) : ""}</p><div class="profilebadges">${tagHTML(tagsOf(x))}${pillHTML(x.status)}<span class="pill ${x.visibility === "private" ? "private" : ""}">${x.visibility === "private" ? "Private" : "Shared"}</span><small class="muted">Owner: ${esc(userName(x.ownerId))}</small></div></div><div class="profileactions"><button class="secondary" data-edit="${k}" data-id="${esc(id)}">${icon("Edit")} Edit</button>${contact ? '<button class="secondary" data-link-contact-opportunity="' + esc(id) + '">Add to Opportunity</button>' : `<button class="secondary" data-email="${esc(id)}">${icon("Email")} Email Company</button>`}<button class="primary" data-profile-new="Meetings">${icon("Meetings")} Schedule Meeting</button>${isManager() ? `<button class="secondary dangertext" data-delete="${k}" data-id="${esc(id)}">${icon("Trash")}</button>` : ""}</div></section>${contact ? contactChannels(x) : profileStats(k, x) + panelHTML("Stage Progress", pipelineHTML(null, x))}<div class="profilelayout">${profileInfo(k, x)}<section class="profilecontent"><div class="profiletabs">${menu.map((t) => `<button data-profiletab="${t}" class="${profileTab === t ? "selected" : ""}">${t}${t === "Notes" ? " (" + notes.length + ")" : t === "Files" ? " (" + files.length + ")" : ""}</button>`).join("")}</div>${content}</section></div>`;
};
function sameCompanyPeople(x) {
  const rows = recordsFor("Contacts", "Contacts").filter(
    (c) =>
      c.id !== x.id && x.company && normal(c.company) === normal(x.company),
  );
  return (
    rows
      .map(
        (c) =>
          `<div class="related-person">${avatarHTML(c)}<div class="grow">${profileLink("Contacts", c.id, c.name)}<small>${esc(c.jobTitle || "Position not recorded")}</small></div>${c.email && validEmail(c.email) ? `<a class="secondary compact" href="mailto:${encodeURIComponent(c.email)}" aria-label="Email ${esc(c.name)}">${icon("Email")}</a>` : ""}</div>`,
      )
      .join("") || emptyHTML("No other contacts at this company.")
  );
}
function linkedOpportunities(x) {
  const rows = recordsFor("Opportunities", "Contacts").filter((o) =>
    o.contactIds?.includes(x.id),
  );
  return `<div class="sectiontoolbar"><span class="muted">${rows.length} linked opportunities</span><button class="primary" data-link-contact-opportunity="${esc(x.id)}">＋ Link Opportunity</button></div>${rows.map((o) => `<div class="related-person"><span>${icon("Opportunities")}</span><div class="grow">${profileLink("Opportunities", o.id, o.name)}<small>${esc(o.company)} · ${esc(o.service || "")}</small></div>${pillHTML(o.status)}<span>${numberLabel(o.value)} SAR</span></div>`).join("") || emptyHTML("No opportunities linked yet.")}`;
}
relatedPeople = function (k, x) {
  if (k === "Opportunities") {
    const rows = recordsFor("Contacts", "Opportunities").filter((c) =>
      x.contactIds?.includes(c.id),
    );
    return `<div class="sectiontoolbar"><span class="muted">${rows.length} linked contacts</span><button class="primary" data-manage-contacts="${esc(x.id)}">＋ Manage Contacts</button></div>${rows.map((c) => `<div class="related-person">${avatarHTML(c)}<div class="grow">${profileLink("Contacts", c.id, c.name)}<small>${esc(c.company)} · ${esc(c.jobTitle || "")}</small></div><span class="tag">${esc(x.contactRoles?.[c.id] || "Contact")}</span></div>`).join("") || emptyHTML("No linked contacts.")}`;
  }
  const opps = recordsFor("Opportunities", "Contacts").filter((o) =>
      o.contactIds?.includes(x.id),
    ),
    ids = new Set(opps.flatMap((o) => o.contactIds || [])),
    others = recordsFor("Contacts", "Contacts").filter(
      (c) => c.id !== x.id && ids.has(c.id),
    );
  return `<div class="related-section"><h3>Same Company (${esc(x.company || "Not recorded")})</h3>${sameCompanyPeople(x)}</div><div class="related-section"><h3>Same Opportunity</h3>${
    others
      .map(
        (c) =>
          `<div class="related-person">${avatarHTML(c)}<div class="grow">${profileLink("Contacts", c.id, c.name)}<small>${esc(c.company)} · ${esc(c.jobTitle || "")}</small><small>${esc(
            opps
              .filter((o) => o.contactIds.includes(c.id))
              .map((o) => o.name)
              .join(", "),
          )}</small></div></div>`,
      )
      .join("") || emptyHTML("No other contacts share a linked opportunity.")
  }</div>`;
};
relationTable = function (type, k, id) {
  const rows = relatedRows(type, k, id);
  return `<div class="sectiontoolbar"><span class="muted">${rows.length} linked ${type.toLowerCase()}</span><button class="primary" data-profile-new="${type}">＋ Add ${singular(type)}</button></div><div class="tablewrap"><table class="table workspace-table"><thead><tr><th>Title</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${columnCell(type, r, "name")}</td><td>${pillHTML(type === "Tasks" ? taskStatus(r) : r.status)}</td><td>${dateLabel(r.date)}${r.time ? " · " + timeLabel(r.time) : ""}</td><td>${rowActions(type, r)}</td></tr>`).join("")}</tbody></table>${rows.length ? "" : emptyHTML("No linked records yet.")}</div>`;
};
employmentSection = function (id) {
  const contact = visibleRecord("Contacts", id),
    rows = visibleHistoryRows("Contacts", id).sort((a, b) =>
      (b.startDate || "").localeCompare(a.startDate || ""),
    ),
    hasCurrent = rows.some(
      (r) => !r.endDate && normal(r.company) === normal(contact?.company),
    );
  return `<div class="sectiontoolbar"><span class="muted">Career history stays with this contact.</span><button class="secondary compact" id="addemployment">＋ Add Position</button></div>${!hasCurrent && contact?.company ? `<div class="employmentcard current-role"><div><h3>${esc(contact.jobTitle || "Current role")}</h3><p>${esc(contact.company)}${contact.department ? " · " + esc(contact.department) : ""}</p><small class="muted">Start date not recorded — Present</small></div><span class="pill status-active">Current</span></div>` : ""}${rows.map((r) => `<div class="employmentcard ${r.endDate ? "" : "current-role"}"><div><h3>${esc(r.jobTitle || "Role not recorded")}</h3><p>${esc(r.company)}${r.department ? " · " + esc(r.department) : ""}</p><small class="muted">${r.startDate ? dateLabel(r.startDate) : "Start date not recorded"} — ${r.endDate ? dateLabel(r.endDate) : "Present"}</small>${r.notes ? '<p class="eventdetail">' + esc(r.notes) + "</p>" : ""}</div><button class="secondary compact" data-employment-edit="${esc(r.id)}">Edit</button></div>`).join("")}`;
};
employmentForm = function (id) {
  if (activeProfile?.type !== "Contacts") return;
  const contact = visibleRecord("Contacts", activeProfile.id);
  if (!contact) return;
  const old = id
    ? db.employmentHistory.find(
        (x) => x.id === id && x.contactId === contact.id && linkedAccess(x),
      )
    : null;
  if (id && !old) return;
  const x = old || {};
  const d = showDialog(
    `<form id="position-form">${dialogTitle(old ? "Edit Position" : "Add Position")}<div class="form-grid">${fieldHTML("Company", "company", x.company, "text", true)}${fieldHTML("Position", "jobTitle", x.jobTitle, "text", true)}${fieldHTML("Department", "department", x.department)}${fieldHTML("Start Date", "startDate", x.startDate, "date")}${fieldHTML("End Date (blank for current role)", "endDate", x.endDate, "date")}</div><label class="formfield"><input type="checkbox" name="updateProfile" style="display:inline;width:auto"> Make this the current position on the contact profile</label>${textareaHTML("Notes", "notes", x.notes)}<div class="formbuttons"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save Position</button></div></form>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      v = Object.fromEntries(fd);
    if (v.endDate && v.startDate && v.endDate < v.startDate)
      return toast("End date cannot precede start date.");
    if (fd.has("updateProfile") && v.endDate)
      return toast("A current position must have no end date.");
    const rec = {
      ...old,
      ...v,
      id: old?.id || crypto.randomUUID(),
      contactId: contact.id,
      ownerId: old?.ownerId || user.id,
      visibility: contact.visibility,
      createdAt: old?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    delete rec.updateProfile;
    const write = (next) => {
      if (fd.has("updateProfile"))
        for (const h of next.employmentHistory)
          if (h.contactId === contact.id && h.id !== rec.id && !h.endDate)
            h.endDate = v.startDate || todayISO();
      next.employmentHistory = next.employmentHistory.filter(
        (h) => h.id !== rec.id,
      );
      next.employmentHistory.push(rec);
      addLog(
        next,
        "Employment history " + (old ? "updated" : "added"),
        contact,
        "Contacts",
      );
    };
    const ok = fd.has("updateProfile")
      ? !!(await saveEntity(
          "Contacts",
          contact.id,
          {
            name: contact.name,
            company: v.company,
            jobTitle: v.jobTitle,
            department: v.department,
          },
          write,
        ))
      : await transact(write);
    if (ok) {
      closeDialog();
      profileTab = "Company History";
      render();
      toast("Position saved. Previous roles retained.");
    }
  };
};
function manageContacts(id) {
  const o = visibleRecord("Opportunities", id);
  if (!o) return;
  const contacts = recordsFor("Contacts", "Linking");
  const d = showDialog(
    `<form id="manage-contacts">${dialogTitle("Contacts & Roles", o.name)}${contacts.map((c) => `<div class="related-person"><input name="contactIds" type="checkbox" value="${esc(c.id)}" ${o.contactIds?.includes(c.id) ? "checked" : ""} aria-label="Link ${esc(c.name)}">${avatarHTML(c)}<div class="grow"><b>${esc(c.name)}</b><small>${esc(c.company)} · ${esc(c.jobTitle || "")}</small></div><select name="role_${esc(c.id)}" aria-label="Role for ${esc(c.name)}">${["Contact", "Decision Maker", "Main Contact", "Technical Contact", "Commercial Contact", "Influencer"].map((r) => `<option ${o.contactRoles?.[c.id] === r ? "selected" : ""}>${r}</option>`).join("")}</select></div>`).join("") || emptyHTML("Create a contact first.")}<div class="formbuttons"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save Links</button></div></form>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      ids = fd.getAll("contactIds"),
      roles = {};
    for (const c of ids) roles[c] = fd.get("role_" + c);
    if (
      await saveEntity("Opportunities", id, {
        name: o.name,
        company: o.company,
        contactIds: ids,
        contactRoles: roles,
      })
    ) {
      closeDialog();
      render();
      toast("Contact links updated.");
    }
  };
}
function linkContactOpportunity(id) {
  const c = visibleRecord("Contacts", id);
  if (!c) return;
  const opps = recordsFor("Opportunities", "Linking");
  const d = showDialog(
    `<form id="link-opportunity">${dialogTitle("Add Contact to Opportunity", c.name)}${selectHTML("Opportunity", "opportunityId", "", [["", "Choose an opportunity"], ...opps.map((o) => [o.id, o.name])], true)}${selectHTML("Role in Opportunity", "role", "Contact", ["Contact", "Decision Maker", "Main Contact", "Technical Contact", "Commercial Contact", "Influencer"])}<div class="formbuttons"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save Link</button></div></form>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target)),
      o = visibleRecord("Opportunities", v.opportunityId);
    if (!o) return toast("Choose an available opportunity.");
    if (
      await saveEntity("Opportunities", o.id, {
        name: o.name,
        company: o.company,
        contactIds: [...new Set([...(o.contactIds || []), id])],
        contactRoles: { ...o.contactRoles, [id]: v.role },
      })
    ) {
      closeDialog();
      render();
      toast("Contact linked to opportunity.");
    }
  };
}
function notesSection(k, id) {
  const notes = profileNotes(k, id);
  return `<div class="sectiontoolbar"><span class="muted">${notes.length} notes</span><button class="primary" data-add-note="${k}" data-id="${esc(id)}">＋ Add Note</button></div>${notes.map((n) => `<article class="note-card"><h3>${esc(n.title)}</h3><small>${fullDate(n.updatedAt)} · ${esc(userName(n.ownerId))}</small><p>${esc(n.body)}</p><div>${n.ownerId === user.id || isManager() ? `<button class="secondary compact" data-edit-note="${esc(n.id)}">Edit</button>` : ""}${isManager() ? `<button class="secondary compact dangertext" data-delete-note="${esc(n.id)}">Delete</button>` : ""}</div></article>`).join("") || emptyHTML("No notes saved yet.")}`;
}
function noteForm(k, id, noteId) {
  const p = visibleRecord(k, id),
    old = noteId
      ? db.notes.find((n) => n.id === noteId && supplementReadable(n))
      : null;
  if (!p || (noteId && !old)) return;
  if (old && old.ownerId !== user.id && !isManager())
    return toast("Only the author or General Manager can edit this note.");
  const d = showDialog(
    `<form id="note-form">${dialogTitle(old ? "Edit Note" : "Add Note", p.name)}${fieldHTML("Title", "title", old?.title, "text", true)}${textareaHTML("Note", "body", old?.body, true, 6)}<div class="formbuttons"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">Save Note</button></div></form>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    if (!v.title.trim() || !v.body.trim())
      return toast("Enter a title and note.");
    if (!visibleRecord(k, id)) return toast("Profile is no longer available.");
    const n = {
      ...old,
      ...v,
      id: old?.id || crypto.randomUUID(),
      recordType: k,
      recordId: id,
      ownerId: old?.ownerId || user.id,
      visibility: p.visibility,
      createdAt: old?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    if (
      await transact((next) => {
        next.notes = next.notes.filter((x) => x.id !== n.id);
        next.notes.push(n);
        addLog(next, "Note " + (old ? "updated" : "added"), p, k);
      })
    ) {
      closeDialog();
      if (activeProfile) profileTab = "Notes";
      render();
      toast("Note saved.");
    }
  };
}
function filesSection(k, id) {
  const files = profileFiles(k, id);
  return `<div class="sectiontoolbar"><span class="muted">${files.length} attached files</span><button class="secondary compact" data-add-file="${k}" data-id="${esc(id)}">＋ Attach File</button></div><div class="files-list">${files.map((f) => `<div class="file-card">${icon("Files")}<div class="grow"><b>${esc(f.name)}</b><small>${Math.ceil(f.size / 1024)} KB · ${dateLabel(new Date(f.createdAt + 3 * 3600000).toISOString().slice(0, 10))} · ${esc(userName(f.ownerId))}</small></div><button class="secondary compact" data-download-file="${esc(f.id)}">Download</button>${isManager() ? `<button class="dangertext" data-delete-file="${esc(f.id)}" aria-label="Delete ${esc(f.name)}">×</button>` : ""}</div>`).join("") || emptyHTML("No files attached yet.")}</div>`;
}
function attachmentForm(k, id) {
  const p = visibleRecord(k, id);
  if (!p) return;
  const d = showDialog(
    `${dialogTitle("Attach File", p.name)}<p class="smallnote">Files are saved with this CRM record in shared storage. Maximum 1.5 MB per file, 3 MB of attachments in total.</p><label class="upload-zone">Choose a document or image<input id="attachment-file" type="file"></label><div class="formbuttons"><button class="secondary" data-close>Cancel</button><button class="primary" id="ui-upload-file">Attach File</button></div>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("#ui-upload-file").onclick = async () => {
    const file = d.querySelector("input").files[0];
    if (!file) return toast("Choose a file.");
    if (file.size > 1.5 * 1024 * 1024)
      return toast("Choose a file smaller than 1.5 MB.");
    if (
      db.attachments.reduce((s, f) => s + Number(f.size || 0), 0) + file.size >
      3 * 1024 * 1024
    )
      return toast(
        "Attachment storage is full. Remove a file or download a backup.",
      );
    const button = d.querySelector("#ui-upload-file");
    button.disabled = true;
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      if (!visibleRecord(k, id)) return toast("Record is no longer available.");
      const f = {
        id: crypto.randomUUID(),
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        data,
        recordType: k,
        recordId: id,
        ownerId: user.id,
        visibility: p.visibility,
        createdAt: Date.now(),
      };
      if (
        await transact((next) => {
          next.attachments.push(f);
          addLog(next, "File attached", p, k);
        })
      ) {
        closeDialog();
        if (activeProfile) profileTab = "Files";
        render();
        if (k === "Reports") reportDetail(id);
        toast("File attached.");
      }
    } catch {
      toast("Could not read this file.");
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}
function downloadAttachment(id) {
  const f = db.attachments.find((x) => x.id === id && supplementReadable(x));
  if (!f) return toast("File is unavailable.");
  try {
    const payload = String(f.data).split(",")[1],
      bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    download(f.name, bytes, f.mime || "application/octet-stream");
  } catch {
    toast("The attachment could not be read.");
  }
}
function removeSupplement(kind, id) {
  if (!isManager()) return toast("Only the General Manager can delete.");
  const row = db[kind].find((x) => x.id === id && supplementReadable(x));
  if (!row) return;
  const d = showDialog(
    `${dialogTitle("Delete " + (kind === "notes" ? "Note" : "File") + "?")}<p class="smallnote">${esc(row.title || row.name)} will be removed from this record.</p><div class="formbuttons"><button class="secondary" data-close>Cancel</button><button class="primary" id="ui-delete-supplement">Delete</button></div>`,
  );
  d.querySelector("#ui-delete-supplement").onclick = async () => {
    if (!isManager()) return;
    if (
      await transact((next) => {
        next[kind] = next[kind].filter((x) => x.id !== id);
      })
    ) {
      closeDialog();
      render();
      toast("Removed.");
    }
  };
}
