import type { MiddlewareHandler } from 'hono';
import isAuthenticated from '../../../middlewares/guard/is-authenticated';
import { db } from '../../../db/db';
import { or, eq } from 'drizzle-orm';
import { usersTable } from '../../../db/schema/users';
import isAllowedTo from '../../../middlewares/guard/is-allowed-to';

const checkUserPermissions: MiddlewareHandler = async (ctx, next) => {
  const requestedUserId = ctx.req.query('requestedUserId');
  if (requestedUserId) {
    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.id, requestedUserId)));
    ctx.set('user', targetUser);
    return await next();
  }
  await isAuthenticated(ctx, next);
  isAllowedTo('read', 'project');
};

export default checkUserPermissions;
