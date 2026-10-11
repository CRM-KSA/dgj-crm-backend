import { transaction } from './db.js';
import { snapshot, visible } from './records.js';

export function emailConfig(env = process.env) {
  if (env.TASK_EMAIL_ENABLED !== 'true') return null;
  const tenant = env.MS_TENANT_ID || '', client = env.MS_CLIENT_ID || '';
  if (![tenant, client].every(x => /^[0-9a-f-]{36}$/i.test(x)) || !env.MS_CLIENT_SECRET)
    throw new Error('Task email requires Microsoft application credentials.');
  const sender = env.TASK_EMAIL_SENDER || 'crm-ksa@dgjones.com';
  if (sender.toLowerCase() !== 'crm-ksa@dgjones.com') throw new Error('Unexpected task email sender.');
  const website = new URL(env.CRM_PUBLIC_URL || 'https://crm-ksa.github.io/dgj-crm/');
  if (website.protocol !== 'https:' || website.username || website.password) throw new Error('CRM_PUBLIC_URL must use HTTPS.');
  return {tenant, client, secret: env.MS_CLIENT_SECRET, sender, website: website.href};
}
export function localClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Riyadh', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`, hour:Number(parts.hour)};
}
export function taskMail(task, recipient, kind, config) {
  const labels = {assignment:'A task has been assigned to you', start:'Your task starts today', due:'Your task is due today'};
  return {message:{subject:`DGJ CRM: ${labels[kind]}`,body:{contentType:'Text',content:[`Hi ${recipient.name},`, '', labels[kind]+'.', `Task: ${task.data.name}`, `Start: ${task.data.startDate || 'Not specified'}`, `Due: ${task.data.date || task.data.dueDate || 'Not specified'}`, '', `Open the CRM and select Tasks: ${config.website}`, 'Sign in using your company account to view the task.'].join('\n')},toRecipients:[{emailAddress:{address:recipient.email}}]},saveToSentItems:true};
}
export function graphMailer(config, fetcher = fetch) {
  let token, expires = 0;
  return async message => {
    if (!token || Date.now() >= expires) {
      const response = await fetcher(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`, {method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client,client_secret:config.secret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'})});
      if (!response.ok) {const error = new Error('Microsoft token request rejected'); error.retry = true; throw error;}
      const body = await response.json();
      if (!body.access_token) throw new Error('Microsoft token unavailable');
      token = body.access_token; expires = Date.now()+Math.max(0,(Number(body.expires_in)||300)-60)*1000;
    }
    let response;
    try { response = await fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`, {method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(message)}); }
    catch {const error = new Error('Mail submission outcome unknown'); error.uncertain = true; throw error;}
    if (response.status !== 202) {
      const error = new Error(`Microsoft mail submission rejected (${response.status})`);
      error.retry = [401,403,429].includes(response.status);
      error.uncertain = response.status >= 500;
      if (response.status===401) {token=null; expires=0;}
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
}
export async function deliverPending(pool, config, send, now = new Date()) {
  // Same transaction lock as CRM mutations: permissions cannot change during submission.
  return transaction(pool, async db => {
    const {rows} = await db.query("SELECT * FROM crm_task_emails WHERE status='pending' AND next_attempt<=NOW() ORDER BY id LIMIT 1 FOR UPDATE");
    const event=rows[0]; if (!event) return false;
    const graph=await snapshot(db), task=graph.get(event.task_id);
    const members=await db.query('SELECT m.user_id AS id,m.role,m.enabled,u.name,u.email FROM crm_members m JOIN "user" u ON u.id=m.user_id WHERE m.user_id=$1',[event.assignee_id]);
    const recipient=members.rows[0], clock=localClock(now);
    const date=event.kind==='start' ? task?.data.startDate : (task?.data.date || task?.data.dueDate);
    const latest = event.kind==='assignment' ? await db.query("SELECT MAX(assignment_version) AS version FROM crm_task_emails WHERE task_id=$1 AND kind='assignment'",[event.task_id]) : null;
    const valid = (!latest || Number(latest.rows[0].version)===event.assignment_version) && task && task.type==='Tasks' && recipient?.enabled && /@dgjones\.com$/i.test(recipient.email)
      && task.data.assigneeId===event.assignee_id && !['Completed','Cancelled'].includes(task.data.status)
      && visible(graph,recipient,task)
      && (event.kind==='assignment' || (event.event_date===clock.date && date===event.event_date));
    if (!valid) {await db.query("UPDATE crm_task_emails SET status='skipped' WHERE id=$1",[event.id]);return true;}
    try {
      await send(taskMail(task,recipient,event.kind,config));
      await db.query("UPDATE crm_task_emails SET status='accepted',accepted_at=NOW(),attempts=attempts+1,last_error=NULL WHERE id=$1",[event.id]);
    } catch (error) {
      const state=error.uncertain ? 'uncertain' : error.retry && event.attempts<4 ? 'pending' : 'failed';
      await db.query("UPDATE crm_task_emails SET status=$2,attempts=attempts+1,last_error=$3,next_attempt=NOW()+INTERVAL '5 minutes' WHERE id=$1",[event.id,state,error.message.slice(0,160)]);
    }
    return true;
  });
}
export function startTaskEmailWorker(pool, env = process.env) {
  const config=emailConfig(env); if (!config) return ()=>{};
  const send=graphMailer(config); let running=false, stopped=false;
  async function tick() {
    if (running || stopped) return; running=true;
    try {await queueDateReminders(pool); for(let n=0;n<10 && !stopped;n++) if (!await deliverPending(pool,config,send)) break;}
    catch {console.error('Task email worker failed. Review configuration and queue status.');}
    finally {running=false;}
  }
  const timer=setInterval(tick,60000); timer.unref(); void tick();
  return ()=>{stopped=true;clearInterval(timer);};
}
