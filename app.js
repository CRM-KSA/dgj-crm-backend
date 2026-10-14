import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { HttpError, fail } from "./errors.js";
import { transaction } from "./db.js";
import {
  typeOf,
  uuid,
  parse,
  recordInput,
  revision,
  listQuery,
  userInput,
} from "./validation.js";
import {
  trustedMember,
  profile,
  manager,
  snapshot,
  visible,
  authorized,
  asRecord,
  createRecord,
  updateRecord,
  trashAction,
  filtered,
  statistics,
} from "./records.js";
import { createMember, setEnabled, setRole } from "./users.js";
import { mountWorkspace } from "./workspace-api.js";

const release = "dgj-manager-feedback-20261014-r1";

function publicRecord(row,graph,user){
 const out=asRecord(row);out.contactIds=(out.contactIds || []).filter(id=>visible(graph,user,graph.get(id)));
 if(out.contactRoles)out.contactRoles=Object.fromEntries(Object.entries(out.contactRoles).filter(([id])=>out.contactIds.includes(id)));
 return out;
}
export function createApp({ config, pool, auth }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.proxyHops);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.get("/health", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", release, workspaceApi: true });
    } catch {
      res.status(503).json({ status: "unavailable", release });
    }
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const origin = req.get("Origin");
    if (origin && !config.origins.includes(origin))
      return next(
        new HttpError(403, "ORIGIN_FORBIDDEN", "Origin not allowed."),
      );
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method) && !origin)
      return next(
        new HttpError(
          403,
          "ORIGIN_REQUIRED",
          "An allowed Origin header is required.",
        ),
      );
    next();
  });
  app.use(
    "/api",
    cors({
      origin: config.origins,
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "If-Match",
        "Idempotency-Key",
      ],
      exposedHeaders: ["set-auth-token", "ETag"],
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: { code: "RATE_LIMITED", message: "Please try again shortly." },
      },
    }),
  );
  // Use an explicit allowlist: no public sign-up, admin, impersonation, or role endpoints.
  const authRoutes = new Set([
    "POST /sign-in/email",
    "POST /sign-out",
    "GET /get-session",
    "POST /change-password",
  ]);
  app.use("/api/auth", (req, res, next) => {
    // Overwrite the private header using Express's configured proxy trust. A
    // caller cannot choose the address Better Auth uses for login throttling.
    req.headers["x-dgj-client-ip"] = req.ip;
    if (!authRoutes.has(`${req.method} ${req.path}`))
      return res
        .status(404)
        .json({
          error: { code: "NOT_FOUND", message: "Route not available." },
        });
    if (req.method === "POST" && !req.is("application/json"))
      return next(new HttpError(415, "JSON_REQUIRED", "Use application/json."));
    next();
  });
  // Auth reads the incoming request stream: mount before express.json().
  app.all("/api/auth/*splat", toNodeHandler(auth));
  app.use("/api", async (req, res, next) => {
    try {
      if (!/^Bearer\s+\S+$/i.test(req.get("Authorization") || ""))
        fail(401, "LOGIN_REQUIRED", "Sign in to continue.");
      const headers = fromNodeHeaders(req.headers);
      headers.delete("cookie"); // Never fall back to a cookie if a bearer token is invalid.
      const session = await auth.api.getSession({ headers });
      if (!session)
        fail(401, "LOGIN_REQUIRED", "Your session ended. Sign in again.");
      req.crmUser = await trustedMember(pool, session.user.id);
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use("/api/workspace", express.json({ limit: "6mb" }));
  app.use("/api", express.json({ limit: "256kb" }));
  // Auth password/sign-out routes run earlier. Visitors may save only personal view preferences.
  app.use("/api", (req, res, next) => {
    if (req.crmUser.role === "visitor" && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
        && !(req.method === "PUT" && req.path === "/preferences")
        && !(req.method === "POST" && req.path === "/workspace")) {
      return next(new HttpError(403, "READ_ONLY", "Visitor accounts can view records only."));
    }
    next();
  });
  mountWorkspace(app, { pool });
  app.get("/api/me", (req, res) => res.json({ user: profile(req.crmUser) }));
  app.get("/api/team", async (req, res) => {
    const { rows } = await pool.query(
      'SELECT m.user_id AS id,u.name,u.email,m.role FROM crm_members m JOIN "user" u ON u.id=m.user_id WHERE m.enabled=TRUE ORDER BY u.name',
    );
    res.json({ users: rows });
  });
  app.get("/api/users", async (req, res) => {
    manager(req.crmUser);
    const { rows } = await pool.query(
      'SELECT m.user_id AS id,u.name,u.email,m.role,m.enabled FROM crm_members m JOIN "user" u ON u.id=m.user_id ORDER BY m.created_at',
    );
    res.json({ users: rows });
  });
  app.post("/api/users", async (req, res) => {
    manager(req.crmUser);
    const user = await createMember(
      pool,
      auth,
      req.crmUser,
      parse(userInput, req.body),
    );
    res.status(201).json({ user });
  });
  app.patch("/api/users/:id/access", async (req, res) => {
    manager(req.crmUser);
    const { enabled } = parse(
      z.object({ enabled: z.boolean() }).strict(),
      req.body,
    );
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(req.params.id))
      fail(400, "INVALID_ID", "Invalid user ID.");
    res.json(await setEnabled(pool, req.crmUser, req.params.id, enabled));
  });
  app.patch("/api/users/:id/role", async (req, res) => {
    manager(req.crmUser);
    const {role} = parse(z.object({role: z.enum(["admin", "manager", "member", "visitor"])}).strict(), req.body);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(req.params.id)) fail(400, "INVALID_ID", "Invalid user ID.");
    res.json(await setRole(pool, req.crmUser, req.params.id, role));
  });
  app.get("/api/records/:type", async (req, res) => {
    const type = typeOf(req.params.type),
      query = listQuery(req.query);
    const rows = filtered(await snapshot(pool), req.crmUser, type, query);
    const graph=await snapshot(pool);
    res.json({
      records: rows
        .slice(query.offset, query.offset + query.limit)
        .map(r=>publicRecord(r,graph,req.crmUser)),
      total: rows.length,
    });
  });
  app.get("/api/records/:type/:id", async (req, res) => {
    const row = authorized(
      await snapshot(pool),
      req.crmUser,
      typeOf(req.params.type),
      uuid(req.params.id),
    );
    res.set("ETag", `"${row.version}"`).json({ record: publicRecord(row,await snapshot(pool),req.crmUser) });
  });
  app.post("/api/records/:type", async (req, res) => {
    const type = typeOf(req.params.type);
    const key = req.get("Idempotency-Key");
    if (!key)
      fail(
        400,
        "REQUEST_KEY_REQUIRED",
        "Send a UUID Idempotency-Key for safe retries.",
      );
    const result = await createRecord(
      pool,
      req.crmUser,
      type,
      recordInput(type, req.body),
      uuid(key),
    );
    res
      .set("ETag", `"${result.record.version}"`)
      .status(result.replayed ? 200 : 201)
      .json(result);
  });
  app.patch("/api/records/:type/:id", async (req, res) => {
    const type = typeOf(req.params.type);
    const record = await updateRecord(
      pool,
      req.crmUser,
      type,
      uuid(req.params.id),
      recordInput(type, req.body, true),
      revision(req),
    );
    res.set("ETag", `"${record.version}"`).json({ record });
  });
  app.post("/api/records/:type/:id/trash", async (req, res) => {
    manager(req.crmUser);
    const record = await trashAction(
      pool,
      req.crmUser,
      typeOf(req.params.type),
      uuid(req.params.id),
      revision(req),
      "trash",
    );
    res.json({ record });
  });
  app.get("/api/trash", async (req, res) => {
    manager(req.crmUser);
    const query = listQuery(req.query),
      rows = filtered(await snapshot(pool), req.crmUser, null, query, true);
    const graph=await snapshot(pool);
    res.json({
      records: rows
        .slice(query.offset, query.offset + query.limit)
        .map(r=>publicRecord(r,graph,req.crmUser)),
      total: rows.length,
    });
  });
  app.post("/api/trash/:type/:id/restore", async (req, res) => {
    manager(req.crmUser);
    res.json({
      record: await trashAction(
        pool,
        req.crmUser,
        typeOf(req.params.type),
        uuid(req.params.id),
        revision(req),
        "restore",
      ),
    });
  });
  app.delete("/api/trash/:type/:id", async (req, res) => {
    manager(req.crmUser);
    await trashAction(
      pool,
      req.crmUser,
      typeOf(req.params.type),
      uuid(req.params.id),
      revision(req),
      "purge",
    );
    res.status(204).end();
  });
  app.get("/api/export/:type", async (req, res) => {
    manager(req.crmUser);
    const type = typeOf(req.params.type),
      query = listQuery(req.query);
    const records = filtered(
      await snapshot(pool),
      req.crmUser,
      type,
      query,
    ).map(asRecord);
    res
      .attachment(`DGJ-${type}.json`)
      .json({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        type,
        records,
      });
  });
  app.get("/api/statistics", async (req, res) =>
    res.json(statistics(await snapshot(pool), req.crmUser)),
  );
  app.get("/api/activity", async (req, res) => {
    const query = listQuery(req.query),
      graph = await snapshot(pool),
      user = req.crmUser;
    const { rows } = await pool.query(
      "SELECT * FROM crm_audit ORDER BY created_at DESC,id DESC LIMIT 1000",
    );
    const events = rows
      .filter((event) => {
        if (
          (!['admin','manager'].includes(user.role) || query.scope === "my") &&
          event.actor_id !== user.id
        )
          return false;
        if (
          event.policy.some(
            (p) =>
              p.visibility === "private" &&
              (user.role !== 'admin' && p.ownerId !== user.id && p.assigneeId !== user.id),
          )
        )
          return false;
        const current = graph.get(event.record_id);
        if (current && !visible(graph, user, current)) return false;
        return true;
      })
      .map((event) => ({
        id: event.id,
        actorId: event.actor_id,
        action: event.action,
        recordId: event.record_id,
        recordType: event.record_type,
        time: new Date(event.created_at).getTime(),
      }));
    res.json({
      events: events.slice(query.offset, query.offset + query.limit),
      total: events.length,
    });
  });
  app.get('/api/logs', async (req,res)=>{
    const user=req.crmUser;manager(user);
    const query=listQuery(req.query),graph=await snapshot(pool);
    const {rows}=await pool.query(`SELECT e.*,a.actor_id,a.policy,a.created_at AS occurred_at,u.name AS actor_name
      FROM crm_admin_emails e JOIN crm_audit a ON e.event_key='admin:'||a.id::text
      LEFT JOIN "user" u ON u.id=a.actor_id ORDER BY e.id DESC`);
    const permitted=rows.filter(e=>{
      const assignedSnapshot=e.policy[0]?.visibility==='private' && e.policy[0]?.assigneeId===user.id;
      if(user.role!=='admin' && !assignedSnapshot && e.policy.some(p=>p.visibility==='private' && p.ownerId!==user.id && p.assigneeId!==user.id))return false;
      const current=graph.get(e.record_data.id);
      if(current && !visible(graph,user,current,true))return false;
      if(query.scope==='my' && e.actor_id!==user.id)return false;
      return [e.kind,e.record_data.type,e.record_data.data.name,e.actor_name,e.status].join(' ').toLowerCase().includes(query.query.toLowerCase());
    });
    res.json({total:permitted.length,logs:permitted.slice(query.offset,query.offset+query.limit).map(e=>({
      id:e.id,eventId:e.event_key,action:e.kind,recordId:e.record_data.id,recordType:e.record_data.type,
      recordTitle:e.record_data.data.name,actorId:e.actor_id,actorName:e.actor_name,
      time:new Date(e.occurred_at).getTime(),emailTo:'crm-ksa@dgjones.com',emailStatus:e.status,
      acceptedAt:e.accepted_at?new Date(e.accepted_at).getTime():null
    }))});
  });
  app.get("/api/preferences", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT data FROM crm_preferences WHERE user_id=$1",
      [req.crmUser.id],
    );
    res.json({ preferences: rows[0]?.data || {} });
  });
  app.put("/api/preferences", async (req, res) => {
    const input = parse(
      z
        .object({
          locale: z.enum(["en", "ar"]).optional(),
          notifications: z.boolean().optional(),
          savedViews: z
            .array(
              z
                .object({
                  id: z.uuid(),
                  name: z.string().max(100),
                  type: z.enum([
                    "Contacts",
                    "Opportunities",
                    "Meetings",
                    "Reports",
                    "Complaints",
                    "Tasks",
                  ]),
                  query: z.string().max(250),
                  scope: z.enum(["all", "my"]),
                })
                .strict(),
            )
            .max(25)
            .optional(),
        })
        .strict(),
      req.body,
    );
    await transaction(pool, async (db) => {
      await trustedMember(db, req.crmUser.id);
      const { rows } = await db.query(
        "SELECT data FROM crm_preferences WHERE user_id=$1",
        [req.crmUser.id],
      );
      const workspace = rows[0]?.data?.workspace;
      const data = { ...input, ...(workspace ? { workspace } : {}) };
      await db.query(
        "INSERT INTO crm_preferences(user_id,data) VALUES($1,$2::jsonb) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",
        [req.crmUser.id, JSON.stringify(data)],
      );
    });
    res.json({ preferences: input });
  });
  app.use("/api", (req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Route not available." } }),
  );
  app.use(
    express.static(fileURLToPath(new URL("../public", import.meta.url)), {
      index: "index.html",
      dotfiles: "deny",
    }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof HttpError)
      return res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message } });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({
          error: { code: "BODY_TOO_LARGE", message: "Request too large." },
        });
    if (error instanceof SyntaxError && "body" in error)
      return res
        .status(400)
        .json({ error: { code: "INVALID_JSON", message: "Invalid JSON." } });
    // Log only category; database errors may include SQL parameters or private data.
    console.error("Request failed:", error.constructor?.name || "Error");
    res
      .status(500)
      .json({
        error: {
          code: "SERVER_ERROR",
          message: "Unable to complete this request. Try again.",
        },
      });
  });
  return app;
}
