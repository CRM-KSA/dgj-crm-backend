import { loadConfig, loadLocalEnv } from './config.js';
import { createPool } from './db.js';
import { createAuth, authOptions } from './auth.js';
import { migrate } from './migrate.js';
import { bootstrapManager } from './users.js';
import { createApp } from './app.js';

loadLocalEnv();
let pool, server;
try {
  const config = loadConfig();
  pool = createPool(config);
  await migrate(pool, {options: authOptions(config, pool)});
  const auth = createAuth(config, pool);
  await bootstrapManager(pool, auth, config);
  const app = createApp({config, pool, auth});
  server = app.listen(config.port, '0.0.0.0', () => console.log('DGJ CRM service ready.'));
} catch (error) {
  console.error('Startup failed. Check required variables, credentials and database connectivity.');
  if (error.name === 'ZodError') console.error('Bootstrap account variables need valid values.');
  if (pool) await pool.end();
  process.exitCode = 1;
}
const shutdown = () => {
  if (!server) return;
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  server.close(async () => {await pool.end(); clearTimeout(timer); process.exit(0);});
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
