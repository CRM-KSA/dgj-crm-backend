/* DGJ CRM workspace extension. Keep app.js as the original workflow layer.
   All counts, charts and links below use the same authorized local records.
   Shared Microsoft data and sending messages require the existing integration contract. */
const originalCRM = {
  render,
  home,
  listRows,
  profilePage,
  openForm,
  commitRecord,
  extraFields,
  normalizeDB,
  showDialog,
  closeDialog,
  relatedPeople,
  employmentSection,
  csv,
  calendar,
};
const PALETTE = [
  "#535a4e",
  "#969b88",
  "#c0c2b6",
  "#b1a48b",
  "#e0d5c4",
  "#c8bfb5",
  "#bbb6c9",
  "#d5d8df",
];
const STAGES = [
  "Prospecting",
  "Qualification",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
];
const STAGE_LABELS = [
  "New",
  "Qualified",
  "Turned to Proposal",
  "PTC / Negotiation",
  "Won",
  "Lost",
];
const STAGE_COLORS = [
  "#d8dadd",
  "#e3dbcf",
  "#d1d5c3",
  "#98a489",
  "#637359",
  "#e4b2ad",
];
const SERVICES = [
  "Cost Management",
  "Quantity Surveying",
  "Project Management",
  "Advisory",
  "Sustainability",
  "Transactions",
  "Other",
];
const REPORT_TYPES = [
  {
    name: "Meeting",
    label: "Meeting Report",
    icon: "Contacts",
    tone: "green",
    description:
      "Capture discussions, decisions and next steps from a meeting.",
    checks: [
      "Link to a meeting",
      "Attendees auto-filled",
      "Generate follow-up tasks",
    ],
  },
  {
    name: "Issue",
    label: "Issue",
    icon: "Warning",
    tone: "red",
    description: "Log internal or external issues that need attention.",
    checks: [
      "Set severity and category",
      "Track resolution",
      "Assign actions and due dates",
    ],
  },
  {
    name: "Complaint",
    label: "Complaint",
    icon: "Complaints",
    tone: "red",
    description: "Record client or stakeholder complaints.",
    checks: [
      "Capture complaint details",
      "Track actions and resolution",
      "Link to the complaint record",
    ],
  },
  {
    name: "Client Feedback",
    label: "Client Feedback",
    icon: "Star",
    tone: "orange",
    description: "Log feedback from clients or stakeholders.",
    checks: ["Record key feedback", "Set sentiment", "Track follow-up actions"],
  },
  {
    name: "Follow-up",
    label: "Follow-up",
    icon: "Reports",
    tone: "olive",
    description: "Track follow-ups, actions or commitments.",
    checks: [
      "Set action items",
      "Assign an owner and due date",
      "Link to related records",
    ],
  },
  {
    name: "Other",
    label: "Other",
    icon: "More",
    tone: "blue",
    description: "Log other information or observations.",
    checks: [
      "Flexible format",
      "Attach files in the report profile",
      "Link to related records",
    ],
  },
];
Object.assign(icons, {
  Warning: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  Star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
  Search: '<circle cx="10" cy="10" r="7"/><path d="m16 16 6 6"/>',
  Pin: '<path d="M19 9c0 5-7 13-7 13S5 14 5 9a7 7 0 1 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
  Phone:
    '<path d="m3 3 4-1 3 6-3 2c2 4 3 5 7 7l2-3 6 3-1 4c-1 4-9 0-13-4S-1 4 3 3Z"/>',
  Edit: '<path d="m4 16 12-12 4 4L8 20l-5 1 1-5ZM14 6l4 4"/>',
  Check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
  More: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  Files: '<path d="M7 2h9l5 5v15H7ZM16 2v6h5M3 5v17"/>',
  Download: '<path d="M12 2v13m-5-5 5 5 5-5M3 16v6h18v-6"/>',
  Trophy:
    '<path d="M7 3h10v8a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 16v5m-4 0h8"/>',
});
statuses.Tasks = ["Open", "In Progress", "Today", "Overdue", "Completed"];
statuses.Reports = [
  "Draft",
  "Submitted",
  "Open",
  "In Progress",
  "Follow-up",
  "Completed",
];

const todayISO = () =>
  new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const isoDate = (date) => new Date(date).toISOString().slice(0, 10);
const dayStamp = (d) =>
  d ? Date.parse(String(d).slice(0, 10) + "T00:00:00+03:00") : NaN;
const dayDiff = (a, b) =>
  Number.isFinite(dayStamp(a)) && Number.isFinite(dayStamp(b))
    ? Math.max(0, Math.floor((dayStamp(b) - dayStamp(a)) / 86400000))
    : null;
const dateOf = (x) =>
  x.date ||
  x.startDate ||
  (x.createdAt
    ? new Date(x.createdAt + 3 * 3600000).toISOString().slice(0, 10)
    : "");
const numberLabel = (n) => Number(n || 0).toLocaleString("en-GB");
const shortMonth = (date) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
const tagsOf = (x) => [
  ...new Set(
    (Array.isArray(x.tags) ? x.tags : String(x.tags || "").split(/[,;]+/))
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];
const initials = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((t) => t[0])
    .join("")
    .toUpperCase();
const avatarHTML = (x) =>
  `<span class="mini-avatar">${esc(initials(x.name))}</span>`;
const ownerHTML = (id) =>
  `<span class="person">${avatarHTML({ name: userName(id) })}<span>${esc(userName(id))}</span></span>`;
const tagHTML = (tags) =>
  tags
    .map((t, i) => `<span class="tag tag-${i % 3}">${esc(t)}</span>`)
    .join(" ");
const pillHTML = (status) =>
  `<span class="pill status-${normal(status).replace(/[^a-z]/g, "")}">${esc(status || "Not recorded")}</span>`;
const emptyHTML = (label) => `<div class="empty">${esc(label)}</div>`;
const safeHTTPS = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
};

normalizeDB = function (raw) {
  const base = originalCRM.normalizeDB(raw);
  for (const key of ["notes", "attachments", "savedViews"])
    if (!Array.isArray(base[key])) base[key] = [];
  if (
    !base.preferences ||
    typeof base.preferences !== "object" ||
    Array.isArray(base.preferences)
  )
    base.preferences = {};
  base.schemaVersion = 4;
  return base;
};
db = normalizeDB(db);
const ui = {
  filters: {},
  sort: {},
  pagination: {},
  selected: {},
  period: {},
  calendar: { anchor: todayISO(), view: "Month", target: "Meetings" },
  contactsView: "List",
  taskView: "My Tasks",
  timelineSort: "duration",
  bannerHidden: false,
};
let detailRecord = null,
  reportFlow = null,
  opportunityFlow = null;
