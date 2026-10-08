import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createPool } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { createAuth, authOptions } from '../src/auth.js';
import { migrate } from '../src/migrate.js';
import { bootstrapManager } from '../src/users.js';
import { createApp } from '../src/app.js';

let db, socket, pool, auth, appServer, base, config;
let gm, member, gm2, disposable, shared, privateContact, opportunity, meeting, report, task;
const password = randomBytes(24).toString('base64url');
const frontend = 'https://leenaaloufi.github.io';

async function call(path, {token, method = 'GET', body, version, key, origin = frontend} = {}) {
  const headers = {Origin: origin};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (version !== undefined) headers['If-Match'] = `"${version}"`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(base + path, {method, headers, ...(body !== undefined ? {body: JSON.stringify(body)} : {})});
  const text = await res.text();
  let data; try {data = JSON.parse(text);} catch {data = text;}
  return {status: res.status, data, headers: res.headers};
}
async function signIn(email, pass = password) {
  const res = await call('/api/auth/sign-in/email', {method: 'POST', body: {email, password: pass, rememberMe: false}});
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const token = res.headers.get('set-auth-token'); assert.ok(token?.includes('.'));
  const me = await call('/api/me', {token}); assert.equal(me.status, 200);
  return {token, user: me.data.user};
}
async function create(type, body, actor = gm, key = randomUUID()) {
  const res = await call(`/api/records/${type}`, {token: actor.token, method: 'POST', body, key});
  assert.equal(res.status, 201, JSON.stringify(res.data)); return res.data.record;
}
async function patch(type, record, body, actor = gm) {
  return call(`/api/records/${type}/${record.id}`, {token: actor.token, method: 'PATCH', body, version: record.version});
}

