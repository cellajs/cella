import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findMemberUser, findMfaRequired } from '#/modules/user/user-queries';
import { administeredOrganizationIds } from '#/permissions/administered-organizations';
import type { IncludeOption } from '#/schemas';

interface GetUserOpts {
  bySlug?: boolean;
  include?: IncludeOption[];
}

/**
 * A user the caller relates to, by id or slug: themselves, anyone for a system admin, else a member of an organization
 * the caller shares. With include=mfa it adds `mfaRequired` for the user themselves, system admins and the admins of
 * an organization the user is a member of.
 * @throws AppError 403 `forbidden` for a caller in no organization asking for another user, 404 `not_found` when no
 * user matches; `relatableGuard` answers 403 first for any other user the caller does not relate to.
 */
export async function getUserOp(ctx: UserContext, relatableUserId: string, opts: GetUserOpts = {}) {
  const { user: requestingUser, isSystemAdmin, memberships } = ctx.var;
  const { bySlug, include } = opts;

  // Skip relatable filtering when the caller requests themself by id or slug.
  const isSelf = relatableUserId === requestingUser.id || (bySlug && relatableUserId === requestingUser.slug);

  // Defense in depth: verify shared org membership at query level (mirrors relatableGuard)
  const myOrgIds = [...new Set(memberships.map((membership) => membership.organizationId))];
  if (!isSelf && !isSystemAdmin && myOrgIds.length === 0) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
  }

  const memberOfAny = isSelf || isSystemAdmin ? undefined : myOrgIds;
  const targetUser = await findMemberUser(ctx, { identifier: relatableUserId, bySlug, memberOfAny });

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
