import { setPublicRlsContext } from '#/db/tenant-context';
import { xMiddleware } from '#/docs/x-middleware';

/** Public tenant ID for platform-wide resources like pages */
const PUBLIC_TENANT_ID = 'public';

/**
 * Middleware for routes that are publicly accessible.
 * Sets up public RLS context with public tenant and provides ctx.var.db.
 *
 * @param _ - Request context (unused here, but required by Hono middleware signature).
 * @param next - The next middleware or route handler.
 */
export const publicGuard = xMiddleware(
  { functionName: 'publicGuard', type: 'x-guard', name: 'public', description: 'No authentication required' },
  async (ctx, next) => {
    // Wrap remaining middleware chain in public RLS context with public tenant
    return setPublicRlsContext(PUBLIC_TENANT_ID, async (tx) => {
      ctx.set('db', tx);
      ctx.set('tenantId', PUBLIC_TENANT_ID);

      await next();
    });
  },
);
