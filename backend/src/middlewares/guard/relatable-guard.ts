import { and, eq, inArray } from 'drizzle-orm';
import { unsafeInternalDb as db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';

/**
 * Guard middleware that checks if the requesting user is relatable to a target user.
 * Two users are relatable if they share at least one organization membership.
 *
 * Reads `relatableUserId` from path params (fallback: query params).
 * No-ops if param is absent or matches the requesting user.
 * System admins bypass the check.
 *
 * @example
 * ```ts
 * xGuard: [authGuard, crossTenantGuard, relatableGuard],
 * // Route must include relatableUserId as path or query param
 * path: '/users/{relatableUserId}',
 * ```
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
    const userSystemRole = ctx.var.userSystemRole;

    // No-op if param absent or requesting self
    if (!targetUserId || targetUserId === user.id || targetUserId === user.slug) {
      await next();
      return;
    }

    // System admins bypass relatability check
    if (userSystemRole === 'admin') {
      await next();
      return;
    }

    // Get the requesting user's organization IDs
    const memberships = ctx.var.memberships;
    const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];

    if (myOrgIds.length === 0) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
    }

    // Check if target user shares at least one organization with requesting user
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
