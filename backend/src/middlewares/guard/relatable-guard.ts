import { and, eq, inArray } from 'drizzle-orm';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { membershipsTable } from '#/modules/memberships/memberships-db';

/**
 * Requires the target user to share an organization with the requester.
 * Reads `relatableUserId` from path or query parameters, skips absent/self targets,
 * and allows system administrators.
 */
export const relatableGuard = xMiddleware(
  {
    functionName: 'relatableGuard',
    type: 'x-guard',
    name: 'relatable',
    description: 'Checks that the requesting user shares at least one organization with the target user',
  },
  async (ctx, next) => {
    // Read relatableUserId from path params, then query params
    const targetUserId = ctx.req.param('relatableUserId') ?? ctx.req.query('relatableUserId');

    const user = ctx.var.user;
    const isSystemAdmin = ctx.var.isSystemAdmin;

    // No-op if param absent or requesting self
    if (!targetUserId || targetUserId === user.id || targetUserId === user.slug) {
      await next();
      return;
    }

    // System admins bypass relatability check
    if (isSystemAdmin) {
      await next();
      return;
    }

    // Get the requesting user's organization IDs
    const memberships = ctx.var.memberships;
    const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];

    if (myOrgIds.length === 0) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
    }

    // Check if target user shares at least one organization with requesting user.
    // The memberships_select_authenticated_policy allows any authenticated user to
    // read membership rows, so this query works in cross-tenant RLS context.
    const db = ctx.var.db;
    const [shared] = await db
      .select({ id: membershipsTable.id })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, targetUserId), inArray(membershipsTable.organizationId, myOrgIds)))
      .limit(1);

    if (!shared) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
    }

    await next();
  },
);
