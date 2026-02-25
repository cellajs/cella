import { baseDb } from '#/db/db';
import { xMiddleware } from '#/docs/x-middleware';

/**
 * Middleware for routes that require no authentication (auth, webhooks, etc.).
 * Sets ctx.var.db to baseDb directly — no transaction wrapper needed.
 *
 * RLS on tenant-scoped tables (organizations, attachments, etc.) will deny access
 * because no session variables are set, which is the correct fail-closed behavior.
 * Non-tenant tables (users, sessions, tokens) remain accessible for auth flows.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler.
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
