import { randomUUID, createHash } from 'node:crypto';
import { transaction } from './db.js';
import { fail, unavailable } from './errors.js';
import { PRIVATE_TYPES, TYPES } from './validation.js';

export async function trustedMember(db, id) {
  const { rows } = await db.query('SELECT m.user_id AS id,m.role,m.enabled,u.name,u.email FROM crm_members m JOIN "user" u ON u.id=m.user_id WHERE m.user_id=$1', [id]);
  if (!rows[0]?.enabled) fail(403, 'ACCOUNT_DISABLED', 'This account does not have CRM access.');
  return rows[0];
}
export function manager(user) {
  if (user.role !== 'manager') fail(403, 'MANAGER_REQUIRED', 'Only a manager can do this.');
}
export const profile = user => ({ id: user.id, name: user.name, email: user.email, role: user.role,
  initials: user.name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() });

export async function snapshot(db) {
  const { rows } = await db.query(`SELECT r.*,COALESCE((SELECT jsonb_agg(l.parent_id) FROM crm_links l WHERE l.child_id=r.id),'[]'::jsonb) AS parents FROM crm_records r ORDER BY r.updated_at DESC,r.id LIMIT 10001`);
  if (rows.length > 10000) fail(503, 'PROTOTYPE_CAPACITY', 'This prototype needs a storage query upgrade before adding more records.');
  return new Map(rows.map(row => [row.id, row]));
}
export function visible(graph, user, record, includeDeleted = false, path = new Set()) {
  if (!record || (!includeDeleted && record.deleted_at)) return false;
  if (record.visibility === 'private' && (user.role !== 'manager' || record.owner_id !== user.id)) return false;
  if (path.has(record.id) || path.size > 50) return false;
  const nextPath = new Set(path).add(record.id);
  return record.parents.every(id => visible(graph, user, graph.get(id), includeDeleted, nextPath));
}
export function authorized(graph, user, type, id, deleted = false) {
  const record = graph.get(id);
  if (record?.type !== type || (!!record.deleted_at !== deleted) || !visible(graph, user, record, deleted)) unavailable();
  return record;
}
export function asRecord(record) {
  const at = value => value ? new Date(value).getTime() : null;
  return { ...record.data, history: [], id: record.id, entityType: record.type, ownerId: record.owner_id,
    visibility: record.visibility, version: record.version, createdAt: at(record.created_at),
    updatedAt: at(record.updated_at), deletedAt: at(record.deleted_at), deletedBy: record.deleted_by };
}
function policy(graph, record, seen = new Set()) {
  if (!record || seen.has(record.id)) return [];
  seen.add(record.id);
  return [{id: record.id, ownerId: record.owner_id, visibility: record.visibility},
    ...record.parents.flatMap(id => policy(graph, graph.get(id), seen))];
}
export async function audit(db, actor, action, graph = new Map(), record = null) {
  await db.query('INSERT INTO crm_audit(id,actor_id,action,record_id,record_type,policy) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
    [randomUUID(), actor.id, action, record?.id || null, record?.type || null, JSON.stringify(policy(graph, record))]);
}

export function requestedLinks(data, type) {
  return [...(data.contactIds || []).map(id => ({id, type: 'Contacts'})),
    ...(data.opportunityId ? [{id: data.opportunityId, type: 'Opportunities'}] : []),
    ...(data.meetingId ? [{id: data.meetingId, type: 'Meetings'}] : []),
    ...(['Tasks','Complaints'].includes(type) && data.reportId ? [{id: data.reportId, type: 'Reports'}] : [])];
}
export function validateLinks(graph, user, data, id, type) {
  const refs = requestedLinks(data, type);
  for (const ref of refs) {
    const target = graph.get(ref.id);
    if (ref.id === id || target?.type !== ref.type || !visible(graph, user, target)) {
      fail(400, 'INVALID_LINK', 'A linked record is unavailable.');
    }
    const contains = (node, path = new Set()) => {
      if (!node) return false;
      if (node.id === id) return true;
      if (path.has(node.id) || path.size > 49) return true;
      const next = new Set(path).add(node.id);
      return node.parents.some(parent => contains(graph.get(parent), next));
    };
    if (contains(target)) fail(400, 'LINK_CYCLE', 'These links would create a cycle.');
  }
  return [...new Set(refs.map(ref => ref.id))];
}

export async function setLinks(db, id, parents) {
  await db.query('DELETE FROM crm_links WHERE child_id=$1', [id]);
  for (const parent of parents) await db.query('INSERT INTO crm_links(child_id,parent_id) VALUES($1,$2)', [id, parent]);
}
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
export function visibilityFor(user, type, input, old = null) {
  const next = input.visibility ?? old?.visibility ?? 'shared';
  if (next !== (old?.visibility ?? 'shared')) {
    if (user.role !== 'manager' || !PRIVATE_TYPES.includes(type) || (old && old.owner_id !== user.id)) {
      fail(403, 'VISIBILITY_FORBIDDEN', 'Only the owning manager can change visibility.');
    }
  }
  if (!PRIVATE_TYPES.includes(type) && next !== 'shared') fail(400, 'INVALID_VISIBILITY', 'This type inherits privacy from its links.');
  return next;
}
export async function validateAssignee(db, data) {
  if (!data.assigneeId) return;
  const { rows } = await db.query('SELECT user_id FROM crm_members WHERE user_id=$1 AND enabled=TRUE', [data.assigneeId]);
  if (!rows.length) fail(400, 'INVALID_ASSIGNEE', 'Choose an active team member.');
}
export function versionMatches(record, version) {
  if (record.version !== version) fail(412, 'EDIT_CONFLICT', 'Someone changed this record. Reload before saving.');
}

