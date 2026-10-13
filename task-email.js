import { transaction } from './db.js';
import { snapshot, visible } from './records.js';

export function emailConfig(env = process.env) {
  if (env.TASK_EMAIL_ENABLED !== 'true') return null;
  let flow;
  try { flow = new URL(env.POWER_AUTOMATE_URL); } catch { throw new Error('POWER_AUTOMATE_URL is required.'); }
  const allowed = ['.api.powerplatform.com','.environment.api.powerplatform.com','.logic.azure.com'];
  if (flow.protocol !== 'https:' || flow.username || flow.password || flow.port ||
      !allowed.some(suffix=>flow.hostname.endsWith(suffix)))
    throw new Error('Use the Microsoft-generated HTTPS flow URL.');
  const website = new URL(env.CRM_PUBLIC_URL || 'https://crm-ksa.github.io/dgj-crm/');
  if (website.protocol !== 'https:' || website.username || website.password) throw new Error('CRM_PUBLIC_URL must use HTTPS.');
  return {flowURL:flow.href, website:website.href};
}
export function localClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Riyadh', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`, hour:Number(parts.hour)};
}
export const CRM_ADMIN_EMAIL = 'crm-ksa@dgjones.com';
const safeText = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function taskPayload(task, recipient, event, config) {
  const labels={start:'Task starts today',due:'Task due today',meeting_reminder:'Meeting today',
    'record.created':'Record added','record.updated':'Record updated','record.trashed':'Record moved to Trash',
    'record.restored':'Record restored','record.purged':'Record permanently deleted',
    'account.created':'Account created','account.enabled':'Account enabled','account.disabled':'Account disabled',
    'account.role_changed':'Account role changed','account.bootstrap':'Administrator account created'};
  const title=labels[event.kind] || event.kind.replace(/[._]/g,' ');
  const admin=event.event_data?.recipientRole==='crm_admin';
  const summary=admin ? `${title}: ${task.data.name || task.type}. By ${task.actorName || 'CRM user'}.` : title;
  return {eventId:event.event_key,notificationType:event.kind,taskId:task.id,
    taskTitle:safeText(task.data.name),assigneeEmail:recipient.email,assigneeName:safeText(recipient.name),
    startDate:safeText(task.data.startDate),dueDate:safeText(task.data.date || task.data.dueDate),crmUrl:config.website,
    notificationTitle:safeText(title),taskStatus:safeText(task.data.status),
    recordId:task.id,recordType:task.type,recordTitle:safeText(task.data.name),recordStatus:safeText(task.data.status),
    recipientEmail:recipient.email,recipientName:safeText(recipient.name),meetingDate:task.type==='Meetings' ? safeText(task.data.date) : '',
    meetingTime:task.type==='Meetings' ? `${safeText(task.data.time)}–${safeText(task.data.end)} (Riyadh)` : '',
    previousDueDate:'',recipientRole:admin ? 'crm_admin' : event.kind==='meeting_reminder' ? 'personnel' : 'assignee',
    changeSummary:safeText(summary)};
}
export function flowSender(config, fetcher = fetch) {
  return async payload => {
    let response;
    try {response=await fetcher(config.flowURL,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}
    catch {const error=new Error('Flow submission outcome unknown');error.uncertain=true;throw error;}
    if (![200,202,204].includes(response.status)) {
      const error=new Error(`Flow submission rejected (${response.status})`);
      error.retry=[401,403,429].includes(response.status);error.uncertain=response.status>=500;
      throw error;
    }
  };
}
export async function queueDateReminders(db, now = new Date()) {
  const clock = localClock(now);
  if (clock.hour < 9) return;
  for (const [kind,field] of [['start',"data->>'startDate'"],['due',"COALESCE(NULLIF(data->>'date',''),data->>'dueDate')"]]) {
    await db.query(`INSERT INTO crm_task_emails(event_key,task_id,assignee_id,kind,event_date)
      SELECT id::text||':'||$1||':'||$2||':'||(data->>'assigneeId'),id,data->>'assigneeId',$1,$2
      FROM crm_records WHERE type='Tasks' AND deleted_at IS NULL
      AND COALESCE(data->>'status','') NOT IN ('Completed','Cancelled')
      AND COALESCE(data->>'assigneeId','')<>'' AND ${field}=$2 ON CONFLICT DO NOTHING`,[kind,clock.date]);
  }
  await db.query(`INSERT INTO crm_task_emails(event_key,task_id,assignee_id,kind,event_date)
    SELECT DISTINCT r.id::text||':meeting_reminder:'||$1||':'||p.person,r.id,p.person,'meeting_reminder',$1
    FROM crm_records r CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(r.data->'personnelIds','[]'::jsonb)) p(person)
    WHERE r.type='Meetings' AND r.deleted_at IS NULL AND r.data->>'date'=$1
      AND COALESCE(r.data->>'status','') NOT IN ('Completed','Cancelled') AND p.person<>''
    ON CONFLICT DO NOTHING`,[clock.date]);
}
async function submit(db, table, event, payload, send) {
  // table is an internal constant, never request input.
  try {
    await send(payload);
    console.log('CRM email: flow accepted request. Check Power Automate run history.');
    await db.query(`UPDATE ${table} SET status='accepted',accepted_at=NOW(),attempts=attempts+1,last_error=NULL WHERE id=$1`,[event.id]);
  } catch (error) {
    console.error('CRM email:', error.message);
    const state=error.uncertain ? 'uncertain' : error.retry && event.attempts<4 ? 'pending' : 'failed';
    await db.query(`UPDATE ${table} SET status=$2,attempts=attempts+1,last_error=$3,next_attempt=NOW()+INTERVAL '5 minutes' WHERE id=$1`,[event.id,state,error.message.slice(0,160)]);
  }
}
export async function deliverPending(pool, config, send, now = new Date()) {
  return transaction(pool, async db => {
    const {rows} = await db.query("SELECT * FROM crm_task_emails WHERE status='pending' AND next_attempt<=NOW() ORDER BY id LIMIT 1 FOR UPDATE");
    const event=rows[0];
    if (!event) {
      const {rows:[admin]}=await db.query("SELECT * FROM crm_admin_emails WHERE status='pending' AND next_attempt<=NOW() ORDER BY id LIMIT 1 FOR UPDATE");
      if (!admin) return false;
      await submit(db,'crm_admin_emails',admin,taskPayload(admin.record_data,{email:CRM_ADMIN_EMAIL,name:'CRM Administrator'},
        {...admin,event_data:{recipientRole:'crm_admin'}},config),send);
      return true;
    }
    // Defense in depth: never deliver legacy general/lifecycle emails, even if requeued.
    if (!['start','due','meeting_reminder'].includes(event.kind)) {
      await db.query("UPDATE crm_task_emails SET status='skipped' WHERE id=$1",[event.id]);return true;
    }
    const graph=await snapshot(db), record=graph.get(event.task_id);
    const {rows:[recipient]}=await db.query('SELECT m.user_id AS id,m.role,m.enabled,u.name,u.email FROM crm_members m JOIN "user" u ON u.id=m.user_id WHERE m.user_id=$1',[event.assignee_id]);
    const clock=localClock(now),meeting=event.kind==='meeting_reminder';
    const date=event.kind==='start' ? record?.data.startDate : record?.data.date || record?.data.dueDate;
    const related=meeting ? (record?.data.personnelIds || []).includes(event.assignee_id) : record?.data.assigneeId===event.assignee_id;
    const valid=record?.type===(meeting ? 'Meetings' : 'Tasks') && recipient?.enabled && /@dgjones\.com$/i.test(recipient.email)
      && related && !['Completed','Cancelled'].includes(record?.data.status) && visible(graph,recipient,record)
      && clock.hour>=9 && event.event_date===clock.date && date===event.event_date;
    if (!valid) {await db.query("UPDATE crm_task_emails SET status='skipped' WHERE id=$1",[event.id]);console.log('CRM reminder: skipped (access, recipient, status or stale date).');return true;}
    await submit(db,'crm_task_emails',event,taskPayload(record,recipient,event,config),send);
    return true;
  });
}
export function startTaskEmailWorker(pool, env = process.env) {
  const config=emailConfig(env); if (!config) {console.log('Task email worker: DISABLED. Set TASK_EMAIL_ENABLED=true on backend service and deploy.');return ()=>{};}
  console.log('Task email worker: ENABLED (Power Automate Anyone).');
  const send=flowSender(config); let running=false, stopped=false;
  async function tick() {
    if (running || stopped) return; running=true;
    try {
      await queueDateReminders(pool);
      const summary=await pool.query("SELECT 'personal' AS channel,status,COUNT(*)::int AS count FROM crm_task_emails GROUP BY status UNION ALL SELECT 'admin' AS channel,status,COUNT(*)::int AS count FROM crm_admin_emails GROUP BY status");
      console.log('Task email queue:',JSON.stringify(summary.rows));
      for(let n=0;n<10 && !stopped;n++) if (!await deliverPending(pool,config,send)) break;
    }
    catch {console.error('Task email worker failed. Review configuration and queue status.');}
    finally {running=false;}
  }
  const timer=setInterval(tick,60000); timer.unref(); void tick();
  return ()=>{stopped=true;clearInterval(timer);};
}