function userPrefs() {
  return db.preferences[user.id] || {};
}
async function setPreference(key, value) {
  return await transact((next) => {
    next.preferences[user.id] = {
      ...(next.preferences[user.id] || {}),
      [key]: value,
    };
  });
}
function pageFilters(k = page) {
  return ui.filters[k] || (ui.filters[k] = {});
}
function scopedSource(k) {
  return recordsFor(k, k);
}
function reportType(x) {
  return (
    x.reportType ||
    (/client feedback/i.test(x.name)
      ? "Client Feedback"
      : x.meetingId
        ? "Meeting"
        : "Other")
  );
}
function taskStatus(x) {
  if (x.status === "Completed") return "Completed";
  if (x.date && x.date < todayISO()) return "Overdue";
  if (x.date === todayISO()) return "Today";
  return x.status === "Overdue" || x.status === "Today"
    ? "Open"
    : x.status || "Open";
}
function meetingEnd(x) {
  return x.date && x.end ? Date.parse(x.date + "T" + x.end + ":00+03:00") : NaN;
}
function meetingReport(x) {
  return recordsFor("Reports", "Meetings").find(
    (r) =>
      r.meetingId === x.id &&
      r.status !== "Draft" &&
      reportType(r) === "Meeting",
  );
}
function meetingReportState(x) {
  if (x.reportRequired === false || x.status === "Cancelled")
    return "Not Required";
  if (meetingReport(x)) return "Completed";
  return Number.isFinite(meetingEnd(x)) &&
    meetingEnd(x) < Date.now() - 48 * 3600000
    ? "Overdue"
    : "Pending";
}
function oppStart(x) {
  return (
    x.startDate ||
    (x.createdAt
      ? new Date(x.createdAt + 3 * 3600000).toISOString().slice(0, 10)
      : "")
  );
}
function oppDuration(x) {
  return dayDiff(
    oppStart(x),
    ["Won", "Lost"].includes(x.status)
      ? x.closedDate || todayISO()
      : todayISO(),
  );
}
function stageStart(x) {
  const h = (x.stageHistory || []).at(-1);
  return (
    h?.start ||
    (x.lastStageChangedAt
      ? new Date(x.lastStageChangedAt + 3 * 3600000).toISOString().slice(0, 10)
      : oppStart(x))
  );
}
function stageDuration(x) {
  return dayDiff(
    stageStart(x),
    ["Won", "Lost"].includes(x.status)
      ? x.closedDate || todayISO()
      : todayISO(),
  );
}
function periodBounds(k) {
  const p = ui.period[k] || { value: "All" };
  const today = todayISO();
  const d = new Date(today + "T12:00Z");
  let from = "",
    to = "";
  if (p.value === "This Month") from = today.slice(0, 7) + "-01";
  if (p.value === "Quarter")
    from = `${d.getUTCFullYear()}-${String(Math.floor(d.getUTCMonth() / 3) * 3 + 1).padStart(2, "0")}-01`;
  if (p.value === "YTD") from = today.slice(0, 4) + "-01-01";
  if (p.value === "Last 12 Months") {
    d.setUTCMonth(d.getUTCMonth() - 11, 1);
    from = isoDate(d);
  }
  if (p.value === "Custom") {
    from = p.from || "";
    to = p.to || "";
  } else if (from) to = today;
  return { from, to };
}
function lastInteraction(x) {
  const events = db.activity.filter(
    (a) =>
      relatedTo(a, "Contacts", x.id) &&
      linkedAccess(a) &&
      a.kind === "interaction",
  );
  const stamps = events
    .map((a) => a.occurredAt || a.time)
    .filter(Number.isFinite);
  return stamps.length
    ? new Date(Math.max(...stamps) + 3 * 3600000).toISOString().slice(0, 10)
    : "";
}
function nextMeeting(x) {
  return recordsFor("Meetings", "Contacts")
    .filter(
      (m) =>
        m.contactIds?.includes(x.id) &&
        m.status === "Scheduled" &&
        m.date >= todayISO(),
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
}
function filteredRows(k = page) {
  const f = pageFilters(k),
    bounds = periodBounds(k);
  let rows = scopedSource(k).filter((x) => {
    if (
      query &&
      !normal(
        [
          x.name,
          x.company,
          x.email,
          x.phone,
          x.jobTitle,
          x.tags,
          x.status,
          x.region,
          x.service,
          reportType(x),
        ].join(" "),
      ).includes(normal(query))
    )
      return false;
    if (k === "Opportunities" && regionFilter && x.region !== regionFilter)
      return false;
    for (const key of [
      "company",
      "jobTitle",
      "ownerId",
      "assigneeId",
      "status",
      "service",
      "region",
      "priority",
    ])
      if (
        f[key] &&
        (key === "status" && k === "Tasks"
          ? taskStatus(x)
          : key === "assigneeId"
            ? x.assigneeId || x.ownerId
            : x[key] || "Not recorded") !== f[key]
      )
        return false;
    if (
      f.tags &&
      (f.tags === "Untagged"
        ? tagsOf(x).length > 0
        : !tagsOf(x).includes(f.tags))
    )
      return false;
    if (f.reportType && reportType(x) !== f.reportType) return false;
    if (f.reportStatus && meetingReportState(x) !== f.reportStatus)
      return false;
    if (
      f.meetingType &&
      (x.meetingType || (x.opportunityId ? "Opportunity" : "Contact Only")) !==
        f.meetingType
    )
      return false;
    if (f.opportunityId && x.opportunityId !== f.opportunityId) return false;
    const from = f.dateMin || bounds.from,
      to = f.dateMax || bounds.to,
      date = dateOf(x);
    if ((from || to) && (!date || (from && date < from) || (to && date > to)))
      return false;
    if (k === "Tasks") {
      if (ui.taskView === "My Tasks" && (x.assigneeId || x.ownerId) !== user.id)
        return false;
      if (ui.taskView === "Overdue" && taskStatus(x) !== "Overdue")
        return false;
      if (ui.taskView === "Completed" && x.status !== "Completed") return false;
      if (
        ui.taskView === "Due This Week" &&
        (x.status === "Completed" ||
          !x.date ||
          x.date < todayISO() ||
          x.date >
            isoDate(
              new Date(dayStamp(todayISO()) + 7 * 86400000 + 3 * 3600000),
            ))
      )
        return false;
    }
    return true;
  });
  const sort = ui.sort[k] || {
    key: k === "Contacts" ? "name" : k === "Tasks" ? "date" : "name",
    dir: 1,
  };
  return rows.sort((a, b) => {
    const get = (x) =>
      sort.key === "duration"
        ? (oppDuration(x) ?? -1)
        : sort.key === "stageDuration"
          ? (stageDuration(x) ?? -1)
          : sort.key === "stageDate"
            ? stageStart(x)
            : sort.key === "lastInteraction"
              ? lastInteraction(x)
              : sort.key === "nextMeeting"
                ? nextMeeting(x)?.date || ""
                : sort.key === "reportType"
                  ? reportType(x)
                  : sort.key === "reportStatus"
                    ? meetingReportState(x)
                    : sort.key === "attendees"
                      ? x.contactIds?.length || 0
                      : sort.key === "status" && k === "Tasks"
                        ? taskStatus(x)
                        : (x[sort.key] ?? "");
    const aa = get(a),
      bb = get(b);
    return typeof aa === "number" && typeof bb === "number"
      ? (aa - bb) * sort.dir
      : String(aa).localeCompare(String(bb), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * sort.dir;
  });
}
listRows = filteredRows;
function groupsOf(rows, key) {
  const out = {};
  for (const x of rows) {
    const values =
      typeof key === "function" ? key(x) : x[key] || "Not recorded";
    for (const value of Array.isArray(values) ? values : [values])
      out[value] = (out[value] || 0) + 1;
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}
function chartDonut(rows, key, label, filterKey = "", kind = page) {
  const groups = groupsOf(rows, key);
  const sum = groups.reduce((s, x) => s + x[1], 0);
  let pos = 0;
  const gradient = groups
    .filter((x) => x[1] > 0)
    .map(([name, n], i) => {
      const start = pos;
      pos += (n / sum) * 100;
      return `${PALETTE[i % PALETTE.length]} ${start}% ${pos}%`;
    })
    .join(",");
  return `<div class="data-donut"><div class="donut" style="background:${sum ? "conic-gradient(" + gradient + ")" : "#efeee8"}" role="img" aria-label="${esc(groups.map(([n, v]) => n + ": " + v).join(", ") || "No records")}"><div class="hole"><b>${rows.length}</b><small>${esc(label)}</small></div></div><div class="legend">${groups.map(([name, n], i) => `<${filterKey ? "button" : "div"} class="legendrow" ${filterKey ? `data-chart-filter="${esc(filterKey)}" data-value="${esc(name)}" data-kind="${kind}"` : ""}><i style="background:${PALETTE[i % PALETTE.length]}"></i><span>${esc(name)}</span><b>${n} ${sum ? "(" + Math.round((n / sum) * 100) + "%)" : ""}</b></${filterKey ? "button" : "div"}>`).join("") || '<span class="muted">No records yet.</span>'}</div></div>`;
}
function chartBars(groups, filterKey = "", kind = page) {
  const max = Math.max(1, ...groups.map((x) => x[1]));
  return `<div class="horizontal-bars">${
    groups
      .slice(0, 10)
      .map(
        ([name, n], i) =>
          `<button class="bar-row" ${filterKey ? `data-chart-filter="${esc(filterKey)}" data-kind="${kind}" data-value="${esc(name)}"` : ""} ${filterKey ? "" : "disabled"}><span>${esc(name)}</span><span class="bar-track"><i style="width:${(n / max) * 100}%;background:${PALETTE[i % PALETTE.length]}"></i></span><b>${numberLabel(n)}</b></button>`,
      )
      .join("") || emptyHTML("No records to display.")
  }</div>`;
}
function monthBins(months = 6) {
  const d = new Date(todayISO() + "T12:00Z");
  d.setUTCDate(1);
  return Array.from({ length: months }, (_, i) => {
    const m = new Date(d);
    m.setUTCMonth(m.getUTCMonth() - months + 1 + i);
    return isoDate(m).slice(0, 7);
  });
}
function timeChart(rows, key = "reportType") {
  const months = monthBins(),
    cats = key === "reportType" ? REPORT_TYPES.map((t) => t.name) : STAGES;
  const values = months.map((m) =>
    cats.map(
      (c) =>
        rows.filter(
          (x) =>
            dateOf(x).startsWith(m) &&
            (key === "reportType" ? reportType(x) : x.status) === c,
        ).length,
    ),
  );
  const max = Math.max(1, ...values.map((v) => v.reduce((s, n) => s + n, 0)));
  const top = Math.ceil(max / 4) * 4;
  return `<div class="time-chart"><div class="chart-y">${[top, top * 0.75, top * 0.5, top * 0.25, 0].map((n) => `<span>${n}</span>`).join("")}</div><div class="time-columns">${months.map((m, i) => `<button class="time-column" data-month-filter="${m}"><span class="stack-bar" style="height:${(values[i].reduce((s, n) => s + n, 0) / top) * 100}%">${values[i].map((n, j) => (n ? `<i style="flex:${n};background:${PALETTE[j % PALETTE.length]}" title="${esc(cats[j])}: ${n}"></i>` : "")).join("")}</span><small>${shortMonth(m + "-01")}</small><b class="sr-only">${values[i].reduce((s, n) => s + n, 0)} records</b></button>`).join("")}</div></div><div class="chart-key">${cats
    .filter((c) =>
      rows.some((x) => (key === "reportType" ? reportType(x) : x.status) === c),
    )
    .map(
      (c) =>
        `<span><i style="background:${PALETTE[cats.indexOf(c) % PALETTE.length]}"></i>${esc(c)}</span>`,
    )
    .join("")}</div>`;
}
function statCards(cards) {
  return `<div class="workspace-stats cols-${cards.length}">${cards.map((c) => `<${c.action ? "button" : "div"} class="workspace-stat ${c.tone || ""}" ${c.action || ""}><span class="stat-icon">${icon(c.icon || "Reports")}</span><div><small>${esc(c.label)}</small><strong>${c.value ?? 0}</strong>${c.note ? `<span class="stat-note">${esc(c.note)}</span>` : ""}</div></${c.action ? "button" : "div"}>`).join("")}</div>`;
}
function pageHeading(k, subtitle, buttons) {
  return `<div class="page-heading"><div><h1>${esc(k)}</h1><p>${esc(subtitle)}</p></div><div class="heading-actions">${buttons || `<button class="primary" data-new="${k}">＋ ${k === "Meetings" ? "Schedule Meeting" : "Add " + singular(k)}</button>`}</div></div>`;
}
function periodControls(k) {
  const p = ui.period[k] || { value: "All" },
    b = periodBounds(k);
  return `<div class="period-line"><div class="segments">${["All", "This Month", "Quarter", "YTD", "Last 12 Months", "Custom"].map((v) => `<button data-period="${v}" class="${p.value === v ? "selected" : ""}">${v}</button>`).join("")}</div>${p.value === "Custom" ? `<label>From <input type="date" data-period-date="from" value="${esc(p.from)}"></label><label>To <input type="date" data-period-date="to" value="${esc(p.to)}"></label>` : `<span class="muted">${b.from ? dateLabel(b.from) + " – " + dateLabel(b.to) : "All available dates"}</span>`}</div>`;
}
function filterSelect(label, key, values, k = page) {
  const f = pageFilters(k),
    options = [
      ...new Set(
        [...values, f[key]].filter(
          (v) => v !== undefined && v !== null && v !== "",
        ),
      ),
    ];
  const display = (v) =>
    key === "ownerId" || key === "assigneeId"
      ? userName(v)
      : key === "opportunityId"
        ? visibleRecord("Opportunities", v)?.name || "Unavailable opportunity"
        : v;
  return `<label class="filter-field"><span>${esc(label)}</span><select data-filter="${key}" aria-label="${esc(label)}"><option value="">All</option>${options.map((v) => `<option value="${esc(v)}" ${f[key] === String(v) ? "selected" : ""}>${esc(display(v))}</option>`).join("")}</select></label>`;
}
function filterBar(k, items, search = true) {
  const rows = scopedSource(k);
  return `<div class="filters">${search ? `<label class="filter-search"><span class="sr-only">Search ${k.toLowerCase()}</span>${icon("Search")}<input id="listsearch" placeholder="Search ${k.toLowerCase()}..." value="${esc(query)}"></label>` : ""}${items.map(([l, key, values]) => filterSelect(l, key, values || rows.map((x) => x[key]), k)).join("")}<button class="clear-filters" id="ui-clear">Clear All</button></div>`;
}
function panelHTML(title, body, actions = "", className = "") {
  return `<section class="panel workspace-panel ${className}"><div class="panelhead"><h2>${esc(title)}</h2>${actions}</div>${body}</section>`;
}
function rowActions(k, x) {
  return `<button class="more row-menu-trigger" data-row-menu="${k}" data-id="${esc(x.id)}" aria-label="Actions for ${esc(x.name)}" aria-haspopup="dialog">•••</button>`;
}
const TABLE_COLUMNS = {
  Contacts: [
    ["name", "Name"],
    ["company", "Company"],
    ["jobTitle", "Position"],
    ["tags", "Tags"],
    ["ownerId", "Owner"],
    ["lastInteraction", "Last Interaction"],
    ["nextMeeting", "Next Meeting"],
    ["status", "Status"],
  ],
  Opportunities: [
    ["name", "Opportunity Name"],
    ["company", "Company"],
    ["service", "Service Line"],
    ["status", "Current Stage"],
    ["startDate", "Created / Start"],
    ["stageDate", "Last Stage Change"],
    ["stageDuration", "Days in Stage"],
    ["duration", "Total Duration"],
    ["value", "Value (SAR)"],
    ["targetDate", "Expected Close"],
    ["ownerId", "Owner"],
  ],
  Meetings: [
    ["name", "Meeting Title"],
    ["date", "Date & Time"],
    ["related", "Related To"],
    ["meetingType", "Type"],
    ["attendees", "Attendees"],
    ["reportStatus", "Report Status"],
    ["status", "Meeting Status"],
    ["ownerId", "Owner"],
  ],
  Reports: [
    ["name", "Report Title"],
    ["reportType", "Type"],
    ["related", "Related To"],
    ["company", "Company"],
    ["opportunity", "Opportunity"],
    ["service", "Service Line"],
    ["date", "Created Date"],
    ["followUpDate", "Follow-up Date"],
    ["status", "Status"],
    ["ownerId", "Owner"],
  ],
  Tasks: [
    ["name", "Task Title"],
    ["status", "Status"],
    ["priority", "Priority"],
    ["related", "Related To"],
    ["opportunity", "Opportunity"],
    ["date", "Due Date"],
    ["assigneeId", "Assignee"],
  ],
  Complaints: [
    ["name", "Complaint"],
    ["company", "Company"],
    ["status", "Status"],
    ["priority", "Priority"],
    ["date", "Target Resolution"],
    ["ownerId", "Owner"],
  ],
};
function columnCell(k, x, key) {
  if (key === "name") {
    const action = ["Contacts", "Opportunities"].includes(k)
      ? `data-profile="${k}"`
      : k === "Meetings"
        ? `data-meeting-detail="${esc(x.id)}"`
        : k === "Reports"
          ? `data-report-detail="${esc(x.id)}"`
          : editbtn(k, x.id);
    return `<button class="record-link" ${action} ${["Contacts", "Opportunities"].includes(k) ? `data-id="${esc(x.id)}"` : ""}>${k === "Contacts" ? avatarHTML(x) : ""}<span>${esc(x.name)}</span></button>`;
  }
  if (key === "ownerId" || key === "assigneeId")
    return ownerHTML(x[key] || x.ownerId);
  if (key === "tags") return tagHTML(tagsOf(x)) || "—";
  if (key === "status")
    return pillHTML(k === "Tasks" ? taskStatus(x) : x.status);
  if (key === "priority")
    return `<span class="priority priority-${normal(x.priority || "Medium")}">${esc(x.priority || "Medium")}</span>`;
  if (key === "value") return numberLabel(x.value);
  if (key === "duration" || key === "stageDuration") {
    const n = key === "duration" ? oppDuration(x) : stageDuration(x);
    return n === null ? "—" : n + " days";
  }
  if (key === "stageDate") return dateLabel(stageStart(x));
  if (key === "reportType")
    return `<span class="tag">${esc(reportType(x))}</span>`;
  if (key === "reportStatus") return pillHTML(meetingReportState(x));
  if (key === "lastInteraction") return dateLabel(lastInteraction(x));
  if (key === "nextMeeting")
    return nextMeeting(x)
      ? `<button class="record-link" data-meeting-detail="${esc(nextMeeting(x).id)}">${dateLabel(nextMeeting(x).date)}</button>`
      : "—";
  if (key === "opportunity")
    return x.opportunityId
      ? profileLink(
          "Opportunities",
          x.opportunityId,
          visibleRecord("Opportunities", x.opportunityId)?.name ||
            "Unavailable",
        )
      : "—";
  if (key === "related") {
    const labels = x.opportunityId ? [columnCell(k, x, "opportunity")] : [];
    for (const id of x.contactIds || []) {
      const c = visibleRecord("Contacts", id);
      if (c) labels.push(profileLink("Contacts", id, c.name));
    }
    return (
      labels.slice(0, 2).join("<br>") ||
      (x.meetingId ? "Meeting" : x.company ? esc(x.company) : "—")
    );
  }
  if (key === "attendees") {
    const names = (x.contactIds || [])
      .map((id) => visibleRecord("Contacts", id))
      .filter(Boolean);
    return names.length
      ? `<span class="attendee-stack">${names
          .slice(0, 3)
          .map((c) => `<span title="${esc(c.name)}">${avatarHTML(c)}</span>`)
          .join(
            "",
          )}${names.length > 3 ? `<small>+${names.length - 3}</small>` : ""}</span>`
      : x.externalAttendees
        ? "External"
        : "—";
  }
  if (key === "meetingType")
    return esc(
      x.meetingType || (x.opportunityId ? "Opportunity" : "Contact Only"),
    );
  if (["date", "targetDate", "startDate", "followUpDate"].includes(key))
    return `<span class="${(k === "Tasks" && taskStatus(x) === "Overdue") || (key === "followUpDate" && x[key] && x[key] < todayISO() && x.status !== "Completed") ? "dangertext" : ""}">${dateLabel(x[key] || (key === "startDate" && oppStart(x)))}${key === "date" && k === "Meetings" ? " · " + timeLabel(x.time) : ""}</span>`;
  return esc(x[key] || "—");
}
function recordTable(k, rows, title = k) {
  const columns = TABLE_COLUMNS[k],
    hidden = userPrefs()["columns_" + k] || [],
    shown = columns.filter(([key]) => !hidden.includes(key));
  const size = Number(userPrefs().pageSize || 8),
    pages = Math.max(1, Math.ceil(rows.length / size)),
    index = Math.min(ui.pagination[k] || 1, pages);
  ui.pagination[k] = index;
  const display = rows.slice((index - 1) * size, index * size),
    selected = ui.selected[k] || new Set(),
    sort = ui.sort[k] || {};
  return `<section class="panel records-panel"><div class="records-heading"><h2>${esc(title)} <span>(${rows.length})</span></h2><div>${selected.size ? `<span class="selection-count">${selected.size} selected</span> ` : ""}${isManager() ? '<button class="secondary compact" id="export">' + icon("Download") + " Export</button>" : ""}<button class="secondary compact" data-columns="${k}">▥ Columns</button></div></div><div class="tablewrap"><table class="table workspace-table"><thead><tr><th class="check-col">${k === "Tasks" ? "" : `<input type="checkbox" data-select-all="${k}" aria-label="Select displayed ${k.toLowerCase()}" ${display.length && display.every((x) => selected.has(x.id)) ? "checked" : ""}>`}</th>${shown.map(([key, label]) => `<th><button data-sort="${key}" aria-label="Sort by ${label}">${label} <small>${sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : "↕"}</small></button></th>`).join("")}<th class="menu-col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${display.map((x) => `<tr><td><input type="checkbox" ${k === "Tasks" ? `data-check="${esc(x.id)}" ${x.status === "Completed" ? "checked" : ""} aria-label="Complete ${esc(x.name)}"` : `data-select-row="${k}" data-id="${esc(x.id)}" ${selected.has(x.id) ? "checked" : ""} aria-label="Select ${esc(x.name)}"`}></td>${shown.map(([key]) => `<td>${columnCell(k, x, key)}</td>`).join("")}<td>${rowActions(k, x)}</td></tr>`).join("")}</tbody></table>${rows.length ? "" : emptyHTML("No " + k.toLowerCase() + " match this view.")}</div><div class="pagination"><span>Showing ${rows.length ? (index - 1) * size + 1 : 0}–${Math.min(index * size, rows.length)} of ${rows.length} ${k.toLowerCase()}</span><div><button data-page-index="${index - 1}" ${index <= 1 ? "disabled" : ""} aria-label="Previous page">‹</button>${Array.from(
    { length: pages },
    (_, i) => i + 1,
  )
    .filter((i) => i === 1 || i === pages || Math.abs(i - index) <= 2)
    .map(
      (i) =>
        `<button data-page-index="${i}" class="${i === index ? "selected" : ""}">${i}</button>`,
    )
    .join(
      "",
    )}<button data-page-index="${index + 1}" ${index >= pages ? "disabled" : ""} aria-label="Next page">›</button></div></div></section>`;
}

function contactsPage() {
  const rows = filteredRows("Contacts"),
    companies = [
      ...new Set(rows.map((x) => normal(x.company)).filter(Boolean)),
    ];
  const decision = rows.filter((x) =>
    tagsOf(x).some((t) => /decision/i.test(t)),
  ).length;
  const upcoming = rows.filter(nextMeeting).length;
  const companyGroups = groupsOf(rows, "company");
  const locations = groupsOf(rows, (x) => x.location || "Not recorded");
  const mapMarkers = [
    ["Riyadh", 54, 52],
    ["Jeddah", 28, 64],
    ["Makkah", 30, 67],
    ["Madinah", 35, 38],
    ["Medina", 35, 38],
    ["Dammam", 71, 38],
    ["Eastern Province", 71, 38],
    ["NEOM", 22, 22],
  ];
  const markers = mapMarkers
    .filter(([n]) => rows.some((x) => normal(x.location).includes(normal(n))))
    .map(
      ([n, l, t]) =>
        `<span class="map-marker" style="left:${l}%;top:${t}%" title="${n}: ${rows.filter((x) => normal(x.location).includes(normal(n))).length}"></span>`,
    )
    .join("");
  const calendarMeetings = recordsFor("Meetings", "Contacts").filter((m) =>
    m.contactIds?.some((id) => rows.some((c) => c.id === id)),
  );
  const views = db.savedViews.filter(
    (v) => v.ownerId === user.id && v.page === "Contacts",
  );
  return (
    pageHeading(
      "Contacts",
      "Build and manage your professional network.",
      `<button class="primary" data-new="Contacts">＋ Add Contact</button><button class="secondary" id="ui-import">${icon("Download")} Import</button>${isManager() ? '<button class="secondary" data-page="Trash">' + icon("Trash") + " Deleted Contacts</button>" : ""}`,
    ) +
    statCards([
      {
        label: "Total Contacts",
        value: rows.length,
        icon: "Contacts",
        note:
          rows.filter(
            (x) =>
              x.createdAt &&
              new Date(x.createdAt + 3 * 3600000)
                .toISOString()
                .startsWith(todayISO().slice(0, 7)),
          ).length + " added this month",
      },
      { label: "Companies", value: companies.length, icon: "Companies" },
      { label: "Key Decision Makers", value: decision, icon: "Star" },
      {
        label: "Contacts with Upcoming Meetings",
        value: upcoming,
        icon: "Meetings",
      },
    ]) +
    `<div class="analytics-grid contacts-analytics">${panelHTML("Contacts by Company (Top 10)", chartBars(companyGroups, "company", "Contacts"))}${panelHTML(
      "Contacts by Tags",
      chartDonut(
        rows,
        (x) => (tagsOf(x).length ? tagsOf(x) : ["Untagged"]),
        "Contacts",
        "tags",
        "Contacts",
      ),
    )}${panelHTML(
      "Contacts by Location",
      `<div class="location-chart"><div class="map-frame"><img src="assets/saudi-map.png" alt="Saudi Arabia; chart locations listed alongside">${markers}</div><div class="legend">${
        locations
          .slice(0, 6)
          .map(
            ([n, v], i) =>
              `<div class="legendrow"><i style="background:${PALETTE[i % 8]}"></i><span>${esc(n)}</span><b>${Math.round((v / Math.max(1, rows.length)) * 100)}%</b></div>`,
          )
          .join("") || '<span class="muted">No locations recorded.</span>'
      }</div></div>`,
    )}</div>` +
    `<div class="view-toolbar"><div class="segments"><button data-contact-view="List" class="${ui.contactsView === "List" ? "selected" : ""}">☷ List View</button><button data-contact-view="Calendar" class="${ui.contactsView === "Calendar" ? "selected" : ""}">${icon("Meetings")} Calendar View</button></div><div>${views.length ? `<select id="ui-view-picker" aria-label="Saved contact views"><option value="">Saved views</option>${views.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join("")}</select>` : ""}<button class="secondary compact" id="ui-save-view">▱ Save as View</button></div></div>` +
    filterBar("Contacts", [
      ["Company", "company"],
      ["Position", "jobTitle"],
      ["Tags", "tags", scopedSource("Contacts").flatMap(tagsOf)],
      ["Owner", "ownerId"],
      ["Status", "status", statuses.Contacts],
    ]) +
    `<div class="date-filters"><label>Date added from <input type="date" data-filter="dateMin" value="${esc(pageFilters("Contacts").dateMin)}"></label><label>To <input type="date" data-filter="dateMax" value="${esc(pageFilters("Contacts").dateMax)}"></label></div>` +
    (ui.contactsView === "Calendar"
      ? calendarHTML(calendarMeetings, "Contacts")
      : recordTable("Contacts", rows))
  );
}
function pipelineHTML(rows, x = null) {
  return `<div class="pipeline">${STAGES.map((stage, i) => {
    const isCurrent = x?.status === stage;
    let value = rows ? rows.filter((o) => o.status === stage).length : "";
    if (x) {
      const intervals = stageIntervals(x).filter((h) => h.stage === stage);
      const n = intervals.reduce(
        (s, h) => s + (dayDiff(h.start, h.end || todayISO()) || 0),
        0,
      );
      value = intervals.length
        ? n + " days"
        : isCurrent && stageDuration(x) !== null
          ? stageDuration(x) + " days"
          : "—";
    }
    return `<button class="pipeline-stage ${isCurrent ? "current" : ""}" style="--stage-color:${STAGE_COLORS[i]}" ${rows ? `data-chart-filter="status" data-kind="Opportunities" data-value="${stage}"` : `data-change-stage="${stage}" data-id="${esc(x.id)}"`}><span>${STAGE_LABELS[i]}</span><b>${value}</b></button>`;
  }).join("")}</div>`;
}
function stageIntervals(x) {
  if (Array.isArray(x.stageHistory) && x.stageHistory.length)
    return x.stageHistory;
  const changes = (x.history || [])
      .filter((h) => h.before?.status)
      .sort((a, b) => a.at - b.at),
    out = [];
  let start = oppStart(x),
    stage = changes[0]?.before.status || x.status;
  for (let i = 0; i < changes.length; i++) {
    const h = changes[i],
      nextStage = changes[i + 1]?.before.status || x.status,
      date = new Date(h.at + 3 * 3600000).toISOString().slice(0, 10);
    if (nextStage !== stage) {
      out.push({ stage, start, end: date });
      stage = nextStage;
      start = date;
    }
  }
  if (start)
    out.push({
      stage,
      start,
      end: ["Won", "Lost"].includes(x.status) ? x.closedDate || "" : "",
    });
  return out;
}
function durationTimeline(rows) {
  const data = rows
    .filter((x) => oppStart(x))
    .sort((a, b) =>
      ui.timelineSort === "name"
        ? a.name.localeCompare(b.name)
        : (oppDuration(b) || 0) - (oppDuration(a) || 0),
    )
    .slice(0, 8);
  if (!data.length)
    return emptyHTML(
      "Set a start date on an opportunity to show its duration.",
    );
  const min = Math.min(...data.map((x) => dayStamp(oppStart(x)))),
    max = Math.max(
      dayStamp(todayISO()),
      ...data.map((x) => dayStamp(x.closedDate || todayISO())),
    ),
    span = Math.max(86400000, max - min);
  return `<div class="duration-timeline"><div class="timeline-header"><span>Opportunity</span><span>Duration</span><div>${Array.from({ length: 6 }, (_, i) => `<small>${shortMonth(isoDate(new Date(min + (span * i) / 5 + 12 * 3600000)))}</small>`).join("")}</div></div>${data
    .map(
      (x) =>
        `<div class="duration-row"><button class="record-link" data-profile="Opportunities" data-id="${esc(x.id)}">${esc(x.name)}</button><span>${oppDuration(x)} days</span><div class="duration-track">${stageIntervals(
          x,
        )
          .map((h) => {
            const a = dayStamp(h.start),
              b = dayStamp(h.end || x.closedDate || todayISO());
            if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
            const left = Math.max(0, ((a - min) / span) * 100),
              width = Math.max(0.5, ((b - a) / span) * 100);
            return `<i style="left:${left}%;width:${Math.min(width, 100 - left)}%;background:${STAGE_COLORS[STAGES.indexOf(h.stage)] || PALETTE[0]}" title="${esc(h.stage)}: ${dayDiff(h.start, h.end || todayISO())} days"></i>`;
          })
          .join("")}</div></div>`,
    )
    .join(
      "",
    )}</div><div class="chart-key">${STAGES.map((s, i) => `<span><i style="background:${STAGE_COLORS[i]}"></i>${STAGE_LABELS[i]}</span>`).join("")}</div>`;
}
function averageStageChart(rows) {
  const groups = STAGES.map((stage) => {
    const intervals = rows
      .flatMap((x) =>
        stageIntervals(x)
          .filter((h) => h.stage === stage)
          .map((h) => dayDiff(h.start, h.end || todayISO())),
      )
      .filter((n) => n !== null);
    return [
      STAGE_LABELS[STAGES.indexOf(stage)],
      intervals.length
        ? Math.round(intervals.reduce((s, n) => s + n, 0) / intervals.length)
        : 0,
    ];
  });
  const max = Math.max(1, ...groups.map((g) => g[1]));
  return `<div class="vertical-bars">${groups.map(([label, n], i) => `<div><b>${n}</b><span style="height:${(n / max) * 130}px;background:${STAGE_COLORS[i]}"></span><small>${label}</small></div>`).join("")}</div><p class="chart-footnote">Days per recorded stage interval; unrecorded stages are excluded.</p>`;
}
function opportunitiesPage() {
  const rows = filteredRows("Opportunities"),
    won = rows.filter((o) => o.status === "Won").length,
    lost = rows.filter((o) => o.status === "Lost").length,
    durations = rows.map(oppDuration).filter((n) => n !== null),
    proposal = rows.filter(
      (o) =>
        ["Proposal", "Negotiation", "Won", "Lost"].includes(o.status) ||
        stageIntervals(o).some((h) => h.stage === "Proposal"),
    ).length;
  return (
    pageHeading(
      "Opportunities",
      "Track business opportunities from qualification to close.",
    ) +
    periodControls("Opportunities") +
    statCards([
      {
        label: "Total Opportunities",
        value: rows.length,
        icon: "Opportunities",
      },
      { label: "Turned to Proposal", value: proposal, icon: "Reports" },
      {
        label: "Won",
        value: won,
        icon: "Trophy",
        tone: "green",
        note: proposal
          ? Math.round((won / proposal) * 100) + "% of proposal opportunities"
          : "No proposal opportunities",
      },
      {
        label: "Lost",
        value: lost,
        icon: "Warning",
        tone: "red",
        note: proposal
          ? Math.round((lost / proposal) * 100) + "% of proposal opportunities"
          : "",
      },
      {
        label: "Avg. Duration",
        value: durations.length
          ? Math.round(
              durations.reduce((a, b) => a + b, 0) / durations.length,
            ) + " days"
          : "—",
        icon: "Clock",
        note: durations.length + " with recorded start dates",
      },
    ]) +
    panelHTML("Pipeline", pipelineHTML(rows)) +
    `<div class="opportunity-analytics">${panelHTML("Opportunity Duration Timeline", durationTimeline(rows), `<label class="inline-picker">Sort by <select id="ui-timeline-sort"><option value="duration" ${ui.timelineSort === "duration" ? "selected" : ""}>Total Duration</option><option value="name" ${ui.timelineSort === "name" ? "selected" : ""}>Name</option></select></label>`)}<div>${panelHTML("Opportunities by Service Line", chartDonut(rows, "service", "Total", "service", "Opportunities"))}${panelHTML("Average Duration by Stage", averageStageChart(rows))}</div></div>` +
    `<div class="analytics-grid two">${panelHTML("Opportunities Over Time", timeChart(rows, "status"))}${panelHTML(
      "Pipeline Value (SAR)",
      chartBars(
        groupsOf(rows, "status").map(([s]) => [
          s,
          rows
            .filter((x) => x.status === s)
            .reduce((v, x) => v + Number(x.value || 0), 0),
        ]),
        "status",
        "Opportunities",
      ),
    )}</div>` +
    filterBar("Opportunities", [
      ["Stage", "status", STAGES],
      ["Service Line", "service"],
      ["Region", "region"],
      ["Owner", "ownerId"],
    ]) +
    recordTable("Opportunities", rows)
  );
}
function calendarHTML(meetings, target = "Meetings") {
  const anchor = new Date(ui.calendar.anchor + "T12:00Z"),
    view = ui.calendar.view,
    month = anchor.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
  const all = meetings.filter((x) => x.date && x.status !== "Cancelled");
  let days = [];
  if (view === "Month") {
    const d = new Date(anchor);
    d.setUTCDate(1);
    d.setUTCDate(1 - d.getUTCDay());
    days = Array.from(
      { length: 42 },
      (_, i) => new Date(d.getTime() + i * 86400000),
    );
  } else if (view === "Week") {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    days = Array.from(
      { length: 7 },
      (_, i) => new Date(d.getTime() + i * 86400000),
    );
  } else days = [anchor];
  return panelHTML(
    month,
    `<div class="calendar-key"><span><i class="green-dot"></i>Meeting / report done</span><span><i class="orange-dot"></i>Report pending</span><span><i class="red-dot"></i>Overdue report</span></div><div class="calendar-grid calendar-${view.toLowerCase()}">${view !== "Day" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => `<div class="calendar-weekday">${x}</div>`).join("") : ""}${days
      .map((d) => {
        const date = isoDate(d),
          events = all
            .filter((m) => m.date === date)
            .sort((a, b) => String(a.time).localeCompare(String(b.time)));
        return `<div class="calendar-cell ${d.getUTCMonth() !== anchor.getUTCMonth() ? "other-month" : ""} ${date === todayISO() ? "calendar-today" : ""}"><button class="calendar-date" data-calendar-date="${date}" aria-label="Schedule meeting on ${date}">${view === "Day" ? d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : d.getUTCDate()}</button>${events.map((m) => `<button class="calendar-event event-${normal(meetingReportState(m))}" data-meeting-detail="${esc(m.id)}"><small>${timeLabel(m.time)}</small><b>${esc(m.name)}</b><small>${esc(m.company)} · ${meetingReportState(m) === "Not Required" ? "Contact only" : meetingReportState(m) === "Completed" ? "Report done" : "Report " + meetingReportState(m).toLowerCase()}</small></button>`).join("")}</div>`;
      })
      .join("")}</div>`,
    `<div class="calendar-controls"><button data-calendar-move="-1" aria-label="Previous calendar period">‹</button><button data-calendar-move="1" aria-label="Next calendar period">›</button><button class="secondary compact" id="ui-calendar-today">Today</button><div class="segments">${["Month", "Week", "Day"].map((v) => `<button data-calendar-view="${v}" class="${view === v ? "selected" : ""}">${v}</button>`).join("")}</div></div>`,
    "calendar-panel",
  );
}
function meetingListCard(m) {
  return `<div class="upcoming-meeting"><div class="date-tile"><small>${m.date ? new Date(m.date + "T12:00Z").toLocaleDateString("en-GB", { weekday: "short" }) : "—"}</small><b>${dateLabel(m.date)}</b></div><button class="grow" data-meeting-detail="${esc(m.id)}"><b>${esc(m.name)}</b><small>${timeLabel(m.time)} – ${timeLabel(m.end)}</small><small>${esc(m.company)}</small></button>${pillHTML(meetingReportState(m))}${rowActions("Meetings", m)}</div>`;
}
function meetingsPage() {
  const rows = filteredRows("Meetings"),
    reported = rows.filter((m) => meetingReportState(m) === "Completed").length,
    pending = rows.filter((m) =>
      ["Pending", "Overdue"].includes(meetingReportState(m)),
    ).length,
    overdue = rows.filter((m) => meetingReportState(m) === "Overdue").length,
    upcoming = rows
      .filter((m) => m.status === "Scheduled" && meetingEnd(m) >= Date.now())
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 5),
    needs = rows
      .filter(
        (m) =>
          m.status !== "Cancelled" &&
          meetingEnd(m) < Date.now() &&
          ["Pending", "Overdue"].includes(meetingReportState(m)),
      )
      .sort((a, b) => meetingEnd(b) - meetingEnd(a))[0];
  return (
    pageHeading(
      "Meetings",
      "Plan meetings and keep reports and follow-ups connected.",
    ) +
    statCards([
      { label: "Total Meetings", value: rows.length, icon: "Meetings" },
      {
        label: "This Month",
        value: rows.filter((m) => m.date?.startsWith(todayISO().slice(0, 7)))
          .length,
        icon: "Meetings",
      },
      {
        label: "Reports Completed",
        value: reported,
        icon: "Reports",
        tone: "green",
      },
      {
        label: "Reports Pending",
        value: pending,
        icon: "Reports",
        tone: "red",
      },
      { label: "Overdue Reports", value: overdue, icon: "Clock", tone: "red" },
    ]) +
    `<div class="meetings-layout"><div>${calendarHTML(rows)}${recordTable("Meetings", rows)}</div><div class="meeting-side">${panelHTML("Upcoming Meetings", upcoming.map(meetingListCard).join("") || emptyHTML("No upcoming meetings."), '<button class="link" id="ui-upcoming">View all</button>')}${panelHTML("Quick Meeting Report", needs ? `<b>${esc(needs.name)}</b><p class="muted">${dateLabel(needs.date)} · ${timeLabel(needs.time)} – ${timeLabel(needs.end)}</p><button class="primary fullwidth" data-meeting-report="${esc(needs.id)}">＋ Add Meeting Report</button><ul class="report-includes"><li>Discussion summary</li><li>Key takeaways and decisions</li><li>Action points and next steps</li><li>Linked contact and opportunity records</li></ul>` : emptyHTML("All ended meetings have their required reports."))}${panelHTML(
      "Filters",
      filterBar("Meetings", [
        [
          "Meeting Type",
          "meetingType",
          ["Opportunity", "Contact Only", "Internal"],
        ],
        [
          "Report Status",
          "reportStatus",
          ["Pending", "Completed", "Overdue", "Not Required"],
        ],
        ["Status", "status", statuses.Meetings],
        ["Owner", "ownerId"],
      ]) +
        `<div class="date-filters"><label>From <input type="date" data-filter="dateMin" value="${esc(pageFilters().dateMin)}"></label><label>To <input type="date" data-filter="dateMax" value="${esc(pageFilters().dateMax)}"></label></div>`,
    )}</div></div>`
  );
}
function reportsPage() {
  const rows = filteredRows("Reports"),
    follow = rows.filter((x) => x.followUpDate && x.status !== "Completed"),
    counts = REPORT_TYPES.map((t) => ({
      label:
        t.name === "Meeting"
          ? "Meeting Reports"
          : t.name === "Issue"
            ? "Issues"
            : t.name === "Complaint"
              ? "Complaints"
              : t.name === "Follow-up"
                ? "Follow-ups"
                : t.name,
      value: rows.filter((x) => reportType(x) === t.name).length,
      icon: t.icon,
      action: `data-chart-filter="reportType" data-kind="Reports" data-value="${t.name}"`,
    }));
  const activity = activityRows()
    .filter((a) => a.recordType === "Reports")
    .slice(0, 4);
  return (
    pageHeading(
      "Reports",
      "Capture insights, track outcomes and keep everyone aligned.",
    ) +
    statCards([
      { label: "Total Reports", value: rows.length, icon: "Reports" },
      ...counts,
      {
        label: "Pending Follow-ups",
        value: follow.length,
        icon: "Clock",
        note:
          follow.filter((x) => x.followUpDate < todayISO()).length + " overdue",
        tone: "orange",
      },
    ]) +
    periodControls("Reports") +
    filterBar("Reports", [
      ["Report Type", "reportType", REPORT_TYPES.map((t) => t.name)],
      ["Service Line", "service"],
      ["Owner", "ownerId"],
      ["Status", "status", statuses.Reports],
    ]) +
    `<div class="analytics-grid reports-analytics">${panelHTML("Reports by Type", chartDonut(rows, reportType, "Total", "reportType", "Reports"))}${panelHTML("Reports Over Time", timeChart(rows))}${panelHTML("Reports by Service Line", chartBars(groupsOf(rows, "service"), "service", "Reports"))}</div>` +
    `<section class="report-activity-strip"><h2>${icon("Star")} Recent Activity</h2><div>${activity.map((a) => `<button data-report-detail="${esc(a.recordId)}"><span class="mini-avatar">${icon("Reports")}</span><span><b>${esc(a.text)}</b><small>${esc(a.company)}</small><small>${dateLabel(new Date(a.time + 3 * 3600000).toISOString().slice(0, 10))}</small></span></button>`).join("") || '<span class="muted">Report activity will appear here.</span>'}<button class="secondary compact" data-activity="true">View All Activity</button></div></section>` +
    recordTable("Reports", rows)
  );
}
function tasksPage() {
  const rows = filteredRows("Tasks"),
    counts = rows.reduce((o, x) => {
      const s = taskStatus(x);
      o[s] = (o[s] || 0) + 1;
      return o;
    }, {}),
    weekEnd = isoDate(
      new Date(dayStamp(todayISO()) + 7 * 86400000 + 3 * 3600000),
    ),
    due = rows.filter(
      (x) =>
        x.status !== "Completed" && x.date >= todayISO() && x.date <= weekEnd,
    ),
    meetings = recordsFor("Meetings", "Tasks")
      .filter((m) => m.date >= todayISO() && m.status === "Scheduled")
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .slice(0, 3);
  return (
    pageHeading("Tasks", "Stay on track. Turn actions into progress.") +
    `<div class="segments task-segments">${[
      "My Tasks",
      "All Tasks",
      "Overdue",
      "Due This Week",
      "Completed",
    ]
      .filter((v) => v !== "All Tasks" || isManager())
      .map(
        (v) =>
          `<button data-task-view="${v}" class="${ui.taskView === v ? "selected" : ""}">${v}</button>`,
      )
      .join("")}</div>` +
    `<div class="tasks-layout"><div>` +
    statCards([
      { label: "Total Tasks", value: rows.length, icon: "Tasks" },
      {
        label: "Overdue",
        value: counts.Overdue || 0,
        icon: "Warning",
        tone: "red",
        action: 'data-task-view="Overdue"',
      },
      {
        label: "Due This Week",
        value: due.length,
        icon: "Clock",
        tone: "orange",
        action: 'data-task-view="Due This Week"',
      },
      {
        label: "In Progress",
        value: counts["In Progress"] || 0,
        icon: "Tasks",
        tone: "blue",
      },
      {
        label: "Completed",
        value: counts.Completed || 0,
        icon: "Check",
        tone: "green",
        action: 'data-task-view="Completed"',
      },
    ]) +
    filterBar("Tasks", [
      ["Status", "status", statuses.Tasks],
      ["Priority", "priority", ["Low", "Medium", "High", "Critical"]],
      ["Assignee", "assigneeId", USERS.map((u) => u.id)],
      [
        "Opportunity",
        "opportunityId",
        scopedSource("Tasks").map((x) => x.opportunityId),
      ],
    ]) +
    recordTable("Tasks", rows) +
    `</div><div class="task-side">${panelHTML("My Calendar", meetings.map(meetingListCard).join("") || emptyHTML("No upcoming meetings."), '<button class="link" data-page="Meetings">View Calendar</button>')}${panelHTML("Tasks by Status", chartDonut(rows, taskStatus, "Tasks", "status", "Tasks"))}${panelHTML(
      "Upcoming Deadlines",
      rows
        .filter((x) => x.date && x.status !== "Completed")
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5)
        .map(
          (x) =>
            `<div class="deadline-row"><span class="${x.date < todayISO() ? "dangertext" : ""}">${dateLabel(x.date)}</span><button data-edit="Tasks" data-id="${esc(x.id)}">${esc(x.name)}</button><span class="priority priority-${normal(x.priority || "Medium")}">${esc(x.priority || "Medium")}</span></div>`,
        )
        .join("") || emptyHTML("No pending deadlines."),
    )}<div class="quote-card">Discipline today,<br>bigger opportunities tomorrow.</div></div></div>`
  );
}
function complaintsPage() {
  const rows = filteredRows("Complaints");
  return (
    pageHeading("Complaints", "Track concerns, ownership and resolution.") +
    statCards(
      ["Open", "In Progress", "Resolved"].map((s) => ({
        label: s,
        value: rows.filter((x) => x.status === s).length,
        icon: "Complaints",
        tone: s === "Resolved" ? "green" : "red",
        action: `data-chart-filter="status" data-kind="Complaints" data-value="${s}"`,
      })),
    ) +
    filterBar("Complaints", [
      ["Status", "status", statuses.Complaints],
      ["Company", "company"],
      ["Owner", "ownerId"],
    ]) +
    recordTable("Complaints", rows)
  );
}
list = function () {
  return page === "Contacts"
    ? contactsPage()
    : page === "Opportunities"
      ? opportunitiesPage()
      : page === "Meetings"
        ? meetingsPage()
        : page === "Reports"
          ? reportsPage()
          : page === "Tasks"
            ? tasksPage()
            : complaintsPage();
};

function notificationsList() {
  const out = [],
    prefs = userPrefs(),
    now = Date.now();
  for (const m of recordsFor("Meetings", "Notifications"))
    if (
      m.status !== "Cancelled" &&
      meetingEnd(m) <= now &&
      ["Pending", "Overdue"].includes(meetingReportState(m)) &&
      !(prefs["snooze_" + m.id] > now)
    )
      out.push({
        kind: meetingReportState(m) === "Overdue" ? "red" : "orange",
        title: "Meeting report required",
        text: m.name,
        action: `data-meeting-report="${esc(m.id)}"`,
        snooze: m.id,
      });
  const tasks = recordsFor("Tasks", "Notifications").filter(
    (t) => taskStatus(t) === "Overdue",
  );
  if (tasks.length)
    out.push({
      kind: "orange",
      title: tasks.length + " overdue tasks",
      text: "Review follow-up actions",
      action: 'data-notify-task="Overdue"',
    });
  const complaints = recordsFor("Complaints", "Notifications").filter(
    (c) => c.status !== "Resolved",
  );
  if (complaints.length)
    out.push({
      kind: "red",
      title: complaints.length + " complaints require attention",
      text: "Review open concerns",
      action: 'data-page="Complaints"',
    });
  const today = recordsFor("Meetings", "Notifications").filter(
    (m) => m.date === todayISO() && m.status === "Scheduled",
  );
  if (today.length)
    out.push({
      kind: "calm",
      title: today.length + " meetings today",
      text: "View your schedule",
      action: 'data-notify-today="true"',
    });
  const contacts = recordsFor("Contacts", "Notifications");
  let duplicates = 0;
  for (let i = 0; i < contacts.length; i++)
    if (
      findDuplicates(contacts[i], contacts[i].id).some((m) =>
        contacts.slice(i + 1).some((c) => c.id === m.record.id),
      )
    )
      duplicates++;
  if (duplicates)
    out.push({
      kind: "orange",
      title: duplicates + " possible duplicate contacts",
      text: "Review suggested matches",
      action: 'data-duplicate-review="true"',
    });
  return out;
}
function notificationBanner() {
  if (ui.bannerHidden) return "";
  const notifications = notificationsList();
  if (!notifications.length) return "";
  return `<div class="notification-banner"><div>${notifications
    .slice(0, 4)
    .map(
      (n) =>
        `<button class="notification-card ${n.kind}" ${n.action}><span class="notice-icon">${icon(n.kind === "red" ? "Warning" : n.kind === "orange" ? "Clock" : "Meetings")}</span><span><b>${esc(n.title)}</b><small>${esc(n.text)}</small></span><span>›</span></button>`,
    )
    .join(
      "",
    )}</div><button class="secondary compact" id="ui-notifications">View all</button><button class="icon-button" id="ui-hide-banner" aria-label="Dismiss notification bar">×</button></div>`;
}
function notificationCenter() {
  const items = notificationsList();
  const d = showDialog(
    `<div class="dialog-title"><h2>Notifications</h2><button data-close aria-label="Close">×</button></div>${items.map((n) => `<div class="notification-entry ${n.kind}"><span class="notice-icon">${icon("Bell")}</span><div><b>${esc(n.title)}</b><p>${esc(n.text)}</p><button class="primary compact" ${n.action}>${n.snooze ? "Add Report" : "Review"}</button>${n.snooze ? `<button class="secondary compact" data-snooze="${esc(n.snooze)}">Remind Me Later</button>` : ""}</div></div>`).join("") || emptyHTML("You are all caught up.")}`,
  );
  d.classList.add("dialog-medium");
}

render = function () {
  if (!window.DGJSession.ready) return;
  if (page === "Trash" && !isManager()) page = "Home";
  document.getElementById("nav").innerHTML = [
    "Home",
    "Contacts",
    "Opportunities",
    "Meetings",
    "Tasks",
    "Reports",
    "Complaints",
    ...(isManager() ? ["Trash"] : []),
  ]
    .map(
      (k) =>
        `<button class="${page === k ? "active" : ""}" data-page="${k}" ${page === k ? 'aria-current="page"' : ""}>${icon(k)}<span>${k}</span></button>`,
    )
    .join("");
  document
    .querySelectorAll(".bottom button")
    .forEach(
      (b) =>
        (b.innerHTML = icon(b.dataset.page) + `<span>${b.dataset.page}</span>`),
    );
  const notifications = notificationsList();
  document.getElementById("notifications").innerHTML =
    icon("Bell") +
    (notifications.length
      ? `<span class="badge">${notifications.length}</span>`
      : "");
  document.querySelector(".account .avatar").textContent = user.initials;
  document.querySelector(".account>span").textContent = user.name;
  const content =
    activeProfile && page === activeProfile.type
      ? profilePage()
      : page === "Home"
        ? home()
        : page === "Settings"
          ? settings()
          : page === "Help & Support"
            ? help()
            : page === "Search"
              ? searchResults()
              : page === "Trash"
                ? trashPage()
                : list();
  document.getElementById("main").innerHTML =
    (page !== "Home" ? notificationBanner() : "") + scopeControl() + content;
  if (page === "Home") {
    const donut = document.querySelector("#main .donut");
    if (donut) donut.style.background = chartGradient();
  }
};
showDialog = function (html) {
  const d = document.getElementById("modal");
  d.className = "";
  d.innerHTML = html;
  if (!d.open) d.showModal();
  return d;
};
closeDialog = function () {
  const d = document.getElementById("modal");
  d.close();
  d.className = "";
  d.innerHTML = "";
  detailRecord = null;
};

function fieldHTML(
  label,
  key,
  value = "",
  type = "text",
  required = false,
  extra = "",
) {
  return `<label class="formfield">${esc(label)}${required ? ' <span class="dangertext">*</span>' : ""}<input name="${key}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${extra}></label>`;
}
function textareaHTML(label, key, value = "", required = false, rows = 3) {
  return `<label class="formfield">${esc(label)}${required ? ' <span class="dangertext">*</span>' : ""}<textarea name="${key}" rows="${rows}" ${required ? "required" : ""}>${esc(value)}</textarea></label>`;
}
function selectHTML(label, key, value, values, required = false) {
  return `<label class="formfield">${esc(label)}${required ? ' <span class="dangertext">*</span>' : ""}<select name="${key}" ${required ? "required" : ""}>${values
    .map((v) => {
      const [id, text] = Array.isArray(v) ? v : [v, v];
      return `<option value="${esc(id)}" ${String(value ?? "") === String(id) ? "selected" : ""}>${esc(text)}</option>`;
    })
    .join("")}</select></label>`;
}
function chipsHTML(label, key, value, values) {
  return `<fieldset class="visibility"><legend>${label}</legend><div class="choice-chips">${values.map((v) => `<label><input name="${key}" type="radio" value="${v}" ${value === v ? "checked" : ""}>${v}</label>`).join("")}</div></fieldset>`;
}
function dialogTitle(title, subtitle = "") {
  return `<div class="dialog-title"><div><h2>${esc(title)}</h2>${subtitle ? `<p class="dialog-subtitle">${esc(subtitle)}</p>` : ""}</div><button type="button" data-close aria-label="Close dialog">×</button></div>`;
}
function wizardSteps(labels, step) {
  return `<div class="wizard-steps">${labels.map((l, i) => `<div class="wizard-step ${i === step ? "current" : i < step ? "done" : ""}"><i>${i < step ? "✓" : i + 1}</i><span>${l}</span></div>`).join("")}</div>`;
}
function privacyHTML(k, x) {
  return isManager() && (!x.id || x.ownerId === user.id)
    ? chipsHTML("Visibility", "visibility", x.visibility || "shared", [
        "shared",
        "private",
      ])
    : "";
}
function linksValid(draft) {
  return (
    !(draft.contactIds || []).some((c) => !visibleRecord("Contacts", c)) &&
    (!draft.opportunityId ||
      !!visibleRecord("Opportunities", draft.opportunityId)) &&
    (!draft.meetingId || !!visibleRecord("Meetings", draft.meetingId))
  );
}
async function saveEntity(k, id, draft, after) {
  if (!RECORD_TYPES.includes(k) || !String(draft.name || "").trim())
    return null;
  if (!linksValid(draft)) {
    toast("A linked record is no longer available.");
    return null;
  }
  const old = id ? visibleRecord(k, id) : null;
  if (id && !old) {
    toast("Record no longer available.");
    return null;
  }
  const now = Date.now(),
    allowVisibility =
      isManager() &&
      (!old || old.ownerId === user.id) &&
      ["Contacts", "Opportunities"].includes(k);
  const record = {
    ...old,
    ...draft,
    name: String(draft.name).trim(),
    company: String(draft.company || "").trim(),
    entityType: k,
    id: id || crypto.randomUUID(),
    ownerId: old?.ownerId || user.id,
    visibility: allowVisibility
      ? draft.visibility === "private"
        ? "private"
        : "shared"
      : old?.visibility || "shared",
    createdAt: old ? old.createdAt || null : now,
    updatedAt: now,
    history: [...(old?.history || [])],
  };
  if (old) {
    const { history, ...before } = old;
    record.history.push({ at: now, actorId: user.id, before });
  }
  if (k === "Opportunities") {
    record.stageHistory = structuredClone(
      old?.stageHistory?.length
        ? old.stageHistory
        : old
          ? stageIntervals(old)
          : [],
    );
    if (!old && record.startDate)
      record.stageHistory = [
        { stage: record.status, start: record.startDate, end: "" },
      ];
    if (old && old.status !== record.status) {
      const last = record.stageHistory.at(-1);
      if (last && !last.end) last.end = todayISO();
      record.stageHistory.push({
        stage: record.status,
        start: todayISO(),
        end: "",
      });
      record.lastStageChangedAt = now;
      record.closedDate = ["Won", "Lost"].includes(record.status)
        ? todayISO()
        : "";
    }
    if (["Won", "Lost"].includes(record.status) && !record.closedDate)
      record.closedDate = todayISO();
    if (!record.probability && record.probability !== 0)
      record.probability =
        record.status === "Won"
          ? 100
          : record.status === "Lost"
            ? 0
            : record.status === "Negotiation"
              ? 70
              : record.status === "Proposal"
                ? 50
                : record.status === "Qualification"
                  ? 25
                  : 10;
  }
  const ok = await transact((next) => {
    if (
      old &&
      k === "Contacts" &&
      (normal(old.company) !== normal(record.company) ||
        normal(old.jobTitle) !== normal(record.jobTitle)) &&
      (old.company || old.jobTitle)
    ) {
      const current = next.employmentHistory.find(
        (h) =>
          h.contactId === old.id &&
          !h.endDate &&
          normal(h.company) === normal(old.company) &&
          normal(h.jobTitle) === normal(old.jobTitle),
      );
      if (current) {
        current.endDate = todayISO();
        current.updatedAt = now;
      } else
        next.employmentHistory.push({
          id: crypto.randomUUID(),
          contactId: old.id,
          company: old.company || "",
          jobTitle: old.jobTitle || "",
          department: old.department || "",
          startDate: "",
          endDate: todayISO(),
          notes:
            "Previous role retained when the profile changed. Original start date not recorded.",
          ownerId: old.ownerId,
          visibility: old.visibility,
          createdAt: now,
          updatedAt: now,
        });
    }
    if (id) next[k] = next[k].map((r) => (r.id === id ? record : r));
    else next[k].push(record);
    addLog(next, `${singular(k)} ${id ? "updated" : "added"}`, record, k);
    if (after) after(next, record, old);
  });
  return ok ? db[k].find((r) => r.id === record.id) || null : null;
}
commitRecord = async function (k, id, draft) {
  const record = await saveEntity(k, id, draft);
  if (record) {
    closeDialog();
    render();
    if (!id && ["Contacts", "Opportunities"].includes(k))
      successDialog(k + " saved", record, k);
    else toast("Saved successfully");
  }
};
function successDialog(title, record, k, checks = []) {
  const d = showDialog(
    `<div class="success-dialog"><div class="dialog-title"><span></span><button data-close aria-label="Close">×</button></div><div class="success-emblem">✓</div><h2>${esc(title)}</h2><p>${esc(record.name)}</p>${checks.length ? `<div class="success-checks">${checks.map((t) => `<div>✓ ${esc(t)}</div>`).join("")}</div>` : ""}<div class="formbuttons"><button class="primary" ${["Contacts", "Opportunities"].includes(k) ? `data-success-profile="${k}" data-id="${esc(record.id)}"` : k === "Meetings" ? `data-meeting-detail="${esc(record.id)}"` : `data-report-detail="${esc(record.id)}"`}>View ${singular(k)}</button><button class="secondary" data-close>Done</button></div></div>`,
  );
  d.classList.add("dialog-medium");
}
extraFields = function (k, x) {
  const old = originalCRM.extraFields(k, x);
  if (k === "Opportunities")
    return (
      old +
      fieldHTML(
        "Probability (%)",
        "probability",
        x.probability ?? "",
        "number",
        false,
        'min="0" max="100"',
      ) +
      selectHTML(
        "Opportunity type",
        "opportunityType",
        x.opportunityType || "New Build",
        [
          "New Build",
          "Refurbishment",
          "Infrastructure",
          "Consultancy",
          "Other",
        ],
      ) +
      selectHTML("Source", "source", x.source || "Existing Client", [
        "Existing Client",
        "Referral",
        "Tender",
        "New Client",
        "Event",
        "Other",
      ])
    );
  if (k === "Tasks")
    return (
      old +
      selectHTML("Priority", "priority", x.priority || "Medium", [
        "Low",
        "Medium",
        "High",
        "Critical",
      ]) +
      selectHTML(
        "Assignee",
        "assigneeId",
        x.assigneeId || x.ownerId || user.id,
        USERS.map((u) => [u.id, u.name]),
      )
    );
  return old;
};
openForm = function (k, id, prefill = "", suggested) {
  if (k === "Reports") return startReport(id, suggested || { name: prefill });
  if (k === "Meetings") return bookingForm(id, { name: prefill, ...suggested });
  if (k === "Opportunities" && !id)
    return startOpportunity({ name: prefill, ...suggested });
  originalCRM.openForm(k, id, prefill, suggested);
  const d = document.getElementById("modal");
  d.classList.add("dialog-medium");
  d.querySelector("h2")?.insertAdjacentHTML(
    "afterend",
    '<button class="form-close" type="button" data-close aria-label="Close dialog">×</button>',
  );
  if (k === "Opportunities") {
    const form = d.querySelector("form");
    form.addEventListener(
      "submit",
      (e) => {
        const v = Number(form.elements.probability.value || 0);
        if (v < 0 || v > 100) {
          e.preventDefault();
          e.stopImmediatePropagation();
          toast("Probability must be between 0 and 100.");
        }
      },
      true,
    );
  }
};

function reportActionsHTML(actions = []) {
  return `<div class="action-items"><h3 class="wizard-heading">Follow-up actions</h3><p class="smallnote">Each action below becomes a linked task when you submit the report.</p>${actions.map((a, i) => `<div class="action-item"><input name="actionTitle_${i}" aria-label="Action ${i + 1}" placeholder="Action / next step" value="${esc(a.name)}" required><input name="actionDate_${i}" aria-label="Due date for action ${i + 1}" type="date" value="${esc(a.date)}" required><select name="actionOwner_${i}" aria-label="Assignee for action ${i + 1}">${USERS.map((u) => `<option value="${u.id}" ${a.assigneeId === u.id ? "selected" : ""}>${u.name}</option>`).join("")}</select><button type="button" data-remove-report-action="${i}" aria-label="Remove action ${i + 1}">×</button></div>`).join("")}<button type="button" class="secondary compact" id="ui-report-action">＋ Add Action</button></div>`;
}
function startReport(id, suggested = {}) {
  const old = id ? visibleRecord("Reports", id) : null;
  if (id && !old) return toast("Report is not available.");
  reportFlow = {
    id: id || null,
    step: id || suggested.reportType ? 1 : 0,
    draft: {
      name: "",
      reportType: "Meeting",
      date: todayISO(),
      status: "Completed",
      contactIds: [],
      opportunityId: "",
      service: "Other",
      actions: [],
      priority: "Medium",
      severity: "Medium",
      sentiment: "Neutral",
      ...structuredClone(old || {}),
      ...suggested,
    },
  };
  if (old && !old.actions) reportFlow.draft.actions = [];
  if (suggested.meetingId) applyMeetingToReport(suggested.meetingId);
  reportWizard();
}
function applyMeetingToReport(id) {
  const m = visibleRecord("Meetings", id);
  if (!m) return;
  const x = reportFlow.draft;
  x.meetingId = id;
  x.name = x.name || m.name + " – Meeting Report";
  x.company = m.company;
  x.contactIds = [...(m.contactIds || [])];
  x.opportunityId = m.opportunityId || "";
  x.service =
    visibleRecord("Opportunities", m.opportunityId)?.service ||
    x.service ||
    "Other";
}
function collectReport() {
  const form = document.getElementById("report-wizard");
  if (!form) return;
  const fd = new FormData(form),
    x = reportFlow.draft;
  for (const [key, value] of fd)
    if (!key.startsWith("action") && key !== "contactIds") x[key] = value;
  if (reportFlow.step === 2) {
    x.contactIds = fd.getAll("contactIds");
    x.opportunityId = fd.get("opportunityId") || "";
  }
  if (reportFlow.step === 1) {
    x.actions = x.actions.map((a, i) => ({
      ...a,
      name: fd.get("actionTitle_" + i) || "",
      date: fd.get("actionDate_" + i) || "",
      assigneeId: fd.get("actionOwner_" + i) || user.id,
    }));
    if (x.reportType === "Client Feedback")
      x.followUpRequired = fd.get("followUpRequired") === "yes";
  }
}
function reportDetailsFields(x) {
  const type = x.reportType;
  let content = "";
  if (type === "Meeting") {
    const meetings = recordsFor("Meetings", "Linking").filter(
      (m) => m.status !== "Cancelled",
    );
    content += selectHTML(
      "Select Meeting",
      "meetingId",
      x.meetingId || "",
      [
        ["", "Select a meeting"],
        ...meetings.map((m) => [m.id, m.name + " · " + dateLabel(m.date)]),
      ],
      true,
    );
    if (x.meetingId) {
      const m = visibleRecord("Meetings", x.meetingId);
      if (m)
        content += `<div class="record-card"><span class="stat-icon">${icon("Meetings")}</span><div><b>${esc(m.name)}</b><small>${dateLabel(m.date)} · ${timeLabel(m.time)} – ${timeLabel(m.end)}</small><small>${esc(m.company)}</small></div></div>`;
    }
    content +=
      fieldHTML("Report Title", "name", x.name, "text", true) +
      textareaHTML(
        "Discussion Summary",
        "summary",
        x.summary || x.notes,
        true,
      ) +
      textareaHTML("Key Takeaways", "keyTakeaways", x.keyTakeaways, true) +
      textareaHTML("Decisions Made", "decisions", x.decisions) +
      textareaHTML("Next Steps", "nextSteps", x.nextSteps);
  } else {
    content +=
      fieldHTML("Title", "name", x.name, "text", true) +
      textareaHTML(
        type === "Complaint"
          ? "Complaint Details"
          : type === "Client Feedback"
            ? "Feedback Details"
            : "Description",
        "details",
        x.details || x.notes,
        true,
        4,
      );
    if (type === "Issue")
      content +=
        selectHTML(
          "Category",
          "category",
          x.category || "Technical",
          [
            "Technical",
            "Commercial",
            "Design",
            "Schedule",
            "Communication",
            "Other",
          ],
          true,
        ) +
        chipsHTML("Severity", "severity", x.severity || "Medium", [
          "Low",
          "Medium",
          "High",
          "Critical",
        ]) +
        textareaHTML("Action Required", "actionRequired", x.actionRequired) +
        textareaHTML("Resolution / Progress", "resolution", x.resolution);
    if (type === "Complaint")
      content +=
        selectHTML(
          "Source",
          "source",
          x.source || "Client",
          ["Client", "Stakeholder", "Internal", "Other"],
          true,
        ) +
        chipsHTML("Priority", "priority", x.priority || "Medium", [
          "Low",
          "Medium",
          "High",
          "Critical",
        ]) +
        textareaHTML("Proposed Resolution", "resolution", x.resolution);
    if (type === "Client Feedback")
      content +=
        chipsHTML("Sentiment", "sentiment", x.sentiment || "Neutral", [
          "Positive",
          "Neutral",
          "Negative",
        ]) +
        textareaHTML("Key Takeaways", "keyTakeaways", x.keyTakeaways) +
        `<label class="formfield"><input type="checkbox" name="followUpRequired" value="yes" ${x.followUpRequired ? "checked" : ""} style="display:inline;width:auto"> Follow-up required</label>`;
    if (type === "Follow-up")
      content += selectHTML(
        "Assignee",
        "assigneeId",
        x.assigneeId || x.ownerId || user.id,
        USERS.map((u) => [u.id, u.name]),
      );
    if (type === "Other")
      content += selectHTML("Category", "category", x.category || "General", [
        "General",
        "Internal Note",
        "Observation",
        "Resource",
        "Other",
      ]);
  }
  content +=
    `<div class="form-grid">${fieldHTML(type === "Complaint" ? "Target Resolution Date" : type === "Issue" ? "Due Date" : "Follow-up Date", "followUpDate", x.followUpDate, "date", type === "Follow-up")}${selectHTML("Record Status", "status", x.status, ["Completed", "Open", "In Progress", "Follow-up", "Submitted"])}</div>` +
    reportActionsHTML(x.actions || []);
  return content;
}
function reportReview(x) {
  const meeting = visibleRecord("Meetings", x.meetingId);
  const contacts = (x.contactIds || [])
      .map((id) => visibleRecord("Contacts", id)?.name)
      .filter(Boolean),
    opportunity = visibleRecord("Opportunities", x.opportunityId);
  return `<div class="review-block"><h3>${esc(x.name || "Untitled report")}</h3><dl><div><dt>Type</dt><dd>${esc(x.reportType)}</dd></div><div><dt>Status</dt><dd>${esc(x.status)}</dd></div><div><dt>Company</dt><dd>${esc(x.company || "—")}</dd></div><div><dt>Follow-up date</dt><dd>${dateLabel(x.followUpDate)}</dd></div><div><dt>Meeting</dt><dd>${esc(meeting?.name || "—")}</dd></div><div><dt>Opportunity</dt><dd>${esc(opportunity?.name || "—")}</dd></div><div><dt>Contacts</dt><dd>${esc(contacts.join(", ") || "—")}</dd></div><div><dt>Service line</dt><dd>${esc(x.service || "Other")}</dd></div></dl></div><div class="review-block"><h3>${x.reportType === "Meeting" ? "Discussion Summary" : "Details"}</h3><p>${esc(x.summary || x.details || "—")}</p>${x.keyTakeaways ? `<h3>Key Takeaways</h3><p>${esc(x.keyTakeaways)}</p>` : ""}${x.decisions ? `<h3>Decisions Made</h3><p>${esc(x.decisions)}</p>` : ""}${x.resolution ? `<h3>Resolution</h3><p>${esc(x.resolution)}</p>` : ""}${x.nextSteps ? `<h3>Next Steps</h3><p>${esc(x.nextSteps)}</p>` : ""}</div>${x.actions.length ? `<div class="review-block"><h3>Tasks to Create / Update (${x.actions.length})</h3>${x.actions.map((a) => `<p>${esc(a.name)} · ${dateLabel(a.date)} · ${esc(userName(a.assigneeId))}</p>`).join("")}</div>` : ""}`;
}
function reportWizard() {
  const { step, draft: x } = reportFlow;
  let body = "";
  if (step === 0)
    body = `<h3 class="wizard-heading">Select Report Type</h3><div class="report-type-grid">${REPORT_TYPES.map((t) => `<button type="button" class="report-type-card ${x.reportType === t.name ? "selected" : ""}" data-report-type="${t.name}" aria-pressed="${x.reportType === t.name}"><span class="type-radio"></span><span class="type-icon ${t.tone}">${icon(t.icon)}</span><strong>${t.label}</strong><p>${t.description}</p><ul>${t.checks.map((c) => `<li>${c}</li>`).join("")}</ul></button>`).join("")}</div>`;
  else if (step === 1)
    body =
      `<h3 class="wizard-heading">${esc(REPORT_TYPES.find((t) => t.name === x.reportType)?.label || x.reportType)}</h3>` +
      reportDetailsFields(x);
  else if (step === 2)
    body =
      `<h3 class="wizard-heading">Link Records</h3><p class="smallnote">Links keep this report in the relevant profiles.</p>` +
      fieldHTML("Company", "company", x.company) +
      selectHTML("Service Line", "service", x.service, SERVICES) +
      linkFields("Reports", x);
  else
    body = `<h3 class="wizard-heading">Review & Submit</h3>` + reportReview(x);
  const d = showDialog(
    `<form id="report-wizard">${dialogTitle(reportFlow.id ? "Edit Report" : "Add Report", "Choose a report type and fill in the relevant details.")}${wizardSteps(["Select Type", "Add Details", "Link Records", "Review & Submit"], step)}${body}<div class="wizard-footer"><div><button type="button" class="secondary" data-close>Cancel</button>${step ? '<button type="button" class="secondary" id="ui-report-back">Back</button>' : ""}</div><div>${step ? '<button type="button" class="secondary" id="ui-report-draft">Save Draft</button>' : ""}<button type="submit" class="primary">${step === 3 ? "Submit Report" : "Next"}</button></div></div></form>`,
  );
  d.classList.add("dialog-wide");
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    collectReport();
    if (step === 1 && !validateReport(reportFlow.draft)) return;
    if (step === 2 && !linksValid(reportFlow.draft))
      return toast("Choose available linked records.");
    if (step === 3) return await submitReport(false);
    reportFlow.step++;
    reportWizard();
  };
}
function validateReport(x) {
  if (!String(x.name || "").trim())
    return (toast("Enter a report title."), false);
  if (
    x.reportType === "Meeting" &&
    (!visibleRecord("Meetings", x.meetingId) ||
      !String(x.summary || "").trim() ||
      !String(x.keyTakeaways || "").trim())
  )
    return (toast("Select the meeting, summary and key takeaways."), false);
  if (x.reportType !== "Meeting" && !String(x.details || "").trim())
    return (toast("Enter the report details."), false);
  if (x.reportType === "Follow-up" && !x.followUpDate)
    return (toast("Set a due date."), false);
  if (
    (x.actions || []).some(
      (a) =>
        !a.name.trim() || !a.date || !USERS.some((u) => u.id === a.assigneeId),
    )
  )
    return (
      toast("Each follow-up action needs a title, due date and assignee."),
      false
    );
  return true;
}
async function submitReport(draftOnly) {
  collectReport();
  const x = structuredClone(reportFlow.draft),
    id = reportFlow.id;
  if (draftOnly) {
    if (!x.name.trim()) return toast("Enter a title before saving your draft.");
    x.status = "Draft";
  } else if (!validateReport(x)) return;
  if (!linksValid(x)) return toast("A linked record is no longer available.");
  if (x.reportType === "Meeting" && x.meetingId) {
    const meeting = visibleRecord("Meetings", x.meetingId),
      existing = recordsFor("Reports", "Reports").find(
        (r) =>
          r.meetingId === x.meetingId &&
          reportType(r) === "Meeting" &&
          r.status !== "Draft" &&
          r.id !== id,
      );
    if (!draftOnly && existing)
      return toast(
        "This meeting already has a submitted report. Open that report to edit it.",
      );
    if (!meeting) return toast("Meeting is unavailable.");
    x.contactIds = [
      ...new Set([...(meeting.contactIds || []), ...(x.contactIds || [])]),
    ];
    x.opportunityId = x.opportunityId || meeting.opportunityId || "";
  }
  let createdActions = 0,
    complaintCreated = false;
  const record = await saveEntity("Reports", id, x, (next, r, old) => {
    if (draftOnly) return;
    r.submittedAt = Date.now();
    if (r.reportType === "Meeting" && r.meetingId) {
      const m = next.Meetings.find((m) => m.id === r.meetingId);
      if (m) {
        const { history, ...before } = m;
        m.history = [
          ...(history || []),
          { at: Date.now(), actorId: user.id, before },
        ];
        m.status = "Completed";
        m.reportId = r.id;
        m.updatedAt = Date.now();
        addLog(next, "Meeting completed and report submitted", m, "Meetings");
      }
    }
    r.actions = (r.actions || []).map((a) => {
      const prior = a.taskId
        ? next.Tasks.find((t) => t.id === a.taskId && t.reportId === r.id)
        : null;
      const task = {
        ...prior,
        id: prior?.id || crypto.randomUUID(),
        name: a.name.trim(),
        company: r.company,
        entityType: "Tasks",
        ownerId: prior?.ownerId || user.id,
        assigneeId: a.assigneeId || user.id,
        visibility: r.visibility,
        status: prior?.status || "Open",
        priority: r.priority || "Medium",
        date: a.date,
        contactIds: r.contactIds || [],
        opportunityId: r.opportunityId || "",
        meetingId: r.meetingId || "",
        reportId: r.id,
        createdAt: prior?.createdAt || Date.now(),
        updatedAt: Date.now(),
        history: prior?.history || [],
      };
      if (prior)
        next.Tasks = next.Tasks.map((t) => (t.id === prior.id ? task : t));
      else {
        next.Tasks.push(task);
        createdActions++;
      }
      addLog(
        next,
        prior ? "Follow-up task updated" : "Follow-up task created",
        task,
        "Tasks",
      );
      return { ...a, taskId: task.id };
    });
    if (r.reportType === "Complaint") {
      const prior = next.Complaints.find((c) => c.reportId === r.id);
      const c = {
        ...prior,
        id: prior?.id || crypto.randomUUID(),
        name: r.name,
        company: r.company,
        status:
          r.status === "Completed"
            ? "Resolved"
            : r.status === "In Progress"
              ? "In Progress"
              : "Open",
        priority: r.priority,
        notes: r.details,
        resolution: r.resolution,
        date: r.followUpDate || r.date,
        reportId: r.id,
        entityType: "Complaints",
        ownerId: prior?.ownerId || r.ownerId,
        visibility: r.visibility,
        contactIds: r.contactIds,
        opportunityId: r.opportunityId,
        createdAt: prior?.createdAt || Date.now(),
        updatedAt: Date.now(),
        history: prior?.history || [],
      };
      if (prior)
        next.Complaints = next.Complaints.map((c2) =>
          c2.id === c.id ? c : c2,
        );
      else {
        next.Complaints.push(c);
        complaintCreated = true;
      }
      addLog(next, "Complaint report linked", c, "Complaints");
      r.complaintId = c.id;
    }
  });
  if (record) {
    closeDialog();
    reportFlow = null;
    render();
    if (draftOnly) toast("Draft saved. No meeting or task status changed.");
    else
      successDialog("Report Submitted!", record, "Reports", [
        "Report saved in linked profiles",
        ...(record.reportType === "Meeting"
          ? ["Meeting marked as Completed"]
          : []),
        ...(createdActions
          ? [
              createdActions +
                " follow-up task" +
                (createdActions > 1 ? "s" : "") +
                " created",
            ]
          : []),
        ...(complaintCreated ? ["Complaint record created"] : []),
      ]);
  }
}

function startOpportunity(suggested = {}) {
  opportunityFlow = {
    step: 0,
    draft: {
      name: "",
      company: "",
      status: "Prospecting",
      service: "Cost Management",
      region: "Riyadh",
      value: "",
      startDate: todayISO(),
      targetDate: "",
      contactIds: [],
      scope: "",
      visibility: "shared",
      probability: 10,
      opportunityType: "New Build",
      source: "Existing Client",
      ...suggested,
    },
  };
  opportunityWizard();
}
function collectOpportunity() {
  const form = document.getElementById("opportunity-wizard");
  if (!form) return;
  const fd = new FormData(form);
  for (const [key, v] of fd)
    if (key !== "contactIds") opportunityFlow.draft[key] = v;
  if (opportunityFlow.step === 2)
    opportunityFlow.draft.contactIds = fd.getAll("contactIds");
}
function opportunityWizard() {
  const { step, draft: x } = opportunityFlow;
  let content = "";
  if (step === 0)
    content = `<div class="form-grid">${fieldHTML("Opportunity Name", "name", x.name, "text", true)}${fieldHTML("Company", "company", x.company, "text", true)}${selectHTML("Service Line", "service", x.service, SERVICES, true)}${selectHTML("Location / Region", "region", x.region, ["Riyadh", "Makkah", "Eastern Province", "NEOM", "Qiddiya", "Madinah", "Other"], true)}${fieldHTML("Estimated Value (SAR)", "value", x.value, "number", false, 'min="0"')}${fieldHTML("Start Date", "startDate", x.startDate, "date", true)}</div>`;
  else if (step === 1)
    content =
      `<div class="form-grid">${selectHTML("Current Stage", "status", x.status, STAGES)}${fieldHTML("Expected Close", "targetDate", x.targetDate, "date")}${fieldHTML("Probability (%)", "probability", x.probability, "number", false, 'min="0" max="100"')}${selectHTML("Opportunity Type", "opportunityType", x.opportunityType, ["New Build", "Refurbishment", "Infrastructure", "Consultancy", "Other"])}${selectHTML("Source", "source", x.source, ["Existing Client", "Referral", "Tender", "New Client", "Event", "Other"])}${fieldHTML("Reference", "reference", x.reference)}</div>` +
      textareaHTML("Project Scope", "scope", x.scope) +
      textareaHTML("Notes", "notes", x.notes);
  else if (step === 2)
    content = linkFields("Opportunities", x) + privacyHTML("Opportunities", x);
  else
    content = `<div class="review-block"><h3>${esc(x.name)}</h3><dl>${[
      ["Company", x.company],
      ["Service Line", x.service],
      ["Region", x.region],
      ["Current Stage", x.status],
      ["Value (SAR)", numberLabel(x.value)],
      ["Start Date", dateLabel(x.startDate)],
      ["Expected Close", dateLabel(x.targetDate)],
      ["Probability", x.probability + "%"],
      [
        "Linked Contacts",
        (x.contactIds || [])
          .map((id) => visibleRecord("Contacts", id)?.name)
          .filter(Boolean)
          .join(", ") || "—",
      ],
      ["Visibility", x.visibility],
    ]
      .map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`)
      .join("")}</dl><p>${esc(x.scope)}</p></div>`;
  const d = showDialog(
    `<form id="opportunity-wizard">${dialogTitle("Add Opportunity", "Enter the opportunity details below.")}${wizardSteps(["Basic Information", "Additional Details", "Contacts & Team", "Review & Create"], step)}${content}<div class="wizard-footer"><div><button type="button" class="secondary" data-close>Cancel</button>${step ? '<button type="button" class="secondary" id="ui-opportunity-back">Back</button>' : ""}</div><button class="primary" type="submit">${step === 3 ? "Create Opportunity" : "Next"}</button></div></form>`,
  );
  d.classList.add("dialog-wide");
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    collectOpportunity();
    const draft = opportunityFlow.draft;
    if (
      step === 0 &&
      (!draft.name.trim() || !draft.company.trim() || !draft.startDate)
    )
      return toast("Enter the opportunity name, company and start date.");
    if (
      draft.targetDate &&
      draft.startDate &&
      draft.targetDate < draft.startDate
    )
      return toast("Expected close must be on or after the start date.");
    if (Number(draft.value) < 0 || !Number.isFinite(Number(draft.value)))
      return toast("Enter a valid opportunity value.");
    if (Number(draft.probability) < 0 || Number(draft.probability) > 100)
      return toast("Probability must be between 0 and 100.");
    if (step === 3) return await reviewOpportunitySimilarity();
    opportunityFlow.step++;
    opportunityWizard();
  };
}
function similarOpportunities(draft) {
  const words = (s) =>
    new Set(
      normal(s)
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter(
          (x) =>
            x.length > 1 && !["phase", "the", "and", "project"].includes(x),
        ),
    );
  const tokens = words(draft.name);
  return recordsFor("Opportunities", "Linking")
    .map((x) => {
      const other = words(x.name),
        overlap = [...tokens].filter((t) => other.has(t)).length,
        union = new Set([...tokens, ...other]).size,
        nameScore = union ? overlap / union : 0,
        companySame =
          normal(x.company) && normal(x.company) === normal(draft.company);
      return {
        record: x,
        score: Math.round(nameScore * 80 + (companySame ? 20 : 0)),
        nameScore,
      };
    })
    .filter((m) => m.nameScore >= 0.5 && m.score >= 50)
    .sort((a, b) => b.score - a.score);
}
async function createOpportunity() {
  const x = {
    ...opportunityFlow.draft,
    value: Number(opportunityFlow.draft.value || 0),
    probability: Number(opportunityFlow.draft.probability || 0),
  };
  const r = await saveEntity("Opportunities", null, x);
  if (r) {
    closeDialog();
    opportunityFlow = null;
    render();
    successDialog("Opportunity Created", r, "Opportunities", [
      "Opportunity profile created",
      "Linked contacts and stage history saved",
    ]);
  }
}
async function reviewOpportunitySimilarity() {
  const matches = similarOpportunities(opportunityFlow.draft);
  if (!matches.length) return await createOpportunity();
  const d = showDialog(
    `${dialogTitle("Possible Similar Opportunity Found", "Review the existing opportunities before creating another record.")}<p class="smallnote">Match percentage compares words in the name and the company. It is a suggestion for your review.</p>${matches
      .slice(0, 4)
      .map(
        ({ record: x, score }) =>
          `<div class="review-block"><h3>${esc(x.name)} <span class="similarity-score">${score}% match</span></h3><dl>${[
            ["Company", x.company],
            ["Service Line", x.service],
            ["Stage", x.status],
            ["Value (SAR)", numberLabel(x.value)],
            ["Region", x.region],
            ["Owner", userName(x.ownerId)],
          ]
            .map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v)}</dd></div>`)
            .join(
              "",
            )}</dl><div class="detail-actions"><button class="secondary compact" data-similar-view="${esc(x.id)}">View Opportunity</button><button class="secondary compact" data-coordinate="${esc(x.id)}">Coordinate with Owner</button></div></div>`,
      )
      .join(
        "",
      )}<div class="formbuttons"><button class="secondary" id="ui-similar-back">Back</button><button class="primary" id="ui-similar-continue">Continue as New</button></div>`,
  );
  d.classList.add("dialog-medium");
}
function coordinationNote(id) {
  const x = visibleRecord("Opportunities", id);
  if (!x) return;
  const subject =
      "Potentially related opportunity – " + opportunityFlow.draft.name,
    body = `Hi ${userName(x.ownerId)},\n\nI am looking to add ${opportunityFlow.draft.name} for ${opportunityFlow.draft.company}. It appears related to ${x.name}.\n\nPlease review the existing opportunity and coordinate the next steps.\n\n${user.name}`;
  const d = showDialog(
    `<form id="coordination-form">${dialogTitle("Coordinate on Similar Opportunity")}<p class="notice">Save the note in the existing opportunity, or copy it into your company communication app. No message is sent from CRM.</p>${fieldHTML("Owner", "ownerName", userName(x.ownerId), "text", false, "readonly")}${fieldHTML("Subject", "subject", subject, "text", true)}${textareaHTML("Coordination Note", "body", body, true, 7)}<div class="formbuttons"><button type="button" class="secondary" id="ui-coordinate-back">Back</button><button type="button" class="secondary" id="ui-coordinate-copy">Copy Note</button><button class="primary" type="submit">Save Note & Continue</button></div></form>`,
  );
  d.classList.add("dialog-medium");
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    if (
      await transact((next) =>
        next.activity.unshift({
          id: crypto.randomUUID(),
          kind: "interaction",
          channel: "Note",
          text: v.subject,
          subject: v.subject,
          body: v.body,
          recordType: "Opportunities",
          recordId: x.id,
          opportunityId: x.id,
          contactIds: x.contactIds || [],
          company: x.company,
          time: Date.now(),
          occurredAt: Date.now(),
          actorId: user.id,
          ownerId: user.id,
          visibility: x.visibility,
          outcome: "Coordination requested",
        }),
      )
    ) {
      await reviewOpportunitySimilarity();
      toast("Coordination note saved. No message sent.");
    }
  };
}
function bookingForm(id, suggested = {}) {
  const old = id ? visibleRecord("Meetings", id) : null;
  if (id && !old) return toast("Meeting is not available.");
  const x = {
    name: "",
    company: "Microsoft Teams",
    date: todayISO(),
    time: "10:00",
    end: "11:00",
    status: "Scheduled",
    reportRequired: true,
    meetingType: "Opportunity",
    contactIds: [],
    opportunityId: "",
    ...old,
    ...suggested,
  };
  const d = showDialog(
    `<form id="booking-form">${dialogTitle(id ? "Edit Meeting" : "Schedule Meeting", "Plan the meeting and link the people and opportunity involved.")}<div class="form-grid">${fieldHTML("Meeting Title", "name", x.name, "text", true)}${selectHTML("Meeting Type", "meetingType", x.meetingType, ["Opportunity", "Contact Only", "Internal"])}${fieldHTML("Date", "date", x.date, "date", true)}${fieldHTML("Location / Platform", "company", x.company, "text", true)}${fieldHTML("Start Time (Riyadh)", "time", x.time, "time", true)}${fieldHTML("End Time (Riyadh)", "end", x.end, "time", true)}<div class="span-two">${fieldHTML("Teams / Meeting Link", "url", x.url, "url")}</div>${selectHTML("Status", "status", x.status, statuses.Meetings)}${fieldHTML("External Attendees", "externalAttendees", x.externalAttendees, "text")}</div>${linkFields("Meetings", x)}<label class="formfield"><input type="checkbox" name="reportRequired" ${x.reportRequired !== false ? "checked" : ""} style="display:inline;width:auto"> Meeting report required</label>${textareaHTML("Agenda / Notes", "notes", x.notes)}<div id="booking-conflicts"></div><div class="formbuttons"><button type="button" class="secondary" data-close>Cancel</button><button class="primary" type="submit">${id ? "Save Changes" : "Schedule Meeting"}</button></div></form>`,
  );
  d.classList.add("dialog-wide");
  let acknowledged = "";
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      v = Object.fromEntries(fd);
    v.contactIds = fd.getAll("contactIds");
    v.reportRequired = fd.has("reportRequired");
    v.opportunityId = fd.get("opportunityId") || "";
    if (v.end <= v.time) return toast("End time must be after start time.");
    if (v.url && !safeHTTPS(v.url))
      return toast("Use a valid HTTPS meeting link.");
    if (v.status === "Cancelled" && meetingReport(old || { id: "" }))
      return toast(
        "This meeting has a submitted report. Keep the completed meeting record.",
      );
    const conflicts = recordsFor("Meetings", "Booking").filter(
      (m) =>
        m.id !== id &&
        m.status !== "Cancelled" &&
        m.date === v.date &&
        m.time < v.end &&
        m.end > v.time &&
        (m.ownerId === (old?.ownerId || user.id) ||
          m.contactIds?.some((c) => v.contactIds.includes(c))),
    );
    const signature = JSON.stringify([v.date, v.time, v.end, v.contactIds]);
    if (conflicts.length && acknowledged !== signature) {
      acknowledged = signature;
      d.querySelector("#booking-conflicts").innerHTML =
        `<div class="notice"><b>Scheduling conflict</b><p>${conflicts.map((c) => esc(c.name) + " (" + timeLabel(c.time) + "–" + timeLabel(c.end) + ")").join("<br>")}</p>Review the overlap. Click ${id ? "Save Changes" : "Schedule Meeting"} again to confirm.</div>`;
      return;
    }
    const r = await saveEntity("Meetings", id, v);
    if (r) {
      closeDialog();
      render();
      if (id) toast("Meeting updated.");
      else
        successDialog("Meeting Scheduled", r, "Meetings", [
          "Meeting saved in the calendar",
          "Attendees linked to their contact profiles",
          ...(v.reportRequired
            ? ["Report reminder appears when the meeting ends"]
            : []),
        ]);
    }
  };
}
function meetingDetail(id) {
  const m = visibleRecord("Meetings", id);
  if (!m) return toast("Meeting is not available.");
  const report = meetingReport(m),
    tasks = recordsFor("Tasks", "Meetings").filter((t) => t.meetingId === id),
    contacts = (m.contactIds || [])
      .map((c) => visibleRecord("Contacts", c))
      .filter(Boolean),
    opp = visibleRecord("Opportunities", m.opportunityId);
  detailRecord = { type: "Meetings", id };
  const d = showDialog(
    `${dialogTitle("Meeting Details")}<h2>${esc(m.name)}</h2><p class="dialog-subtitle">${dateLabel(m.date)} · ${timeLabel(m.time)} – ${timeLabel(m.end)} · ${esc(m.company)}</p><div class="detail-badges"><span>Meeting ${pillHTML(m.status)}</span><span>Report ${pillHTML(meetingReportState(m))}</span></div><div class="detail-actions"><button class="secondary" data-edit="Meetings" data-id="${esc(id)}">${icon("Edit")} Edit Meeting</button>${m.url ? `<button class="primary" data-join="${esc(id)}">Join Meeting</button>` : ""}<button class="secondary" data-ics="${esc(id)}">${icon("Meetings")} Add to Calendar</button>${report ? `<button class="primary" data-report-detail="${esc(report.id)}">View Report</button>` : m.status !== "Cancelled" && m.reportRequired !== false ? `<button class="primary" data-meeting-report="${esc(id)}">＋ Add Report</button>` : ""}</div><div class="detail-section"><h3>Attendees (${contacts.length})</h3><div class="attendee-people">${contacts.map((c) => `<span>${avatarHTML(c)}${profileLink("Contacts", c.id, c.name)}</span>`).join("") || '<span class="muted">No contact attendees linked.</span>'}${m.externalAttendees ? `<span>${esc(m.externalAttendees)}</span>` : ""}</div></div><div class="detail-section"><h3>Linked To</h3>${opp ? `<div class="record-card"><span>${icon("Opportunities")}</span><div>${profileLink("Opportunities", opp.id, opp.name)}<small>${esc(opp.company)} · ${esc(opp.status)}</small></div></div>` : contacts.length ? '<span class="pill">Contact Only</span>' : '<span class="muted">No linked opportunity.</span>'}</div><div class="detail-section"><h3>Agenda / Notes</h3><p>${esc(m.notes || "No agenda recorded.")}</p></div><div class="detail-section"><h3>Next Steps (${tasks.length})</h3>${tasks.map((t) => `<div class="row"><input type="checkbox" data-check="${esc(t.id)}" ${t.status === "Completed" ? "checked" : ""} aria-label="Complete ${esc(t.name)}"><button class="grow" style="text-align:left" data-edit="Tasks" data-id="${esc(t.id)}">${esc(t.name)}</button><span class="${taskStatus(t) === "Overdue" ? "dangertext" : ""}">${dateLabel(t.date)}</span>${ownerHTML(t.assigneeId || t.ownerId)}</div>`).join("") || emptyHTML("Report actions will appear here.")}<button class="secondary compact" data-meeting-task="${esc(id)}">＋ Add Follow-up Task</button></div><div class="detail-section"><h3>Activity Timeline</h3>${
      db.activity
        .filter(
          (a) =>
            a.recordType === "Meetings" && a.recordId === id && linkedAccess(a),
        )
        .slice(0, 8)
        .map(
          (a) =>
            `<p><b>${esc(a.text)}</b><br><small class="muted">${fullDate(a.time)} · ${esc(userName(a.actorId))}</small></p>`,
        )
        .join("") || '<p class="muted">No changes recorded yet.</p>'
    }</div>`,
  );
  d.classList.add("dialog-drawer");
  detailRecord = { type: "Meetings", id };
}
function reportDetail(id) {
  const r = visibleRecord("Reports", id);
  if (!r) return toast("Report is not available.");
  const contacts = (r.contactIds || [])
      .map((id) => visibleRecord("Contacts", id))
      .filter(Boolean),
    opp = visibleRecord("Opportunities", r.opportunityId),
    m = visibleRecord("Meetings", r.meetingId),
    tasks = recordsFor("Tasks", "Reports").filter((t) => t.reportId === id);
  const d = showDialog(
    `${dialogTitle("Report Details")}<h2>${esc(r.name)}</h2><div class="detail-badges"><span class="tag">${esc(reportType(r))}</span>${pillHTML(r.status)}<span class="muted">${dateLabel(r.date)}</span></div><div class="detail-actions"><button class="primary" data-edit="Reports" data-id="${esc(id)}">Edit Report</button>${isManager() ? `<button class="secondary" data-report-export="${esc(id)}">${icon("Download")} Export Report</button>` : ""}</div><dl class="detail-grid"><div><dt>Company</dt><dd>${esc(r.company || "—")}</dd></div><div><dt>Owner</dt><dd>${esc(userName(r.ownerId))}</dd></div><div><dt>Service Line</dt><dd>${esc(r.service || "—")}</dd></div><div><dt>Follow-up Date</dt><dd>${dateLabel(r.followUpDate)}</dd></div></dl><div class="detail-section"><h3>Linked Records</h3>${m ? `<div class="record-card"><span>${icon("Meetings")}</span><button class="record-link" data-meeting-detail="${esc(m.id)}">${esc(m.name)}</button></div>` : ""}${opp ? '<div class="record-card">' + profileLink("Opportunities", opp.id, opp.name) + "</div>" : ""}<div class="attendee-people">${contacts.map((c) => `<span>${avatarHTML(c)}${profileLink("Contacts", c.id, c.name)}</span>`).join("")}</div></div>${[
      ["Discussion Summary", r.summary],
      ["Details", r.details || r.notes],
      ["Key Takeaways", r.keyTakeaways],
      ["Decisions Made", r.decisions],
      ["Next Steps", r.nextSteps],
      ["Action Required", r.actionRequired],
      ["Resolution", r.resolution],
      [
        "Sentiment",
        r.sentiment && reportType(r) === "Client Feedback" ? r.sentiment : "",
      ],
    ]
      .filter(([l, v]) => v)
      .map(
        ([l, v]) =>
          `<div class="detail-section"><h3>${l}</h3><p>${esc(v)}</p></div>`,
      )
      .join(
        "",
      )}<div class="detail-section"><h3>Follow-up Tasks (${tasks.length})</h3>${tasks.map((t) => `<div class="row"><input type="checkbox" data-check="${esc(t.id)}" ${t.status === "Completed" ? "checked" : ""} aria-label="Complete ${esc(t.name)}"><button class="grow" style="text-align:left" data-edit="Tasks" data-id="${esc(t.id)}">${esc(t.name)}</button>${pillHTML(taskStatus(t))}<span class="date">${dateLabel(t.date)}</span></div>`).join("") || '<p class="muted">No follow-up tasks.</p>'}</div><div class="detail-section"><h3>Files</h3>${filesSection("Reports", id)}</div>${historyHTML(r)}`,
  );
  d.classList.add("dialog-drawer");
  detailRecord = { type: "Reports", id };
}
function exportReport(id) {
  if (!isManager()) return toast("Only the General Manager can export.");
  const r = visibleRecord("Reports", id);
  if (!r) return;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(r.name)}</title><style>body{font:15px/1.6 Arial;margin:45px;max-width:900px;color:#202a37}h1,h2{font-family:Georgia;color:#4d5843}header{border-bottom:1px solid #bbb;padding-bottom:20px}p{white-space:pre-wrap}dl{display:grid;grid-template-columns:170px 1fr}dt{color:#6b7463}dd{margin:0}section{margin:25px 0}small{color:#7d8277}@media print{body{margin:20px}}</style></head><body><header><h2>DGJ | CRM</h2><h1>${esc(r.name)}</h1><small>${esc(reportType(r))} · ${esc(r.status)} · ${dateLabel(r.date)}</small></header><dl>${[
    ["Company", r.company],
    ["Owner", userName(r.ownerId)],
    ["Service Line", r.service],
    ["Follow-up Date", dateLabel(r.followUpDate)],
    ["Meeting", visibleRecord("Meetings", r.meetingId)?.name || "—"],
    [
      "Opportunity",
      visibleRecord("Opportunities", r.opportunityId)?.name || "—",
    ],
  ]
    .map(([l, v]) => `<dt>${l}</dt><dd>${esc(v || "—")}</dd>`)
    .join("")}</dl>${[
    ["Discussion Summary", r.summary],
    ["Description", r.details || r.notes],
    ["Key Takeaways", r.keyTakeaways],
    ["Decisions", r.decisions],
    ["Next Steps", r.nextSteps],
    ["Resolution", r.resolution],
  ]
    .filter(([l, v]) => v)
    .map(([l, v]) => `<section><h2>${l}</h2><p>${esc(v)}</p></section>`)
    .join("")}<section><h2>Follow-up Tasks</h2>${
    recordsFor("Tasks", "Reports")
      .filter((t) => t.reportId === id)
      .map(
        (t) =>
          `<p>${esc(t.name)} — ${dateLabel(t.date)} — ${esc(userName(t.assigneeId || t.ownerId))} — ${esc(taskStatus(t))}</p>`,
      )
      .join("") || "<p>None recorded.</p>"
  }</section></body></html>`;
  download(
    "DGJ-report-" + r.id.slice(0, 8) + ".html",
    html,
    "text/html;charset=utf-8",
  );
  toast("Report exported. Open it to print or save as PDF.");
}
