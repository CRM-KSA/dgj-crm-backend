import { transaction } from './db.js';
import { fail } from './errors.js';
import { trustedMember, manager, profile, audit } from './records.js';

export async function bootstrapManager(pool, auth, config) {
  // A database marker prevents resetting the first manager on redeployment.
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(448451)');
    if ((await lock.query("SELECT 1 FROM crm_settings WHERE key='initial-manager-created'")).rowCount) return;
    if (!config.bootstrap) {
      const count = (await lock.query("SELECT COUNT(*)::int AS n FROM crm_members WHERE role IN ('admin','manager') AND enabled=TRUE")).rows[0].n;
      if (count) return;
      throw new Error('Set bootstrap manager variables for the first deployment.');
    }
    const {email, password, name} = config.bootstrap;
    // Reuse only for recovery after an interrupted first boot; public sign-up is closed.
    let user = (await lock.query('SELECT id,name,email FROM "user" WHERE email=$1', [email])).rows[0];
    if (!user) user = (await auth.api.createUser({body: {email, password, name, role: 'user'}})).user;
    await lock.query('BEGIN');
    await lock.query("INSERT INTO crm_members(user_id,role,enabled) VALUES($1,'manager',TRUE) ON CONFLICT(user_id) DO UPDATE SET role='manager',enabled=TRUE", [user.id]);
    if(email==='crm-ksa@dgjones.com') await lock.query("UPDATE crm_members SET role='admin' WHERE user_id=$1",[user.id]);
    await lock.query("INSERT INTO crm_settings(key,value) VALUES('initial-manager-created',$1::jsonb)", [JSON.stringify({userId: user.id})]);
    await audit(lock, user, 'account.bootstrap');
    await lock.query('COMMIT');
    console.log('Initial manager account created. Remove the bootstrap password variable after first login.');
  } catch (error) {
    await lock.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await lock.query('SELECT pg_advisory_unlock(448451)').catch(() => {});
    lock.release();
  }
}

export async function createMember(pool, auth, actor, input) {
  const actorMember=await trustedMember(pool, actor.id);
  manager(actorMember);
  if (input.role==='admin' && actorMember.role!=='admin') fail(403,'ADMIN_REQUIRED','Only an administrator can create another administrator.');
  if (input.email.toLowerCase()==='crm-ksa@dgjones.com' && actorMember.role!=='admin') fail(403,'ADMIN_REQUIRED','The central administrator address is reserved.');
  if (!input.email.toLowerCase().endsWith("@dgjones.com")) {
    fail(400, "COMPANY_EMAIL_REQUIRED", "Team accounts must use an @dgjones.com email address.");
  }
  if ((await pool.query('SELECT 1 FROM "user" WHERE email=$1', [input.email])).rowCount) {
    fail(409, 'EMAIL_EXISTS', 'This email already has an account.');
  }
  // Better Auth provisions its own account/password transaction. Until a CRM
  // membership commits, this identity has NO data access. Recheck the manager
  // under the CRM lock before granting access (including during a disable race).
  const created = (await auth.api.createUser({body: {name: input.name, email: input.email, password: input.password, role: 'user'}})).user;
  return transaction(pool, async db => {
    const user = await trustedMember(db, actor.id); manager(user);
    if (input.role==='admin' && user.role!=='admin') fail(403,'ADMIN_REQUIRED','Administrator access changed. Sign in again.');
    await db.query('INSERT INTO crm_members(user_id,role) VALUES($1,$2)', [created.id, input.role]);
    await audit(db, user, 'account.created');
    return profile({...created, role: input.role});
  });
}

export async function setEnabled(pool, actor, targetId, enabled) {
  return transaction(pool, async db => {
    const user = await trustedMember(db, actor.id); manager(user);
    if (targetId === user.id) fail(400, 'SELF_DISABLE', 'You cannot disable your own account.');
    const target = (await db.query('SELECT * FROM crm_members WHERE user_id=$1', [targetId])).rows[0];
    if (!target) fail(404, 'NOT_FOUND', 'Account not available.');
    if (target.role==='admin' && user.role!=='admin') fail(403,'ADMIN_REQUIRED','Only an administrator can manage an administrator account.');
    if (!enabled && target.role==='admin' && !(await db.query("SELECT 1 FROM crm_members WHERE role='admin' AND enabled=TRUE AND user_id<>$1",[targetId])).rowCount) fail(409,'LAST_ADMIN','At least one administrator must stay enabled.');
    if (!enabled && target.role === 'manager') {
      const n = (await db.query("SELECT COUNT(*)::int AS n FROM crm_members WHERE role IN ('admin','manager') AND enabled=TRUE AND user_id<>$1", [targetId])).rows[0].n;
      if (!n) fail(409, 'LAST_MANAGER', 'At least one manager must stay enabled.');
    }
    await db.query('UPDATE crm_members SET enabled=$2 WHERE user_id=$1', [targetId, enabled]);
    if (!enabled) await db.query('DELETE FROM session WHERE "userId"=$1', [targetId]);
    await audit(db, user, enabled ? 'account.enabled' : 'account.disabled');
    return {id: targetId, enabled};
  });
}

export async function setRole(pool, actor, targetId, role) {
  return transaction(pool, async db => {
    const user = await trustedMember(db, actor.id); manager(user);
    if (!['admin','manager','member','visitor'].includes(role)) fail(400, 'INVALID_ROLE', 'Choose a valid CRM role.');
    const target = (await db.query('SELECT * FROM crm_members WHERE user_id=$1', [targetId])).rows[0];
    if (!target) fail(404, 'NOT_FOUND', 'Account not available.');
    if (target.role==='admin' && user.role!=='admin') fail(403,'ADMIN_REQUIRED','Only an administrator can manage an administrator account.');
    if (role==='admin' && user.role!=='admin') fail(403,'ADMIN_REQUIRED','Only an administrator can grant administrator access.');
    if (target.enabled && target.role==='admin' && role!=='admin' && !(await db.query("SELECT 1 FROM crm_members WHERE role='admin' AND enabled=TRUE AND user_id<>$1",[targetId])).rowCount) fail(409,'LAST_ADMIN','At least one administrator must stay enabled.');
    if (target.role === role) return {id: targetId, role};
    if (targetId === user.id) fail(400, 'SELF_ROLE_CHANGE', 'Another manager must change your role.');
    if (target.enabled && target.role === 'manager' && role !== 'manager') {
      const n = (await db.query("SELECT COUNT(*)::int AS n FROM crm_members WHERE role IN ('admin','manager') AND enabled=TRUE AND user_id<>$1", [targetId])).rows[0].n;
      if (!n) fail(409, 'LAST_MANAGER', 'At least one manager must stay enabled.');
    }
    await db.query('UPDATE crm_members SET role=$2 WHERE user_id=$1', [targetId, role]);
    await db.query('DELETE FROM session WHERE "userId"=$1', [targetId]);
    await audit(db, user, 'account.role_changed');
    return {id: targetId, role};
  });
}
