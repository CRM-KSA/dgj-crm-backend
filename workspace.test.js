import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
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

const op=(kind,data,id=randomUUID(),version=0,action='create')=>({kind,id,version,action,...(data?{data}:{})});
async function ws(operations,actor=gm,key=randomUUID(),preferences){return call('/api/workspace',{token:actor.token,method:'POST',key,body:{operations,...(preferences?{preferences}:{})}});}
let ids={};
test('published single-file frontend has valid hashes for every inline script and no missing assets',async()=>{
  const html=await readFile(new URL('../../DGJ-CRM-connected/dist/index.html',import.meta.url),'utf8');const dom=new JSDOM(html);
  try{
    const doc=dom.window.document,csp=doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content;assert.equal(doc.scripts.length,6);
    for(const script of doc.scripts){assert.ok(!script.src);assert.ok(csp.includes("'sha256-"+createHash('sha256').update(script.textContent).digest('base64')+"'"));}
    assert.equal(doc.querySelectorAll('link[rel="stylesheet"]').length,0);for(const img of doc.images)assert.ok(img.src.startsWith('data:'));
    assert.ok(csp.includes('connect-src https://dgj-crm-backend-production.up.railway.app;'));
  }finally{dom.window.close();}
});
test('atomic workspace saves linked report, meeting and tasks; invalid batch rolls back and retry is idempotent',async()=>{
  ids={contact:randomUUID(),opportunity:randomUUID(),meeting:randomUUID(),report:randomUUID(),task:randomUUID()};
  const operations=[op('Contacts',{name:'Workspace contact',company:'Company'},ids.contact),op('Opportunities',{name:'Workspace opportunity',contactIds:[ids.contact],status:'Proposal',startDate:'2026-10-01'},ids.opportunity),op('Meetings',{name:'Workspace meeting',opportunityId:ids.opportunity,date:'2026-10-07',time:'10:00',end:'11:00',status:'Completed',reportId:ids.report},ids.meeting),op('Reports',{name:'Meeting report',reportType:'Meeting',status:'Completed',meetingId:ids.meeting,opportunityId:ids.opportunity,actions:[{name:'Follow up',date:'2026-10-08',assigneeId:member.user.id,taskId:ids.task}]},ids.report),op('Tasks',{name:'Follow up',reportId:ids.report,assigneeId:member.user.id,date:'2026-10-08'},ids.task)];
  const key=randomUUID(),saved=await ws(operations,gm,key);assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.equal(saved.data.state.Tasks.find(t=>t.id===ids.task).ownerId,gm.user.id);
  assert.equal((await ws(operations,gm,key)).data.replayed,true);
  assert.equal((await ws([op('Contacts',{name:'Different'})],gm,key)).status,409);
  const invalidID=randomUUID();const result=await ws([op('Contacts',{name:'Must not persist'},invalidID),op('Tasks',{name:'Invalid task',reportId:randomUUID()})]);assert.equal(result.status,400);
  assert.equal((await call('/api/records/Contacts/'+invalidID,{token:gm.token})).status,404);
  const duplicate=await ws([op('Reports',{name:'Duplicate',reportType:'Meeting',status:'Completed',meetingId:ids.meeting})]);assert.equal(duplicate.status,409);
});