before(async () => {
  db = await PGlite.create();
  socket = new PGLiteSocketServer({db, port: 0, host: '127.0.0.1', maxConnections: 10});
  await socket.start();
  appServer = createServer();
  await new Promise(resolve => appServer.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${appServer.address().port}`;
  config = loadConfig({DATABASE_URL: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, BETTER_AUTH_URL: base,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), APP_ORIGINS: frontend,
    BOOTSTRAP_ADMIN_EMAIL: 'manager@example.test', BOOTSTRAP_ADMIN_NAME: 'Test Manager', BOOTSTRAP_ADMIN_PASSWORD: password});
  pool = createPool(config);
  await migrate(pool, {options: authOptions(config, pool)});
  auth = createAuth(config, pool); await bootstrapManager(pool, auth, config);
  appServer.on('request', createApp({config, pool, auth}));
  gm = await signIn('manager@example.test');
  for (const [email, name, role] of [['member@example.test','Test Member','member'],['manager2@example.test','Manager Two','manager'],['disable@example.test','Disable Me','member']]) {
    const res = await call('/api/users', {token: gm.token, method: 'POST', body: {email, name, role, password}});
    assert.equal(res.status, 201, JSON.stringify(res.data));
  }
  member = await signIn('member@example.test'); gm2 = await signIn('manager2@example.test'); disposable = await signIn('disable@example.test');
}, {timeout: 120000});

after(async () => {
  if (appServer) await new Promise(resolve => {appServer.close(resolve); appServer.closeAllConnections();});
  if (pool) await pool.end(); if (socket) await socket.stop(); if (db) await db.close();
});

test('first manager is created once; migration and restart preserve identities and passwords', async () => {
  assert.equal(gm.user.role, 'manager'); assert.equal(member.user.role, 'member');
  await migrate(pool, auth);
  await bootstrapManager(pool, auth, {...config, bootstrap: {...config.bootstrap, password: randomBytes(20).toString('hex')}});
  const count = await pool.query('SELECT COUNT(*)::int AS n FROM crm_members'); assert.equal(count.rows[0].n, 4);
  const hash = (await pool.query('SELECT password FROM account WHERE "userId"=$1', [gm.user.id])).rows[0].password;
  assert.ok(hash); assert.notEqual(hash, password); assert.ok(!hash.includes(password));
});

test('no anonymous CRM reads, invalid tokens, unsigned tokens or arbitrary origins', async () => {
  assert.equal((await call('/api/records/Contacts')).status, 401);
  assert.equal((await call('/api/me', {token: 'invalid.token'})).status, 401);
  assert.equal((await call('/api/me', {token: decodeURIComponent(gm.token).split('.')[0]})).status, 401);
  assert.equal((await call('/api/me', {token: gm.token, origin: 'https://attacker.example'})).status, 403);
  const pre = await call('/api/records/Contacts', {method: 'OPTIONS'});
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), frontend);
  const ok = await call('/api/me', {token: gm.token}); assert.equal(ok.headers.get('cache-control'), 'no-store');
});

test('public registration, role mutation and impersonation routes are closed', async () => {
  for (const path of ['/api/auth/sign-up/email','/api/auth/admin/create-user','/api/auth/admin/set-role','/api/auth/admin/impersonate-user']) {
    assert.equal((await call(path, {method: 'POST', body: {email: 'outsider@example.test', password, role: 'admin'}})).status, 404);
  }
  assert.equal((await call('/api/users', {token: member.token})).status, 403);
  assert.equal((await call('/api/users', {token: member.token, method: 'POST', body: {email: 'outsider@example.test', password, name: 'Outsider', role: 'manager'}})).status, 403);
});

test('shared contacts persist across independent authenticated clients; owner is stamped', async () => {
  shared = await create('Contacts', {name: 'Shared contact', company: 'Test Company', email: 'contact@example.test', phone: '+966500000000'}, member);
  assert.equal(shared.ownerId, member.user.id); assert.equal(shared.visibility, 'shared'); assert.equal(shared.version, 1);
  const got = await call(`/api/records/Contacts/${shared.id}`, {token: gm.token}); assert.equal(got.data.record.name, 'Shared contact');
  const forgery = await call('/api/records/Contacts', {token: member.token, method: 'POST', key: randomUUID(), body: {name: 'Forged', ownerId: gm.user.id, history: []}});
  assert.equal(forgery.status, 400);
});

test('members cannot create private records; only owning manager can see private data', async () => {
  assert.equal((await call('/api/records/Contacts', {token: member.token, method: 'POST', key: randomUUID(), body: {name: 'Private', visibility: 'private'}})).status, 403);
  privateContact = await create('Contacts', {name: 'Hidden Test Contact', visibility: 'private'});
  for (const actor of [member, gm2]) {
    assert.equal((await call(`/api/records/Contacts/${privateContact.id}`, {token: actor.token})).status, 404);
    const list = await call('/api/records/Contacts?query=Hidden', {token: actor.token}); assert.equal(list.data.total, 0);
    const stats = await call('/api/statistics', {token: actor.token}); assert.equal(stats.data.counts.Contacts, 1);
  }
  assert.equal((await patch('Contacts', shared, {visibility: 'private'}, gm)).status, 403);
  assert.equal((await patch('Contacts', shared, {visibility: 'private'}, member)).status, 403);
});

test('idempotent creation avoids duplicate saves, detects changed requests and rechecks access', async () => {
  const key = randomUUID(), body = {name: 'Retry Contact'};
  const first = await create('Contacts', body, gm, key);
  const replay = await call('/api/records/Contacts', {token: gm.token, method: 'POST', body, key});
  assert.equal(replay.status, 200); assert.equal(replay.data.record.id, first.id);
  assert.equal((await call('/api/records/Contacts', {token: gm.token, method: 'POST', body: {name: 'Different'}, key})).status, 409);
  const key2 = randomUUID(), record = await create('Contacts', {name: 'Made private later'}, member, key2);
  // Ownership is changed here only as a test fixture to check replay authorization.
  await pool.query("UPDATE crm_records SET owner_id=$2,visibility='private' WHERE id=$1", [record.id, gm.user.id]);
  assert.equal((await call('/api/records/Contacts', {token: member.token, method: 'POST', body: {name: 'Made private later'}, key: key2})).status, 404);
});

test('version checks stop stale edits and stamps survive user edits', async () => {
  assert.equal((await call(`/api/records/Contacts/${shared.id}`, {token: member.token, method: 'PATCH', body: {name: 'No version'}})).status, 428);
  const res = await patch('Contacts', shared, {name: 'Edited shared'}, gm); assert.equal(res.status, 200); assert.equal(res.data.record.version, 2);
  assert.equal(res.data.record.ownerId, member.user.id); assert.equal(res.data.record.createdAt, shared.createdAt);
  assert.equal((await patch('Contacts', shared, {name: 'Stale'}, member)).status, 412);
  shared = res.data.record;
});

test('private-parent permissions propagate through opportunities, meetings, reports and tasks', async () => {
  opportunity = await create('Opportunities', {name: 'Hidden Opportunity', contactIds: [privateContact.id], value: 500, status: 'Proposal'});
  meeting = await create('Meetings', {name: 'Hidden Meeting', opportunityId: opportunity.id, date: '2026-10-07', url: 'https://example.test/meeting'});
  report = await create('Reports', {name: 'Hidden Report', meetingId: meeting.id, reportType: 'Meeting'});
  task = await create('Tasks', {name: 'Hidden Task', meetingId: meeting.id, assigneeId: gm.user.id});
  for (const [type, record] of [['Opportunities', opportunity],['Meetings',meeting],['Reports',report],['Tasks',task]]) {
    for (const actor of [member, gm2]) {
      assert.equal((await call(`/api/records/${type}/${record.id}`, {token: actor.token})).status, 404);
      assert.equal((await call(`/api/records/${type}`, {token: actor.token})).data.total, 0);
    }
  }
  assert.equal((await call('/api/records/Reports', {token: member.token, method: 'POST', key: randomUUID(), body: {name: 'Invalid link', meetingId: meeting.id}})).status, 400);
  assert.equal((await patch('Contacts', privateContact, {opportunityId: opportunity.id})).status, 400);
  const events = await call('/api/activity', {token: member.token});
  assert.ok(events.data.events.every(e => ![opportunity.id,meeting.id,report.id,privateContact.id,task.id].includes(e.recordId)));
});

test('visibility changes immediately affect linked reads, counts, activity and exports', async () => {
  const res = await patch('Contacts', privateContact, {visibility: 'shared'}); assert.equal(res.status, 200); privateContact = res.data.record;
  assert.equal((await call(`/api/records/Reports/${report.id}`, {token: member.token})).status, 200);
  assert.equal((await call('/api/statistics', {token: member.token})).data.counts.Reports, 1);
  assert.equal((await call('/api/export/Reports', {token: gm2.token})).data.records.length, 1);
  const hidden = await patch('Contacts', privateContact, {visibility: 'private'}); privateContact = hidden.data.record;
  assert.equal((await call('/api/export/Reports', {token: gm2.token})).data.records.length, 0);
  assert.equal((await call('/api/export/Contacts', {token: member.token})).status, 403);
});

test('manager-only trash, restore, purge; deleted parent hides dependencies', async () => {
  assert.equal((await call(`/api/records/Contacts/${shared.id}/trash`, {token: member.token, method: 'POST', version: shared.version})).status, 403);
  assert.equal((await call('/api/trash', {token: member.token})).status, 403);
  const res = await call(`/api/records/Contacts/${privateContact.id}/trash`, {token: gm.token, method: 'POST', version: privateContact.version});
  assert.equal(res.status, 200); privateContact = res.data.record;
  assert.equal((await call(`/api/records/Reports/${report.id}`, {token: gm.token})).status, 404);
  assert.equal((await call('/api/trash', {token: gm2.token})).data.total, 0);
  assert.equal((await call(`/api/trash/Contacts/${privateContact.id}`, {token: gm.token, method: 'DELETE', version: privateContact.version})).status, 409);
  const restored = await call(`/api/trash/Contacts/${privateContact.id}/restore`, {token: gm.token, method: 'POST', version: privateContact.version});
  assert.equal(restored.status, 200); privateContact = restored.data.record;
  assert.equal((await call(`/api/records/Reports/${report.id}`, {token: gm.token})).status, 200);
  const trash = await call(`/api/records/Contacts/${shared.id}/trash`, {token: gm.token, method: 'POST', version: shared.version}); shared = trash.data.record;
  assert.equal((await call(`/api/records/Contacts/${shared.id}`, {token: member.token})).status, 404);
  assert.equal((await call(`/api/trash/Contacts/${shared.id}/restore`, {token: member.token, method: 'POST', version: shared.version})).status, 403);
  assert.equal((await call(`/api/trash/Contacts/${shared.id}`, {token: gm.token, method: 'DELETE', version: shared.version})).status, 204);
});

test('disabled account loses session access immediately; user preferences stay separate', async () => {
  assert.equal((await call(`/api/users/${gm.user.id}/access`, {token: gm.token, method: 'PATCH', body: {enabled: false}})).status, 400);
  assert.equal((await call(`/api/users/${disposable.user.id}/access`, {token: gm.token, method: 'PATCH', body: {enabled: false}})).status, 200);
  assert.equal((await call('/api/me', {token: disposable.token})).status, 401);
  assert.equal((await call('/api/preferences', {token: member.token, method: 'PUT', body: {locale: 'ar', notifications: true}})).status, 200);
  assert.equal((await call('/api/preferences', {token: member.token})).data.preferences.locale, 'ar');
  assert.deepEqual((await call('/api/preferences', {token: gm.token})).data.preferences, {});
});

test('strict validation, malicious stage keys, safe HTTPS links and private exports', async () => {
  assert.equal((await call('/api/records/Meetings', {token: member.token, method: 'POST', key: randomUUID(), body: {name: 'Unsafe', url: 'javascript:alert(1)'}})).status, 400);
  assert.equal((await call('/api/records/Contacts', {token: member.token, method: 'POST', key: randomUUID(), body: {name: 'Wrong email', email: 'invalid'}})).status, 400);
  assert.equal((await call('/api/records/Contacts?limit=99999', {token: gm.token})).status, 400);
  await create('Opportunities', {name: 'Prototype stage', status: '__proto__', value: 3}, member);
  assert.equal((await call('/api/statistics', {token: member.token})).data.pipeline.__proto__.value, 3);
  const exports = await call('/api/export/Contacts', {token: gm2.token});
  assert.ok(exports.data.records.every(r => r.id !== privateContact.id));
  assert.ok(!JSON.stringify(exports.data).includes('password'));
});

test('test panel signs in, saves and edits a contact, handles private data and resets on sign-out', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../public/panel.js', import.meta.url), 'utf8');
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {url: base, runScripts: 'outside-only', virtualConsole: vc});
  const {window} = dom, document = window.document;
  window.fetch = (path, options) => fetch(new URL(path, base), {...options, headers: {...options.headers, Origin: base}});
  window.confirm = () => true;
  Object.defineProperty(window.crypto, 'randomUUID', {value: randomUUID});
  window.eval(script);
  const until = async predicate => {
    const end = Date.now() + 5000;
    while (!predicate()) {if (Date.now() > end) throw new Error('Panel did not reach expected state: '+document.getElementById('message').textContent); await new Promise(resolve => setTimeout(resolve, 20));}
  };
  try {
    const login = document.getElementById('login-form'); login.elements.email.value = 'manager@example.test'; login.elements.password.value = password;
    login.dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
    await until(() => document.getElementById('message').textContent === 'تم تسجيل الدخول.');
    assert.equal(document.getElementById('workspace').hidden, false); assert.equal(document.getElementById('account-section').hidden, false);
    const form = document.getElementById('contact-form');
    form.elements.name.value = '<img src=x onerror=alert(1)>'; form.elements.company.value = 'Panel test'; form.elements.email.value = 'panel@example.test';
    form.elements.visibility.value = 'private'; form.dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
    await until(() => document.getElementById('contact-list').textContent.includes('<img src=x onerror=alert(1)>'));
    assert.equal(document.querySelectorAll('#contact-list img').length, 0);
    let saved = (await call('/api/records/Contacts?query=Panel', {token: gm.token})).data.records[0];
    assert.equal(saved.visibility, 'private'); assert.equal((await call(`/api/records/Contacts/${saved.id}`, {token: member.token})).status, 404);
    const row = [...document.querySelectorAll('#contact-list article')].find(r => r.textContent.includes('Panel test'));
    row.querySelector('button').click(); await until(() => document.getElementById('contact-form-title').textContent === 'تعديل الكونتاكت');
    await until(() => !form.querySelector('button').disabled);
    form.elements.name.value = 'Edited in panel'; form.dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true}));
    await until(() => document.getElementById('contact-list').textContent.includes('Edited in panel'));
    saved = (await call(`/api/records/Contacts/${saved.id}`, {token: gm.token})).data.record;
    assert.equal(saved.name, 'Edited in panel'); assert.equal(saved.version, 2);
    await until(() => !form.querySelector('button').disabled);
    document.getElementById('logout').click(); await until(() => document.getElementById('workspace').hidden);
    assert.equal(document.getElementById('contact-list').textContent, ''); assert.equal(window.localStorage.length, 0); assert.equal(window.sessionStorage.length, 0);
    assert.deepEqual(errors, []);
  } finally {dom.window.close();}
});

test('expired sessions cannot read or mutate CRM data', async () => {
  await pool.query('UPDATE session SET "expiresAt"=NOW()-INTERVAL \'1 minute\' WHERE "userId"=$1', [gm2.user.id]);
  assert.equal((await call('/api/me', {token: gm2.token})).status, 401);
  assert.equal((await call('/api/records/Contacts', {token: gm2.token, method: 'POST', key: randomUUID(), body: {name: 'Expired'}})).status, 401);
});

test('password change revokes other sessions and sign-out invalidates signed bearer', async () => {
  const other = await signIn('member@example.test');
  const newPassword = randomBytes(22).toString('hex');
  const changed = await call('/api/auth/change-password', {token: member.token, method: 'POST', body: {currentPassword: password, newPassword, revokeOtherSessions: true}});
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal((await call('/api/me', {token: other.token})).status, 401);
  const currentToken = changed.headers.get('set-auth-token') || member.token;
  assert.equal((await call('/api/auth/sign-out', {token: currentToken, method: 'POST', body: {}})).status, 200);
  assert.equal((await call('/api/me', {token: currentToken})).status, 401);
});
