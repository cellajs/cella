import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findMemberUser, findMfaRequired } from '#/modules/user/user-queries';
import { accessFrom } from '#/permissions/access';
import { administeredOrganizationIds } from '#/permissions/administered-organizations';
import type { IncludeOption } from '#/schemas';

/**
 * A user the caller sees, by id or slug: themselves, anyone for a system admin, else a user holding a membership row
 * the caller may read. With include=mfa it adds `mfaRequired` for the user themselves, system admins and the admins of
 * an organization the user is a member of.
 * @throws AppError 403 `forbidden` for a user the caller does not see, missing and unseen alike.
 */
export async function getUserOp(ctx: UserContext, identifier: string, opts: { bySlug?: boolean; include?: IncludeOption[] } = {}) {
  const { user: requestingUser, isSystemAdmin, memberships } = ctx.var;
  const { bySlug, include } = opts;

  const isSelf = identifier === requestingUser.id || (bySlug && identifier === requestingUser.slug);
  const seesEveryone = isSelf || isSystemAdmin;

  const visibleTo = seesEveryone ? undefined : { access: accessFrom(ctx), userId: requestingUser.id };
  const targetUser = await findMemberUser(ctx, { identifier, bySlug, visibleTo });

  // One answer for a missing user and an unseen one: it never tells whether a user exists.
  if (!targetUser) throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });

  if (!include?.includes('mfa')) return targetUser;

  // include=mfa: whether an account has MFA on is for the account itself, system admins and the admins of an
  // organization the user is a member of. Shown to anyone who sees the user, it lists the accounts without a second factor.
  const myOrgIds = [...new Set(memberships.map((membership) => membership.organizationId))];
  const adminOrgIds = seesEveryone ? undefined : administeredOrganizationIds(ctx, myOrgIds);
  if (adminOrgIds?.length === 0) return targetUser;

  const mfaRequired = await findMfaRequired(ctx, { userId: targetUser.id, memberOfAny: adminOrgIds });
  return mfaRequired === undefined ? targetUser : { ...targetUser, mfaRequired };
}
