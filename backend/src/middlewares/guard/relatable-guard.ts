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
    errors: [403],
    requires: ['session'],
    name: 'Shared organization',
    description: 'Requires sharing an organization with the user named in the request. System admins also pass.',
  },
  async (ctx, next) => {
    const targetUserId = ctx.req.param('relatableUserId') ?? ctx.req.query('relatableUserId');

    const user = ctx.var.user;
    const isSystemAdmin = ctx.var.isSystemAdmin;

    if (!targetUserId || targetUserId === user.id || targetUserId === user.slug || isSystemAdmin) {
      await next();
      return;
    }

    // One answer for a missing user and an unshared one, so the guard never tells whether a user exists.
    const unrelated = () => new AppError(403, 'forbidden', 'warn', { entityType: 'user' });

    // Guards run before request validation: another user named by anything but a user id relates to nobody, and it
    // never reaches the uuid-typed query below.
    if (!validUuidSchema.safeParse(targetUserId).success) throw unrelated();

    const organizationIds = [...new Set(ctx.var.memberships.map((membership) => membership.organizationId))];

    if (organizationIds.length === 0) throw unrelated();

    // Memberships carry no RLS, so the runtime pool reads them across tenants.
    const db = ctx.var.db;
    const [shared] = await db
      .select({ id: membershipsTable.id })
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, targetUserId), inArray(membershipsTable.organizationId, organizationIds)))
      .limit(1);

    if (!shared) throw unrelated();

    await next();
  },
);
