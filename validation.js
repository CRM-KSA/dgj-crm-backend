import { z } from "zod";
import { fail } from "./errors.js";

export const TYPES = [
  "Contacts",
  "Opportunities",
  "Meetings",
  "Reports",
  "Complaints",
  "Tasks",
];
export const PRIVATE_TYPES = ["Contacts", "Opportunities"];
const text = (max = 250) => z.string().trim().max(max);
const date = z.union([z.literal(""), z.iso.date()]);
const identifier = z.uuid();
const link = z.union([z.literal(""), identifier]);
const url = z
  .string()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "https:" && !parsed.username && !parsed.password
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS URL.");
const common = {
  name: text().min(1),
  company: text(),
  status: text(100),
  notes: text(20000),
  contactIds: z.array(identifier).max(50),
  opportunityId: link,
  meetingId: link,
  visibility: z.enum(["shared", "private"]),
};
const fields = {
  Contacts: {
    email: z.union([z.literal(""), z.email().max(254)]),
    phone: text(80),
    jobTitle: text(),
    department: text(),
    alternatePhone: text(80),
    preferredChannel: text(100),
    location: text(),
    linkedIn: url,
    tags: text(1000),
    website: url,
  },
  Opportunities: {
    reference: text(),
    region: text(),
    service: text(),
    value: z.number().finite().min(0).max(1e12),
    startDate: date,
    targetDate: date,
    probability: z.number().min(0).max(100),
    website: url,
    scope: text(20000),
    opportunityType: text(),
    source: text(),
    closedDate: date,
    contactRoles: z.record(identifier, text(100)),
    linkedCompanies: z
      .array(
        z
          .object({
            id: identifier,
            name: text().min(1),
            relationship: text(100),
            notes: text(20000).optional(),
          })
          .strict(),
      )
      .max(50),
  },
  Meetings: {
    date,
    time: text(5).regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
    end: text(5).regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/),
    url,
    location: text(),
    reportRequired: z.boolean(),
    agenda: text(20000),
    meetingType: text(100),
    externalAttendees: text(2000),
    reportId: link,
  },
  Reports: {
    reportType: text(100),
    date,
    service: text(),
    details: text(20000),
    summary: text(20000),
    keyTakeaways: text(20000),
    decisions: text(20000),
    nextSteps: text(20000),
    category: text(),
    severity: text(100),
    actionRequired: text(20000),
    resolution: text(20000),
    source: text(),
    sentiment: text(100),
    feedback: text(20000),
    followUpRequired: z.boolean(),
    followUpDate: date,
    priority: text(100),
    complaintId: link,
    actions: z
      .array(
        z
          .object({
            id: identifier.optional(),
            name: text().min(1),
            date,
            assigneeId: text(128).min(1),
            taskId: identifier.optional(),
          })
          .strict(),
      )
      .max(50),
  },
  Complaints: {
    date,
    details: text(20000),
    severity: text(100),
    source: text(),
    category: text(),
    resolution: text(20000),
    overdue: z.boolean(),
    reportId: link,
    priority: text(100),
  },
  Tasks: {
    date,
    dueDate: date,
    priority: text(100),
    assigneeId: text(128),
    details: text(20000),
    completedAt: z.union([
      z.literal(""),
      z.iso.datetime({ offset: true }),
      z.number().int().min(0),
    ]),
    reportId: link,
  },
};

export const userInput = z
  .object({
    name: text(100).min(1),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(12).max(128),
    role: z.enum(["manager", "member"]).default("member"),
  })
  .strict();

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    fail(400, "INVALID_INPUT", "Check the fields and try again.");
  return result.data;
}
export const typeOf = (value) => {
  if (!TYPES.includes(value)) fail(400, "INVALID_TYPE", "Unknown record type.");
  return value;
};
export const uuid = (value) => parse(identifier, value);
export function recordInput(type, body, patch = false) {
  const schema = z
    .object({ ...common, ...fields[type] })
    .partial()
    .strict();
  const data = parse(patch ? schema : schema.required({ name: true }), body);
  if (!Object.keys(data).length) fail(400, "EMPTY_CHANGE", "Provide a change.");
  return data;
}
export function revision(req) {
  const header = req.get("If-Match");
  if (!header)
    fail(
      428,
      "VERSION_REQUIRED",
      "Reload the record and send its version in If-Match.",
    );
  if (!/^(?:"[1-9]\d*"|[1-9]\d*)$/.test(header))
    fail(400, "INVALID_VERSION", "Invalid If-Match version.");
  const version = Number(header.replaceAll('"', ""));
  if (!Number.isSafeInteger(version))
    fail(400, "INVALID_VERSION", "Invalid version.");
  return version;
}

export function listQuery(query) {
  return parse(
    z
      .object({
        scope: z.enum(["all", "my"]).default("all"),
        query: text(250).default(""),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).max(10000).default(0),
      })
      .strict(),
    query,
  );
}