test('supplement privacy, author restrictions, file validation and personal views are enforced on server',async()=>{
  const privateID=randomUUID(),noteID=randomUUID(),fileID=randomUUID(),eventID=randomUUID();
  let result=await ws([op('Contacts',{name:'Private workspace contact',visibility:'private'},privateID),op('notes',{recordType:'Contacts',recordId:privateID,title:'Private note',body:'Confidential note'},noteID),op('attachments',{recordType:'Contacts',recordId:privateID,name:'text.txt',mime:'text/plain',size:5,data:'data:text/plain;base64,aGVsbG8='},fileID),op('activity',{recordType:'Contacts',recordId:privateID,kind:'interaction',text:'Call',subject:'Call',body:'Confidential conversation',channel:'Phone',outcome:'Recorded',contactIds:[privateID],opportunityId:'',occurredAt:Date.now()},eventID)]);
  assert.equal(result.status,200,JSON.stringify(result.data));
  for(const actor of [member,gm2]){const view=await call('/api/workspace',{token:actor.token});const text=JSON.stringify(view.data);assert.ok(!text.includes(privateID));assert.ok(!text.includes('Confidential'));}
  assert.equal((await ws([op('notes',{recordType:'Contacts',recordId:privateID,title:'Hidden',body:'Not allowed'})],member)).status,400);
  result=await ws([op('Contacts',{visibility:'shared'},privateID,1,'update')]);assert.equal(result.status,200);
  const memberState=(await call('/api/workspace',{token:member.token})).data.state;assert.ok(memberState.notes.some(n=>n.id===noteID));
  assert.equal((await ws([op('notes',{recordType:'Contacts',recordId:privateID,title:'Overwrite',body:'No'},noteID,1,'update')],member)).status,403);
  assert.equal((await ws([op('attachments',{recordType:'Contacts',recordId:privateID,name:'bad.txt',mime:'text/plain',size:100,data:'data:text/plain;base64,aGVsbG8='})])).status,400);
  assert.equal((await ws([op('Contacts',{ownerId:member.user.id,name:'Forged'})])).status,400);
  result=await ws([],member,randomUUID(),{version:0,prefs:{columns_Contacts:['phone']},views:[{id:randomUUID(),name:'My view',page:'Contacts',ownerId:member.user.id}]});assert.equal(result.status,200);
  assert.equal((await call('/api/workspace',{token:gm.token})).data.state.savedViews.length,0);
  assert.equal((await ws([],member,randomUUID(),{version:0,prefs:{},views:[]})).status,412);
  assert.equal((await call('/api/workspace/export',{token:member.token})).status,403);
});

async function until(check){for(let i=0;i<200;i++){if(await check())return;await new Promise(r=>setTimeout(r,15));}throw Error('Timed out waiting for frontend.');}
async function site(email){
  // Each scenario starts a fresh fixture login window; deployed throttling stays enabled.
  await pool.query('DELETE FROM "rateLimit"');
  const html=await readFile(new URL('../../DGJ-CRM-connected/dist/index.html',import.meta.url),'utf8');
  const errors=[];let drop=false;const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:frontend+'/dgj-crm/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,beforeParse(w){w.DGJ_CONFIG={apiBase:base};w.structuredClone=structuredClone;w.crypto.randomUUID=randomUUID;w.scrollTo=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
    w.fetch=async(url,options={})=>{const response=await fetch(url,{...options,headers:{...options.headers,Origin:frontend}});if(drop&&options.method==='POST'&&url.endsWith('/api/workspace')){drop=false;throw Error('Response lost after commit.');}return response;};}});
  assert.equal(dom.window.document.getElementById('main').innerHTML,'');assert.equal(dom.window.DGJSession.ready,false);
  const f=dom.window.document.getElementById('login-form');f.elements.email.value=email;f.elements.password.value=password;f.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>dom.window.DGJSession.ready||dom.window.document.getElementById('login-error').textContent);
  if(!dom.window.DGJSession.ready){const error=dom.window.document.getElementById('login-error').textContent;dom.window.close();assert.fail(error);}
  assert.equal(f.elements.password.value,'');assert.equal(dom.window.localStorage.length,0);assert.equal(dom.window.sessionStorage.length,0);
  return {dom,errors,dropNext:()=>{drop=true;}};
}

