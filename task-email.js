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
export function taskPayload(task, recipient, event, config) {
  const labels={assignment:'Task assigned',start:'Task starts today',due:'Task due today',completion:'Task completed',cancellation:'Task cancelled',reopened:'Task reopened',due_changed:'Task due date changed'};
  const changes=event.event_data || {};
  return {eventId:event.event_key,notificationType:event.kind,taskId:task.id,
    taskTitle:task.data.name,assigneeEmail:recipient.email,assigneeName:recipient.name,
    startDate:task.data.startDate || '',dueDate:task.data.date || task.data.dueDate || '',crmUrl:config.website,
    notificationTitle:labels[event.kind] || 'Task notification',taskStatus:task.data.status || '',
    previousDueDate:changes.previousDueDate || '',recipientRole:changes.recipientRole || 'assignee',
    changeSummary:event.kind==='due_changed' ? `Due date changed from ${changes.previousDueDate || 'not set'} to ${changes.newDueDate || 'not set'}.` : labels[event.kind] || 'Task notification'};
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
    const lifecycle=['assignment','completion','cancellation','reopened','due_changed'].includes(event.kind);
    const latest=lifecycle ? await db.query("SELECT MAX(assignment_version) AS version FROM crm_task_emails WHERE task_id=$1 AND kind=$2 AND assignee_id=$3",[event.task_id,event.kind,event.assignee_id]) : null;
    const currentDue=task?.data.date || task?.data.dueDate || '';
    const closed=['Completed','Cancelled'].includes(task?.data.status);
    const stateMatches=event.kind==='completion' ? task?.data.status==='Completed'
      : event.kind==='cancellation' ? task?.data.status==='Cancelled' : !closed;
    const creatorEvent=['completion','cancellation','reopened'].includes(event.kind) && event.event_data?.recipientRole==='creator';
    const recipientMatches=creatorEvent ? task?.owner_id===event.assignee_id : task?.data.assigneeId===event.assignee_id;
    const timeMatches=lifecycle ? (event.kind!=='due_changed' || currentDue===event.event_data?.newDueDate && event.event_data?.previousDueDate!==event.event_data?.newDueDate)
      : event.event_date===clock.date && date===event.event_date;
    const valid=(!latest || Number(latest.rows[0].version)===event.assignment_version) && task?.type==='Tasks'
      && recipient?.enabled && /@dgjones\.com$/i.test(recipient.email) && recipientMatches && stateMatches
      && visible(graph,recipient,task) && timeMatches;
    if (!valid) {await db.query("UPDATE crm_task_emails SET status='skipped' WHERE id=$1",[event.id]);console.log('Task email: skipped (recipient, task status, privacy or stale event).');return true;}
    try {
      await send(taskPayload(task,recipient,event,config));
      console.log('Task email: flow accepted request. Check Power Automate run history.');
      await db.query("UPDATE crm_task_emails SET status='accepted',accepted_at=NOW(),attempts=attempts+1,last_error=NULL WHERE id=$1",[event.id]);
    } catch (error) {
      console.error('Task email:', error.message);
      const state=error.uncertain ? 'uncertain' : error.retry && event.attempts<4 ? 'pending' : 'failed';
      await db.query("UPDATE crm_task_emails SET status=$2,attempts=attempts+1,last_error=$3,next_attempt=NOW()+INTERVAL '5 minutes' WHERE id=$1",[event.id,state,error.message.slice(0,160)]);
    }
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
      const summary=await pool.query("SELECT status,COUNT(*)::int AS count FROM crm_task_emails GROUP BY status ORDER BY status");
      console.log('Task email queue:',JSON.stringify(summary.rows));
      for(let n=0;n<10 && !stopped;n++) if (!await deliverPending(pool,config,send)) break;
    }
    catch {console.error('Task email worker failed. Review configuration and queue status.');}
    finally {running=false;}
  }
  const timer=setInterval(tick,60000); timer.unref(); void tick();
  return ()=>{stopped=true;clearInterval(timer);};
}
