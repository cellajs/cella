import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';

/** No authentication: baseDb without a transaction, so RLS denies tenant tables while auth tables stay readable. */
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
