import { existsSync } from 'node:fs';
import { z } from 'zod';

export function loadConfig(env = process.env) {
  const required = (key) => {
    const value = env[key]?.trim();
    if (!value || value.startsWith('REPLACE_')) throw new Error(`Set ${key} in server variables.`);
    return value;
  };
  const baseURL = new URL(required('BETTER_AUTH_URL'));
  if (baseURL.pathname !== '/' || baseURL.search || baseURL.hash) throw new Error('BETTER_AUTH_URL must be an origin, without a path.');
  if (baseURL.protocol !== 'https:' && !(baseURL.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(baseURL.hostname))) {
    throw new Error('BETTER_AUTH_URL requires HTTPS (except localhost development).');
  }
  const secret = required('BETTER_AUTH_SECRET');
  if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET needs at least 32 random characters.');
  const origins = [...new Set([baseURL.origin, ...(env.APP_ORIGINS || '').split(',').filter(Boolean).map(value => {
    const url = new URL(value.trim());
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('APP_ORIGINS accepts exact origins, not paths or wildcards.');
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid APP_ORIGINS protocol.');
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('External origins require HTTPS.');
    return url.origin;
  })])];
  const databaseURL = required('DATABASE_URL');
  if (!['postgres:', 'postgresql:'].includes(new URL(databaseURL).protocol)) throw new Error('DATABASE_URL must point to PostgreSQL.');
  const port = Number(env.PORT || 3000);
  const proxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT.');
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 3) throw new Error('Invalid TRUST_PROXY_HOPS.');
  let bootstrap = null;
  if (env.BOOTSTRAP_ADMIN_PASSWORD) {
    bootstrap = z.object({
      email: z.email().max(254), name: z.string().trim().min(1).max(100),
      password: z.string().min(12).max(128)
    }).parse({email: env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(), name: env.BOOTSTRAP_ADMIN_NAME || 'General Manager', password: env.BOOTSTRAP_ADMIN_PASSWORD});
    if (bootstrap.password.startsWith('REPLACE_')) throw new Error('Replace the example bootstrap password.');
  }
  return { baseURL: baseURL.origin, secret, origins, databaseURL, port, proxyHops, bootstrap,
    production: env.NODE_ENV === 'production', databaseSSL: env.DATABASE_SSL === 'true',
    databaseCA: env.DATABASE_CA?.replace(/\\n/g, '\n') };
}

export function loadLocalEnv() {
  if (existsSync('.env')) process.loadEnvFile('.env');
}