test('original CRM signs in, saves all entity types, persists career history, notes and views through the real API',async()=>{
  const {dom,errors}=await site('manager@example.test'),w=dom.window;
  try{
    const c=await w.saveEntity('Contacts',null,{name:'UI contact <img src=x onerror=alert(1)>',company:'Old company',jobTitle:'Old role',email:'ui@example.test',status:'Active'});assert.ok(c?.version===1, w.document.getElementById('toast').textContent);
    const edited=await w.saveEntity('Contacts',c.id,{name:c.name,company:'New company',jobTitle:'New role'});assert.ok(edited?.version===2);assert.equal(w.eval('db.employmentHistory').filter(h=>h.contactId===c.id).length,1);
    const o=await w.saveEntity('Opportunities',null,{name:'UI opportunity',company:'New company',contactIds:[c.id],contactRoles:{[c.id]:'Decision Maker'},linkedCompanies:[{id:randomUUID(),name:'Consultant',relationship:'Consultant',notes:'Related company'}],status:'Proposal',value:1000,startDate:'2026-10-01',probability:50});assert.ok(o);
    const m=await w.saveEntity('Meetings',null,{name:'UI meeting',company:'Teams',date:'2026-10-07',time:'10:00',end:'11:00',reportRequired:true,meetingType:'Opportunity',externalAttendees:'Client',contactIds:[c.id],opportunityId:o.id});assert.ok(m);
    const r=await w.saveEntity('Reports',null,{name:'UI report',company:'New company',reportType:'Meeting',status:'Completed',date:'2026-10-07',summary:'Discussion',details:'',meetingId:m.id,opportunityId:o.id,followUpDate:'2026-10-08',actions:[]});assert.ok(r);
    assert.ok(await w.saveEntity('Tasks',null,{name:'UI task',date:'2026-10-08',status:'Open',assigneeId:member.user.id,reportId:r.id}));
    assert.ok(await w.saveEntity('Complaints',null,{name:'UI complaint',status:'Open',date:'2026-10-07',notes:'Concern',priority:'High',opportunityId:o.id}));
    w.profileFor('Contacts',c.id);w.noteForm('Contacts',c.id);const f=w.document.getElementById('note-form');f.elements.title.value='UI note';f.elements.body.value='Saved in database';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!w.document.getElementById('modal').open);assert.ok(w.eval('db.notes').some(n=>n.body==='Saved in database'));
    w.attachmentForm('Contacts',c.id);const fileInput=w.document.getElementById('attachment-file');Object.defineProperty(fileInput,'files',{value:[new w.File(['hello'],'UI-file.txt',{type:'text/plain'})]});w.document.getElementById('ui-upload-file').click();await until(()=>!w.document.getElementById('modal').open);assert.ok(w.eval('db.attachments').some(a=>a.name==='UI-file.txt'));
    assert.ok(await w.setPreference('columns_Contacts',['phone']));w.go('Contacts');assert.equal(w.document.querySelector('#main img[src="x"]'),null);
    const fresh=(await call('/api/workspace',{token:gm.token})).data.state;assert.ok(fresh.Contacts.some(x=>x.id===c.id));assert.ok(fresh.notes.some(x=>x.body==='Saved in database'));assert.deepEqual(fresh.preferences[gm.user.id].columns_Contacts,['phone']);
    for(const page of ['Home','Contacts','Opportunities','Meetings','Tasks','Reports','Trash','Settings']){w.go(page);assert.ok(w.document.getElementById('main').textContent.length>0,page);}
    assert.equal(errors.length,0,errors.join('\n'));
    await w.eval("DGJConnection").signOut();assert.equal(w.DGJSession.token,null);assert.equal(w.eval('db.Contacts.length'),0);assert.equal(w.document.getElementById('main').textContent,'');assert.equal(w.eval('reportFlow'),null);assert.equal(w.document.getElementById('modal').textContent,'');
  }finally{w.close();}
});

test('network loss never shows a successful save; retry cannot duplicate; stale edits require an explicit refresh',async()=>{
  const {dom,dropNext,errors}=await site('manager@example.test'),w=dom.window;
  try{
    dropNext();const result=await w.saveEntity('Contacts',null,{name:'Response-loss contact',company:'Company'});assert.equal(result,null);assert.ok(w.DGJSession.pending);assert.ok(!w.eval('db.Contacts').some(c=>c.name==='Response-loss contact'));
    const pendingKey=w.DGJSession.pending.key;w.document.getElementById('sync-status').click();assert.equal(w.DGJSession.pending.key,pendingKey);
    w.document.querySelector('[data-retry-save]').click();await until(()=>!w.DGJSession.pending&&!w.DGJSession.writing);
    let record=w.eval('db.Contacts').find(c=>c.name==='Response-loss contact');assert.ok(record);
    assert.equal((await call('/api/workspace',{token:gm.token})).data.state.Contacts.filter(c=>c.name==='Response-loss contact').length,1);
    const other=await ws([op('Contacts',{name:'Updated elsewhere'},record.id,record.version,'update')],member);assert.equal(other.status,200);
    assert.equal(await w.saveEntity('Contacts',record.id,{name:'Stale overwrite'}),null);
    assert.ok(w.document.getElementById('connection-alert').textContent.includes('Another person'));
    assert.equal((await call('/api/records/Contacts/'+record.id,{token:gm.token})).data.record.name,'Updated elsewhere');
    await w.eval("DGJConnection").refresh();assert.equal(w.eval('db.Contacts').find(c=>c.id===record.id).name,'Updated elsewhere');assert.equal(errors.length,0,errors.join('\n'));
  }finally{w.close();}
});

