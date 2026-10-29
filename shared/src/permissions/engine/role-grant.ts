import { resolveHierarchy } from './resolve-hierarchy.ts';
import type { AccessMembership, PermissionCheckOptions, SubjectForPermission } from './types.ts';

/** A role handed out on a channel subject: `update` grants it, `delete` removes a member who holds it. */
export interface RoleGrant {
  subject: SubjectForPermission;
  role: string;
  action: 'update' | 'delete';
}

/**
 * Whether the actor may hand out a role on a channel. A system admin and the channel's least-privileged role always
 * pass. Any other role may not outrank the actor's own role on the channel (`outranks`), unless the action reaches
 * the channel from an ancestor's grant, which hands out every role of the channel.
 * @param allows - Whether a set of the actor's memberships allows the grant's action on its subject: the engine's
 * decision, which `checkRoleGrant` computes.
 */
export const mayGrantRole = <T extends AccessMembership>(
  memberships: T[],
  { subject, role }: RoleGrant,
  allows: (memberships: T[]) => boolean,
  options: PermissionCheckOptions = {},
): boolean => {
  if (options.isSystemAdmin === true) return true;

  const { hierarchy } = resolveHierarchy(options);
  const channelType = subject.entityType;
  const onChannel = (membership: T) => membership.channelType === channelType && membership.channelId === subject.id;
  const ownRole = memberships.find(onChannel)?.role ?? null;
  if (role === hierarchy.getLeastPrivilegedRole(channelType) || !hierarchy.outranks(channelType, role, ownRole)) return true;

  // Without the actor's rows on the channel, whatever still allows the action comes from an ancestor.
  return allows(memberships.filter((membership) => !onChannel(membership)));
};
