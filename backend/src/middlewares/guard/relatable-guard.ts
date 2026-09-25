import { and, eq, inArray } from 'drizzle-orm';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { validUuidSchema } from '#/schemas/common-schemas';

/** Requires a shared organization with `relatableUserId` from path or query; skips absent/self, allows sysadmins. */
export const relatableGuard = xMiddleware(
  {
    functionName: 'relatableGuard',
    type: 'x-guard',
    name: 'relatable',
    description: 'Checks that the requesting user shares at least one organization with the target user',
  },
  async (ctx, next) => {
    const targetUserId = ctx.req.param('relatableUserId') ?? ctx.req.query('relatableUserId');

    const user = ctx.var.user;
    const isSystemAdmin = ctx.var.isSystemAdmin;

    if (!targetUserId || targetUserId === user.id || targetUserId === user.slug) {
      await next();
      return;
    }

    if (isSystemAdmin) {
      await next();
      return;
    }

    // Guards run before request validation: another user named by anything but a user id relates to nobody, and it
    // never reaches the uuid-typed query below.
    if (!validUuidSchema.safeParse(targetUserId).success) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
    }

    const memberships = ctx.var.memberships;
    const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];

    if (myOrgIds.length === 0) {
      throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
    }

    // memberships_select_authenticated_policy lets any authenticated user read membership rows in cross-tenant RLS
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
