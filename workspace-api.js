import { createHash } from "node:crypto";
import { z } from "zod";
import { transaction } from "./db.js";
import { fail, unavailable } from "./errors.js";
import { TYPES, parse, recordInput } from "./validation.js";
import {
  trustedMember,
  manager,
  snapshot,
  visible,
  authorized,
  asRecord,
  audit,
  requestedLinks,
  validateLinks,
  setLinks,
  visibilityFor,
  validateAssignee,
  versionMatches,
  stable,
} from "./records.js";

const AUX = [
  "notes",
  "attachments",
  "employmentHistory",
  "emailDrafts",
  "activity",
];
const text = (n = 250) => z.string().max(n);
const date = z.union([z.literal(""), z.iso.date()]);
const id = z.uuid();
const parent = { recordType: z.enum(TYPES), recordId: id };
const supplements = {
  notes: z
    .object({ ...parent, title: text().min(1), body: text(20000).min(1) })
    .strict(),
  attachments: z
    .object({
      ...parent,
      name: text().min(1),
      mime: text(200),
      size: z.number().int().min(0).max(1572864),
      data: text(2200000),
    })
    .strict(),
  employmentHistory: z
    .object({
      contactId: id,
      company: text().min(1),
      jobTitle: text(),
      department: text().optional(),
      startDate: date,
      endDate: date,
      notes: text(20000).optional(),
    })
    .strict(),
  emailDrafts: z
    .object({
      opportunityId: id,
      contactIds: z.array(id).max(50),
      to: z.array(z.email()).max(50),
      cc: z.array(z.email()).max(50),
      subject: text(250),
      body: text(20000),
      status: z.literal("Draft"),
    })
    .strict(),
  activity: z
    .object({
      ...parent,
      kind: z.literal("interaction"),
      text: text(),
      subject: text(),
      body: text(20000).min(1),
      channel: text(100),
      outcome: text(),
      nextStep: text(2000).optional(),
      contactIds: z.array(id).max(50),
      opportunityId: z.union([z.literal(""), id]),
      company: text().optional(),
      occurredAt: z.number().int().min(0),
    })
    .strict(),
};
const operation = z
  .object({
    kind: z.enum([...TYPES, ...AUX]),
    id,
    action: z.enum(["create", "update", "trash", "restore", "purge"]),
    version: z.number().int().min(0),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const inputSchema = z
  .object({
    operations: z.array(operation).max(1000),
    preferences: z
      .object({
        version: z.number().int().min(0),
        prefs: z.record(z.string(), z.unknown()),
        views: z.array(z.record(z.string(), z.unknown())).max(50),
      })
      .strict()
      .optional(),
  })
  .strict();
const ms = (value) => (value ? new Date(value).getTime() : null);
const today = () => new Date(Date.now() + 10800000).toISOString().slice(0, 10);

function noPoison(value, depth = 0) {
  if (depth > 20) fail(400, "INVALID_INPUT", "Nested data is too deep.");
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        fail(400, "INVALID_INPUT", "Invalid data key.");
      noPoison(child, depth + 1);
    }
}
function refs(row) {
  const d = row.data;
  if (row.kind === "employmentHistory")
    return [{ id: d.contactId, type: "Contacts" }];
  return [
    ...(d.recordId ? [{ id: d.recordId, type: d.recordType }] : []),
    ...requestedLinks(d),
  ];
}
function auxVisible(graph, user, row, deleted = false) {
  return (
    !!row &&
    (row.kind !== "emailDrafts" || row.ownerId === user.id) &&
    (row.kind !== "activity" ||
      user.role === "manager" ||
      row.ownerId === user.id) &&
    refs(row).every(
      (ref) =>
        graph.get(ref.id)?.type === ref.type &&
        visible(graph, user, graph.get(ref.id), deleted),
    )
  );
}
function safeRecord(graph, user, row) {
  const out = asRecord(row);
  for (const key of ["reportId", "complaintId"]) {
    if (out[key] && !visible(graph, user, graph.get(out[key]))) out[key] = "";
  }
  out.history = (row.data.history || []).filter(
    (h) =>
      (!h.before ||
        h.before.visibility !== "private" ||
        (user.role === "manager" && h.before.ownerId === user.id)) &&
      requestedLinks(h.before || {}, row.type).every(
        (ref) =>
          graph.get(ref.id)?.type === ref.type &&
          visible(graph, user, graph.get(ref.id)),
      ),
  );
  return out;
}
async function loadAux(db) {
  const result = await db.query(
    "SELECT value FROM crm_settings WHERE key='workspace-aux'",
  );
  return result.rows[0]?.value || [];
}
async function loadPrefs(db, user) {
  const result = await db.query(
    "SELECT data FROM crm_preferences WHERE user_id=$1",
    [user.id],
  );
  return result.rows[0]?.data || {};
}
async function view(db, user, graph, aux) {
  graph ||= await snapshot(db);
  aux ||= await loadAux(db);
  const state = Object.fromEntries(
    [...TYPES, ...AUX, "savedViews"].map((k) => [k, []]),
  );
  for (const row of graph.values())
    if (visible(graph, user, row, !!row.deleted_at && user.role === "manager"))
      state[row.type].push(safeRecord(graph, user, row));
  for (const row of aux)
    if (auxVisible(graph, user, row))
      state[row.kind].push({
        ...row.data,
        id: row.id,
        version: row.version,
        ownerId: row.ownerId,
        actorId: row.ownerId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        time: row.createdAt,
        visibility: "shared",
      });
  const prefs = await loadPrefs(db, user),
    personal = prefs.workspace || {};
  state.preferences = { [user.id]: personal.prefs || {} };
  state.savedViews = (personal.views || []).map((v) => ({
    ...v,
    ownerId: user.id,
  }));
  state.preferenceVersion = personal.version || 0;
  const { rows: events } = await db.query(
    "SELECT * FROM crm_audit ORDER BY created_at DESC,id DESC LIMIT 1000",
  );
  for (const event of events) {
    if (user.role !== "manager" && event.actor_id !== user.id) continue;
    if (
      event.policy.some(
        (p) =>
          p.visibility === "private" &&
          (user.role !== "manager" || p.ownerId !== user.id),
      )
    )
      continue;
    const row = graph.get(event.record_id);
    if (row && !visible(graph, user, row)) continue;
    state.activity.push({
      id: event.id,
      kind: "audit",
      text: event.action,
      recordId: event.record_id,
      recordType: event.record_type,
      actorId: event.actor_id,
      ownerId: event.actor_id,
      visibility: "shared",
      time: ms(event.created_at),
      company: row?.data.name || "",
    });
  }
  state.activity.sort((a, b) => b.time - a.time);
  return state;
}
function historicalData(user, type, old, input) {
  const { visibility: ignored, ...change } = input;
  const data = { ...old?.data, ...change };
  if (old)
    data.history = [
      ...(old.data.history || []),
      {
        at: Date.now(),
        actorId: user.id,
        before: { ...asRecord(old), history: undefined },
      },
    ].slice(-250);
  else data.history = [];
  data.contactIds ||= [];
  if (type === "Opportunities") {
    const stages = structuredClone(old?.data.stageHistory || []);
    if (!old && data.startDate)
      stages.push({
        stage: data.status || "Prospecting",
        start: data.startDate,
        end: "",
      });
    if (old && old.data.status !== data.status) {
      if (stages.at(-1) && !stages.at(-1).end) stages.at(-1).end = today();
      stages.push({ stage: data.status, start: today(), end: "" });
      data.lastStageChangedAt = Date.now();
      data.closedDate = ["Won", "Lost"].includes(data.status) ? today() : "";
    }
    data.stageHistory = stages;
  }
  if (type === "Reports" && data.status !== "Draft")
    data.submittedAt = old?.data.submittedAt || Date.now();
  return data;
}

export async function writeWorkspace(pool, actor, body, key) {
  noPoison(body);
  const input = parse(inputSchema, body);
  if (!input.operations.length && !input.preferences)
    fail(400, "EMPTY_CHANGE", "Provide a change.");
  const distinct = new Set();
  for (const op of input.operations) {
    if (distinct.has(op.id)) fail(400, "INVALID_INPUT", "Repeated record ID.");
    distinct.add(op.id);
  }
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(stable(input)))
    .digest("hex");
  return transaction(pool, async (db) => {
    const user = await trustedMember(db, actor.id),
      graph = await snapshot(db),
      initial = new Map(graph),
      aux = await loadAux(db);
    const requestKey = `workspace-request:${user.id}:${key}`;
    const existing = (
      await db.query("SELECT value FROM crm_settings WHERE key=$1", [
        requestKey,
      ])
    ).rows[0]?.value;
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        fail(
          409,
          "REQUEST_KEY_REUSED",
          "Use a new request key for different changes.",
        );
      return { state: await view(db, user, graph, aux), replayed: true };
    }
    let nextAux = structuredClone(aux);
    const core = [],
      pendingAux = [],
      removedAux = [];
    for (const op of input.operations) {
      if (TYPES.includes(op.kind)) {
        const old = initial.get(op.id);
        if (op.action === "create") {
          if (old) fail(409, "RECORD_EXISTS", "Record already exists.");
          if (op.version !== 0)
            fail(400, "INVALID_VERSION", "New records use version 0.");
          const data = recordInput(op.kind, op.data),
            visibility = visibilityFor(user, op.kind, data);
          const row = {
            id: op.id,
            type: op.kind,
            owner_id: user.id,
            visibility,
            data: historicalData(user, op.kind, null, data),
            version: 1,
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
            deleted_by: null,
            parents: [],
          };
          graph.set(op.id, row);
          core.push({ op, row });
        } else {
          const deleted = ["restore", "purge"].includes(op.action);
          authorized(initial, user, op.kind, op.id, deleted);
          versionMatches(old, op.version);
          if (op.action === "update") {
            const change = recordInput(op.kind, op.data, true);
            const row = {
              ...old,
              data: historicalData(user, op.kind, old, change),
              visibility: visibilityFor(user, op.kind, change, old),
              version: old.version + 1,
              updated_at: new Date(),
            };
            graph.set(op.id, row);
            core.push({ op, row });
          } else {
            manager(user);
            if (op.data)
              fail(400, "INVALID_INPUT", "This action takes no data.");
            if (op.action === "purge") {
              graph.delete(op.id);
              core.push({ op, row: old });
            } else {
              const row = {
                ...old,
                version: old.version + 1,
                updated_at: new Date(),
                deleted_at: op.action === "trash" ? new Date() : null,
                deleted_by: op.action === "trash" ? user.id : null,
              };
              graph.set(op.id, row);
              core.push({ op, row });
            }
          }
        }
      } else {
        const old = aux.find((r) => r.id === op.id && r.kind === op.kind);
        if (op.action === "create") {
          if (
            aux.some((r) => r.id === op.id) ||
            initial.has(op.id) ||
            op.version !== 0
          )
            fail(409, "RECORD_EXISTS", "Record already exists.");
        } else {
          if (!auxVisible(initial, user, old)) unavailable();
          if (op.version !== old.version)
            fail(
              412,
              "EDIT_CONFLICT",
              "Someone changed this item. Reload before saving.",
            );
          if (op.kind === "emailDrafts" && old.ownerId !== user.id)
            unavailable();
          if (
            op.kind === "notes" &&
            old.ownerId !== user.id &&
            user.role !== "manager"
          )
            fail(
              403,
              "AUTHOR_REQUIRED",
              "Only the author or manager can edit this note.",
            );
        }
        if (op.action === "purge") {
          if (op.kind !== "emailDrafts") manager(user);
          if (op.data) fail(400, "INVALID_INPUT", "This action takes no data.");
          nextAux = nextAux.filter((r) => r.id !== op.id);
          removedAux.push(old);
        } else {
          if (
            !["create", "update"].includes(op.action) ||
            (op.action === "update" &&
              ["activity", "attachments"].includes(op.kind))
          )
            fail(400, "INVALID_ACTION", "This item is immutable.");
          const data = parse(supplements[op.kind], op.data);
          const row = {
            id: op.id,
            kind: op.kind,
            data,
            ownerId: old?.ownerId || user.id,
            version: (old?.version || 0) + 1,
            createdAt: old?.createdAt || Date.now(),
            updatedAt: Date.now(),
          };
          if (
            old &&
            (op.kind === "emailDrafts"
              ? old.data.opportunityId !== row.data.opportunityId
              : JSON.stringify(refs(old)) !== JSON.stringify(refs(row)))
          )
            fail(
              400,
              "INVALID_LINK",
              "Items cannot be moved between profiles.",
            );
          if (op.kind === "attachments") {
            const match = /^data:([^,;]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(
              data.data,
            );
            if (
              !match ||
              match[1] !== data.mime ||
              Buffer.from(match[2], "base64").toString("base64") !== match[2] ||
              Buffer.from(match[2], "base64").length !== data.size
            )
              fail(400, "INVALID_FILE", "Invalid file data.");
          }
          nextAux = nextAux.filter((r) => r.id !== op.id);
          nextAux.push(row);
          pendingAux.push(row);
        }
      }
    }
    if (graph.size > 10000 || nextAux.length > 20000)
      fail(503, "PROTOTYPE_CAPACITY", "Prototype capacity reached.");
    const purged = new Set(
      core.filter((x) => x.op.action === "purge").map((x) => x.op.id),
    );
    for (const { op, row } of core) {
      if (["create", "update", "restore"].includes(op.action)) {
        row.parents = validateLinks(graph, user, row.data, row.id, row.type);
        await validateAssignee(db, row.data);
        for (const a of row.data.actions || []) {
          await validateAssignee(db, a);
          if (a.taskId) {
            const task = graph.get(a.taskId);
            if (
              task?.type !== "Tasks" ||
              task.data.reportId !== row.id ||
              !visible(graph, user, task)
            )
              fail(400, "INVALID_LINK", "Linked action task is unavailable.");
          }
        }
        if (
          row.data.contactRoles &&
          Object.keys(row.data.contactRoles).some(
            (id) => !row.data.contactIds.includes(id),
          )
        )
          fail(
            400,
            "INVALID_LINK",
            "Contact roles must match linked contacts.",
          );
        if (row.type === "Meetings" && row.data.reportId) {
          const r = graph.get(row.data.reportId);
          if (
            r?.type !== "Reports" ||
            r.data.meetingId !== row.id ||
            !visible(graph, user, r)
          )
            fail(400, "INVALID_LINK", "Linked report is unavailable.");
        }
        if (row.type === "Reports" && row.data.complaintId) {
          const c = graph.get(row.data.complaintId);
          if (
            c?.type !== "Complaints" ||
            c.data.reportId !== row.id ||
            !visible(graph, user, c)
          )
            fail(400, "INVALID_LINK", "Linked complaint is unavailable.");
        }
      }
    }
    // Recheck the final graph: earlier items in a batch may link to later items.
    for (const { op, row } of core)
      if (["create", "update", "restore"].includes(op.action))
        row.parents = validateLinks(graph, user, row.data, row.id, row.type);
    for (const row of graph.values())
      if (row.parents.some((p) => purged.has(p)))
        fail(409, "LINKED_RECORDS", "Unlink or purge dependent records first.");
    for (const row of nextAux)
      if (
        refs(row).some((r) => purged.has(r.id)) &&
        !auxVisible(initial, user, row, true)
      )
        fail(409, "LINKED_RECORDS", "Unlink dependent items before purging.");
    nextAux = nextAux.filter((row) => !refs(row).some((r) => purged.has(r.id)));
    for (const row of pendingAux)
      if (!auxVisible(graph, user, row))
        fail(400, "INVALID_LINK", "A linked profile is unavailable.");
    if (
      nextAux
        .filter((r) => r.kind === "attachments")
        .reduce((n, r) => n + r.data.size, 0) > 3145728
    )
      fail(
        413,
        "FILE_CAPACITY",
        "This prototype allows 3 MB of attachments in total.",
      );
    const meetingReports = new Set();
    for (const row of graph.values())
      if (
        !row.deleted_at &&
        row.type === "Reports" &&
        row.data.reportType === "Meeting" &&
        row.data.meetingId &&
        row.data.status !== "Draft"
      ) {
        if (meetingReports.has(row.data.meetingId))
          fail(
            409,
            "DUPLICATE_REPORT",
            "This meeting already has a submitted report.",
          );
        meetingReports.add(row.data.meetingId);
      }
    // All validation precedes writes; links are inserted after every new parent.
    for (const { op, row } of core)
      if (op.action !== "purge") {
        if (op.action === "create")
          await db.query(
            "INSERT INTO crm_records(id,type,owner_id,visibility,data,version) VALUES($1,$2,$3,$4,$5::jsonb,$6)",
            [
              row.id,
              row.type,
              row.owner_id,
              row.visibility,
              JSON.stringify(row.data),
              row.version,
            ],
          );
        else
          await db.query(
            "UPDATE crm_records SET data=$2::jsonb,visibility=$3,version=$4,updated_at=NOW(),deleted_at=$5,deleted_by=$6 WHERE id=$1",
            [
              row.id,
              JSON.stringify(row.data),
              row.visibility,
              row.version,
              row.deleted_at,
              row.deleted_by,
            ],
          );
      }
    for (const { op, row } of core)
      if (op.action !== "purge") await setLinks(db, row.id, row.parents);
    for (const { op, row } of core)
      await audit(
        db,
        user,
        `record.${{ create: "created", update: "updated", trash: "trashed", restore: "restored", purge: "purged" }[op.action]}`,
        op.action === "purge" ? initial : graph,
        row,
      );
    if (purged.size) {
      await db.query("DELETE FROM crm_links WHERE child_id=ANY($1::uuid[])", [
        [...purged],
      ]);
      await db.query("DELETE FROM crm_records WHERE id=ANY($1::uuid[])", [
        [...purged],
      ]);
    }
    await db.query(
      "INSERT INTO crm_settings(key,value) VALUES('workspace-aux',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
      [JSON.stringify(nextAux)],
    );
    for (const row of pendingAux) {
      const r = graph.get(refs(row)[0].id);
      await audit(db, user, `${row.kind}.saved`, graph, {
        ...r,
        parents: [...r.parents, ...refs(row).map((ref) => ref.id)],
      });
    }
    for (const row of removedAux) {
      const r = initial.get(refs(row)[0].id);
      await audit(db, user, `${row.kind}.deleted`, initial, {
        ...r,
        parents: [...r.parents, ...refs(row).map((ref) => ref.id)],
      });
    }
    if (input.preferences) {
      const old = await loadPrefs(db, user),
        prior = old.workspace || {};
      if (input.preferences.version !== (prior.version || 0))
        fail(
          412,
          "EDIT_CONFLICT",
          "Preferences changed in another tab. Refresh first.",
        );
      if (JSON.stringify(input.preferences).length > 100000)
        fail(413, "BODY_TOO_LARGE", "Preferences are too large.");
      for (const v of input.preferences.views) {
        if (v.ownerId && v.ownerId !== user.id)
          fail(403, "OWNER_FORBIDDEN", "Views belong to your account.");
        if (
          typeof v.name !== "string" ||
          v.name.length > 100 ||
          !TYPES.includes(v.page)
        )
          fail(400, "INVALID_INPUT", "Invalid saved view.");
      }
      old.workspace = {
        version: (prior.version || 0) + 1,
        prefs: input.preferences.prefs,
        views: input.preferences.views,
      };
      await db.query(
        "INSERT INTO crm_preferences(user_id,data) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",
        [user.id, JSON.stringify(old)],
      );
    }
    await db.query("INSERT INTO crm_settings(key,value) VALUES($1,$2::jsonb)", [
      requestKey,
      JSON.stringify({ fingerprint }),
    ]);
    return {
      state: await view(db, user, await snapshot(db), nextAux),
      replayed: false,
    };
  });
}

export function mountWorkspace(app, { pool }) {
  app.get("/api/workspace", async (req, res) =>
    res.json({
      state: await transaction(pool, async (db) =>
        view(db, await trustedMember(db, req.crmUser.id)),
      ),
    }),
  );
  app.post("/api/workspace", async (req, res) => {
    const key = parse(z.uuid(), req.get("Idempotency-Key"));
    res.json(await writeWorkspace(pool, req.crmUser, req.body, key));
  });
  app.get("/api/workspace/export", async (req, res) => {
    manager(req.crmUser);
    res.json({
      state: await transaction(pool, async (db) =>
        view(db, await trustedMember(db, req.crmUser.id)),
      ),
    });
  });
}
