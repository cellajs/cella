import { eq, or } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { usersTable } from '#/db/schema/users';
import { getUsersByConditions } from '#/db/util';
import { errorResponse } from '#/lib/errors';
import { isAllowedTo } from '#/middlewares/guard/is-allowed-to';

const checkUserPermissions: MiddlewareHandler = async (ctx, next) => {
  const requestUserId = ctx.req.query('userId');

  if (requestUserId) {
    const user = ctx.get('user');
    if (!user || !user.role.includes('admin')) return errorResponse(ctx, 403, 'forbidden', 'warn', undefined, { user: user.id });
    const [targetUser] = await getUsersByConditions([or(eq(usersTable.id, requestUserId))]);
    ctx.set('user', targetUser);
    return await next();
  }

  isAllowedTo('read', 'project');
  await next();
};

export default checkUserPermissions;
