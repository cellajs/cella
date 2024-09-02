import { eq, or } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { errorResponse } from '#/lib/errors';
import isAllowedTo from '#/middlewares/guard/is-allowed-to';

const checkUserPermissions: MiddlewareHandler = async (ctx, next) => {
  const requestUserId = ctx.req.query('userId');

  if (requestUserId) {
    const user = ctx.get('user');
    if (!user || !user.role.includes('admin')) return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });
    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.id, requestUserId)));
    ctx.set('user', targetUser);
    return await next();
  }

  isAllowedTo('read', 'project');
  await next();
};

export default checkUserPermissions;
