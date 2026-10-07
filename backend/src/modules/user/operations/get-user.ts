import { eq, type SQL } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { usersTable } from '#/modules/user/user-db';
import { findMfaRequired, findUserByFilters, sharesOrgFilter } from '#/modules/user/user-queries';
import { administeredOrganizationIds } from '#/permissions/administered-organizations';
import type { IncludeOption } from '#/schemas';

interface GetUserOpts {
  bySlug?: boolean;
  include?: IncludeOption[];
}

export async function getUserOp(ctx: UserContext, relatableUserId: string, opts: GetUserOpts = {}) {
  const requestingUser = ctx.var.user;
  const db = ctx.var.db;
  const isSystemAdmin = ctx.var.isSystemAdmin;
  const memberships = ctx.var.memberships;

  const { bySlug, include } = opts;

  const userCondition = bySlug ? eq(usersTable.slug, relatableUserId) : eq(usersTable.id, relatableUserId);

  // Skip relatable filtering when the caller requests themself by id or slug.
  const isSelf = relatableUserId === requestingUser.id || (bySlug && relatableUserId === requestingUser.slug);

  // Defense in depth: verify shared org membership at query level (mirrors relatableGuard)
  const myOrgIds = [...new Set(memberships.map((m) => m.organizationId))];
  if (!isSelf && !isSystemAdmin && myOrgIds.length === 0) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
  }

  const filters: SQL[] = [userCondition];
  if (!isSelf && !isSystemAdmin) filters.push(sharesOrgFilter({ var: { db } }, { myOrgIds }));

  const targetUser = await findUserByFilters(ctx, { filters });

  if (!targetUser) throw new AppError(404, 'not_found', 'warn', { entityType: 'user', meta: { user: relatableUserId } });

  if (!include?.includes('mfa')) return targetUser;

  // include=mfa: whether an account has MFA on is for the account itself, system admins and the admins of an
  // organization the user is a member of. Shown to any co-member, it lists the accounts without a second factor.
  const seesEveryone = isSelf || isSystemAdmin;
  const adminOrgIds = seesEveryone ? undefined : administeredOrganizationIds(ctx, myOrgIds);
  if (adminOrgIds?.length === 0) return targetUser;

  const mfaRequired = await findMfaRequired(ctx, { userId: targetUser.id, memberOfAny: adminOrgIds });
  return mfaRequired === undefined ? targetUser : { ...targetUser, mfaRequired };
}