test('report wizard submits meeting actions and complaints as one transaction',async()=>{
  const {dom,errors}=await site('manager@example.test'),w=dom.window;
  try{
    const m=await w.saveEntity('Meetings',null,{name:'Wizard meeting',date:'2026-10-07',time:'10:00',end:'11:00',status:'Scheduled',contactIds:[ids.contact],opportunityId:ids.opportunity});assert.ok(m);
    w.startReport(null,{reportType:'Meeting',meetingId:m.id,name:'Wizard meeting report',summary:'Meeting discussion',keyTakeaways:'Follow up the proposal',actions:[{id:randomUUID(),name:'Wizard follow-up',date:'2026-10-09',assigneeId:member.user.id}]});
    await w.submitReport(false);
    const r=w.eval('db.Reports').find(r=>r.name==='Wizard meeting report');assert.ok(r,w.document.getElementById('toast').textContent);
    const t=w.eval('db.Tasks').find(t=>t.id===r.actions[0].taskId);assert.equal(t.reportId,r.id);assert.equal(t.assigneeId,member.user.id);assert.equal(w.eval('db.Meetings').find(x=>x.id===m.id).reportId,r.id);assert.equal(w.eval('db.Meetings').find(x=>x.id===m.id).status,'Completed');
    w.closeDialog();w.startReport(null,{reportType:'Complaint',name:'Wizard complaint',details:'Client concern',resolution:'',status:'Open',priority:'High',contactIds:[ids.contact],opportunityId:ids.opportunity,actions:[]});await w.submitReport(false);
    const complaintReport=w.eval('db.Reports').find(x=>x.name==='Wizard complaint');assert.ok(complaintReport,w.document.getElementById('toast').textContent);
    const complaint=w.eval('db.Complaints').find(x=>x.id===complaintReport.complaintId);assert.equal(complaint.reportId,complaintReport.id);assert.equal(complaint.priority,'High');
    const fresh=(await call('/api/workspace',{token:gm.token})).data.state;assert.equal(fresh.Tasks.find(x=>x.id===t.id).reportId,r.id);assert.ok(fresh.Complaints.some(x=>x.id===complaint.id));assert.equal(errors.length,0,errors.join('\n'));
  }finally{w.close();}
});

async function deleteInUI(w,id,permanent=false){
  w.confirmDelete('Contacts',id,permanent);w.document.getElementById('firstconfirm').click();const word=w.document.getElementById('deleteword');word.value='DELETE';word.dispatchEvent(new w.Event('input',{bubbles:true}));await w.document.getElementById('confirmdelete').onclick();
}
test('CRM backup restore and Trash restore/purge work through server, including profile supplements',async()=>{
  const {dom,errors}=await site('manager@example.test'),w=dom.window;
  try{
    const c=await w.saveEntity('Contacts',null,{name:'Backup round-trip contact',company:'Test'});assert.ok(c);
    assert.ok(await w.transact(next=>next.notes.push({id:randomUUID(),recordType:'Contacts',recordId:c.id,title:'Restore note',body:'Keep this note'})));
    const backup=JSON.stringify((await call('/api/workspace/export',{token:w.DGJSession.token})).data.state);
    assert.ok(await w.saveEntity('Contacts',c.id,{name:'Edited after backup'}));w.restoreBackup(new w.File([backup],'backup.json',{type:'application/json'}));await until(()=>w.document.getElementById('confirmrestore'));await w.document.getElementById('confirmrestore').onclick();
    assert.equal(w.eval('db.Contacts').find(x=>x.id===c.id).name,'Backup round-trip contact',w.document.getElementById('toast').textContent);
    await deleteInUI(w,c.id);assert.ok(w.eval('db.Contacts').find(x=>x.id===c.id).deletedAt);assert.ok(!w.eval('db.notes').some(n=>n.recordId===c.id));
    await w.restoreRecord('Contacts',c.id);assert.ok(!w.eval('db.Contacts').find(x=>x.id===c.id).deletedAt);assert.ok(w.eval('db.notes').some(n=>n.recordId===c.id));
    await deleteInUI(w,c.id);await deleteInUI(w,c.id,true);assert.ok(!w.eval('db.Contacts').some(x=>x.id===c.id));assert.equal((await call('/api/records/Contacts/'+c.id,{token:gm.token})).status,404);
    const aux=(await pool.query("SELECT value FROM crm_settings WHERE key='workspace-aux'")).rows[0].value;assert.ok(!aux.some(n=>n.data.recordId===c.id));assert.equal(errors.length,0,errors.join('\n'));
  }finally{w.close();}
});

