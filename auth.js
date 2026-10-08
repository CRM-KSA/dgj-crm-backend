import { betterAuth } from 'better-auth';
import { admin, bearer } from 'better-auth/plugins';

export function authOptions(config, pool) {
  return {
    appName: 'DGJ CRM', baseURL: config.baseURL, secret: config.secret,
    database: pool, trustedOrigins: config.origins,
    emailAndPassword: {
      enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128,
      autoSignIn: false, revokeSessionsOnPasswordReset: true
    },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 30, cookieCache: { enabled: false } },
    user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60,
      customRules: {'/sign-in/email': {window: 900, max: 10}} },
    plugins: [bearer({ requireSignature: true }), admin()],
    advanced: { useSecureCookies: config.baseURL.startsWith('https://'),
      ipAddress: {ipAddressHeaders: ['x-dgj-client-ip']} },
    // HTTP admin routes are not mounted. Internal provisioning uses this plugin;
    // crm_members, checked on every API request, is the sole CRM role authority.
    telemetry: { enabled: false }
  };
}
export const createAuth = (config, pool) => betterAuth(authOptions(config, pool));
