import { checkRoleGrant, type RoleGrant } from 'shared';
import { AppError } from '#/core/error';
import { type AccessContext, accessFrom } from '#/permissions/access';

/**
 * Refuses a role grant, or the removal of a member, whose role outranks the actor's own on the channel; the rule and
 * its exemptions are `mayGrantRole`'s.
 * @throws AppError 403 `forbidden` with `meta.reason: 'role_exceeds_actor'` and the role.
 */
export const assertRoleGrant = (ctx: AccessContext, grant: RoleGrant): void => {
  if (checkRoleGrant(accessFrom(ctx), grant)) return;
  throw new AppError(403, 'forbidden', 'warn', { entityType: grant.subject.entityType, meta: { reason: 'role_exceeds_actor', role: grant.role } });
};