test('editing draft recipients and legacy preferences preserves private drafts, views and full activity history',async()=>{
  const draftId=randomUUID(),eventId=randomUUID();let result=await ws([op('emailDrafts',{opportunityId:ids.opportunity,contactIds:[],to:['first@example.test'],cc:[],subject:'Draft subject',body:'Draft body',status:'Draft'},draftId),op('activity',{recordType:'Contacts',recordId:ids.contact,kind:'interaction',text:'Recorded call',subject:'Call',body:'Old conversation retained',channel:'Phone',outcome:'Recorded',contactIds:[ids.contact],opportunityId:'',occurredAt:Date.now()},eventId)]);assert.equal(result.status,200,JSON.stringify(result.data));
  result=await ws([op('emailDrafts',{opportunityId:ids.opportunity,contactIds:[ids.contact],to:['second@example.test'],cc:[],subject:'Changed subject',body:'Draft body',status:'Draft'},draftId,1,'update')]);assert.equal(result.status,200,JSON.stringify(result.data));
  assert.ok(!(await call('/api/workspace',{token:gm2.token})).data.state.emailDrafts.some(d=>d.id===draftId));
  const savedView=(await call('/api/workspace',{token:member.token})).data.state.savedViews[0];assert.ok(savedView);assert.equal((await call('/api/preferences',{token:member.token,method:'PUT',body:{locale:'ar'}})).status,200);assert.equal((await call('/api/workspace',{token:member.token})).data.state.savedViews[0].id,savedView.id);
  // Enough real updates to move the communication outside the old UI's first 100 entries.
  const operations=Array.from({length:101},(_,i)=>op('Contacts',{name:'Audit history '+i}));assert.equal((await ws(operations)).status,200);
  const {dom,errors}=await site('manager@example.test'),w=dom.window;
  try{
    assert.ok(w.eval('db.activity').some(x=>x.id===eventId));assert.ok(await w.saveEntity('Contacts',null,{name:'History preservation UI save'}));assert.ok(w.eval('db.activity').some(x=>x.id===eventId));
    const noteId=randomUUID();assert.ok(await w.transact(n=>n.notes.push({id:noteId,recordType:'Contacts',recordId:ids.contact,title:'Delete audit note',body:'Temporary'})));assert.ok(await w.transact(n=>{n.notes=n.notes.filter(x=>x.id!==noteId);}));
    assert.ok((await pool.query("SELECT id FROM crm_audit WHERE action='notes.deleted' AND record_id=$1",[ids.contact])).rowCount);assert.equal(errors.length,0,errors.join('\n'));
  }finally{w.close();}
});

test('a delayed refresh cannot replace a newer successfully saved state',async()=>{
  const {dom,errors}=await site('manager@example.test'),w=dom.window;
  try{
    const fetchOriginal=w.fetch;let release,received;const gotResponse=new Promise(resolve=>{received=resolve;});const hold=new Promise(resolve=>{release=resolve;});let once=true;
    w.fetch=async(url,options)=>{const response=await fetchOriginal(url,options);if(once&&url.endsWith('/api/workspace')&&(!options.method||options.method==='GET')){once=false;received();await hold;}return response;};
    const refresh=w.eval('DGJConnection').refresh();await gotResponse;const c=await w.saveEntity('Contacts',null,{name:'Save during slow refresh'});assert.ok(c);release();assert.equal(await refresh,false);assert.ok(w.eval('db.Contacts').some(x=>x.id===c.id));assert.equal(errors.length,0,errors.join('\n'));
  }finally{w.close();}
});

test('member signs in with trusted role, cannot see private data or export, and revocation clears cached records',async()=>{
  const privateId=randomUUID();assert.equal((await ws([op('Contacts',{name:'PRIVATE UI CONTACT',visibility:'private'},privateId)])).status,200);
  const {dom,errors}=await site('member@example.test'),w=dom.window;
  try{
    assert.ok(!JSON.stringify(w.eval('db')).includes(privateId));assert.ok(!w.document.body.textContent.includes('PRIVATE UI CONTACT'));
    assert.equal(w.eval('user.role'),'member');assert.ok(!w.document.querySelector('[data-page="Trash"]'));assert.ok(!w.document.querySelector('#demouser'));
    const token=w.DGJSession.token;assert.equal((await call('/api/workspace/export',{token})).status,403);
    w.go('Settings');assert.equal(w.document.getElementById('real-accounts'),null);
    // Revoke using Better Auth rather than assuming bearer encoding details.
    await call('/api/auth/sign-out',{token,method:'POST',body:{}});
    await w.eval("DGJConnection").refresh();assert.equal(w.DGJSession.ready,false);assert.equal(w.eval('db.Contacts.length'),0);assert.equal(w.document.getElementById('main').textContent,'');assert.equal(errors.length,0,errors.join('\n'));
  }finally{w.close();}
});
