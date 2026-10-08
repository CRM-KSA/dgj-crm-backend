import pg from 'pg';

export const CRM_LOCK = 448451;
export function createPool(config) {
  const pool = new pg.Pool({
    connectionString: config.databaseURL, max: 5,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    ssl: config.databaseSSL ? { rejectUnauthorized: true, ...(config.databaseCA ? {ca: config.databaseCA} : {}) } : undefined
  });
  pool.on('error', () => console.error('A database connection failed.'));
  return pool;
}

export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize prototype writes, including link/visibility changes, across replicas.
    await client.query('SELECT pg_advisory_xact_lock($1)', [CRM_LOCK]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

