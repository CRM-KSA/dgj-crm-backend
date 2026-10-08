import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from './auth.js';
import { createPool, CRM_LOCK } from './db.js';
import { loadConfig, loadLocalEnv } from './config.js';

export async function migrate(pool, auth) {
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock($1)', [CRM_LOCK]);
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
    await lock.query('BEGIN');
    await lock.query(await readFile(new URL('../migrations/001-crm.sql', import.meta.url), 'utf8'));
    await lock.query('COMMIT');
  } catch (error) {
    await lock.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [CRM_LOCK]).catch(() => {});
    lock.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadLocalEnv();
  const config = loadConfig();
  const pool = createPool(config);
  try { await migrate(pool, {options: authOptions(config, pool)}); console.log('Database schema ready.'); }
  catch { console.error('Migration failed. Check database access and server configuration.'); process.exitCode = 1; }
  finally { await pool.end(); }
}
