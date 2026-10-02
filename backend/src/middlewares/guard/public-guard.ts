import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';

/** No authentication: baseDb without a transaction, so RLS denies tenant tables while auth tables stay readable. */
export const publicGuard = xMiddleware(
  {
    functionName: 'publicGuard',
    type: 'x-guard',
    security: [],
    name: 'public',
    description: 'No sign-in required',
  },
  async (ctx, next) => {
    ctx.set('db', baseDb);
    await next();
  },
);