export async function createRecord(pool, actor, type, input, key) {
  return transaction(pool, async db => {
    const user = await trustedMember(db, actor.id);
    const graph = await snapshot(db);
    const fingerprint = createHash('sha256').update(JSON.stringify(stable({type, input}))).digest('hex');
    const oldRequest = (await db.query('SELECT * FROM crm_create_requests WHERE actor_id=$1 AND request_key=$2', [user.id, key])).rows[0];
    if (oldRequest) {
      if (oldRequest.fingerprint !== fingerprint) fail(409, 'REQUEST_KEY_REUSED', 'Use a new request key for a different record.');
      // Recheck CURRENT access; cached responses must never reveal newly private data.
      return {record: asRecord(authorized(graph, user, type, oldRequest.record_id)), replayed: true};
    }
    if (graph.size >= 10000) fail(503, 'PROTOTYPE_CAPACITY', 'Prototype record capacity reached.');
    const id = randomUUID();
    const visibility = visibilityFor(user, type, input);
    const {visibility: ignored, ...data} = input;
    data.contactIds ||= [];
    const parents = validateLinks(graph, user, data, id, type);
    await validateAssignee(db, data);
    const {rows: [row]} = await db.query('INSERT INTO crm_records(id,type,owner_id,visibility,data) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *',
      [id, type, user.id, visibility, JSON.stringify(data)]);
    await setLinks(db, id, parents);
    row.parents = parents; graph.set(id, row);
    await audit(db, user, 'record.created', graph, row);
    await db.query('INSERT INTO crm_create_requests(actor_id,request_key,fingerprint,record_id) VALUES($1,$2,$3,$4)', [user.id, key, fingerprint, id]);
    return {record: asRecord(row), replayed: false};
  });
}

export async function updateRecord(pool, actor, type, id, input, version) {
  return transaction(pool, async db => {
    const user = await trustedMember(db, actor.id);
    const graph = await snapshot(db);
    const old = authorized(graph, user, type, id);
    versionMatches(old, version);
    const visibility = visibilityFor(user, type, input, old);
    const {visibility: ignored, ...change} = input;
    const data = {...old.data, ...change};
    const parents = validateLinks(graph, user, data, id, type);
    await validateAssignee(db, data);
    const {rows: [row]} = await db.query('UPDATE crm_records SET data=$2::jsonb,visibility=$3,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *', [id, JSON.stringify(data), visibility]);
    await setLinks(db, id, parents);
    row.parents = parents; graph.set(id, row);
    await audit(db, user, 'record.updated', graph, row);
    return asRecord(row);
  });
}

export async function trashAction(pool, actor, type, id, version, action) {
  return transaction(pool, async db => {
    const user = await trustedMember(db, actor.id); manager(user);
    const graph = await snapshot(db);
    const old = authorized(graph, user, type, id, action !== 'trash');
    versionMatches(old, version);
    if (action === 'purge') {
      const linked = (await db.query('SELECT 1 FROM crm_links WHERE parent_id=$1 LIMIT 1', [id])).rowCount;
      if (linked) fail(409, 'LINKED_RECORDS', 'Unlink or purge dependent records first.');
      await audit(db, user, 'record.purged', graph, old);
      await db.query('DELETE FROM crm_records WHERE id=$1', [id]);
      return null;
    }
    if (action === 'restore' && old.parents.some(parent => !visible(graph, user, graph.get(parent)))) {
      fail(409, 'PARENT_UNAVAILABLE', 'Restore linked parent records first.');
    }
    const {rows: [row]} = await db.query(`UPDATE crm_records SET deleted_at=${action === 'trash' ? 'NOW()' : 'NULL'},deleted_by=$2,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`, [id, action === 'trash' ? user.id : null]);
    row.parents = old.parents; graph.set(id, row);
    await audit(db, user, action === 'trash' ? 'record.trashed' : 'record.restored', graph, row);
    return asRecord(row);
  });
}

export function filtered(graph, user, type, query, trash = false) {
  const term = query.query.toLowerCase();
  return [...graph.values()].filter(record => (!type || record.type === type) && (!!record.deleted_at === trash)
    && visible(graph, user, record, trash) && (query.scope !== 'my' || record.owner_id === user.id)
    && (!term || [record.data.name, record.data.company, record.data.email, record.data.status].some(value => String(value || '').toLowerCase().includes(term))));
}
export function statistics(graph, user) {
  const counts = Object.fromEntries(TYPES.map(type => [type, 0]));
  const pipeline = Object.create(null);
  for (const record of graph.values()) if (!record.deleted_at && visible(graph, user, record)) {
    counts[record.type]++;
    if (record.type === 'Opportunities') {
      const stage = record.data.status || 'Unspecified';
      pipeline[stage] ||= {count: 0, value: 0};
      pipeline[stage].count++; pipeline[stage].value += record.data.value || 0;
    }
  }
  return {counts, pipeline};
}
