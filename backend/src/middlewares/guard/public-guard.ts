import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';

/**
 * Middleware for routes that require no authentication (auth, webhooks, etc.).
 * Sets ctx.var.db to baseDb directly with no transaction wrapper.
 *
 * RLS on tenant-scoped tables (organizations, attachments, etc.) will deny access
 * because no session variables are set, which is the correct fail-closed behavior.
 * Non-tenant tables (users, sessions, tokens) remain accessible for auth flows.
 */
export const publicGuard = xMiddleware(
  {
    functionName: 'publicGuard',
    type: 'x-guard',
    name: 'public',
    description: 'No authentication required; provides baseDb without RLS context',
  },
  async (ctx, next) => {
    ctx.set('db', baseDb);
    await next();
  },
);
