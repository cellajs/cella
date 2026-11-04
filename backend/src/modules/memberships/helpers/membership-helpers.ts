import {
  appConfig,
  hierarchy as appHierarchy,
  type ChannelEntityType,
  type ChannelIdColumns,
  type EntityHierarchy,
  type EntityRole,
  menuSections,
  type OrganizationRole,
  resolveHierarchy,
} from 'shared';
import type { MembershipEntity } from '#/lib/module';

/**
 * Role for an auto-created associated membership (menuStructure): the invited role carries over
 * when `carryRole` is set and valid, else the target vocabulary's least-privileged (last) role.
 */
export const resolveAssociatedMembershipRole = (
  channelType: string,
  invitedRole: string,
  carryRole = false,
  hierarchy: EntityHierarchy = appHierarchy,
): EntityRole => {
  const { hierarchy: resolved } = resolveHierarchy({ hierarchy });
  const carried = carryRole ? resolved.getRoles(channelType).find((role) => role === invitedRole) : undefined;
  return carried ?? resolved.getLeastPrivilegedRole(channelType);
};

/**
 * Role for the auto-created organization membership, from the source channel's `organizationRoles`
 * map. No implicit fallback: a channel that auto-creates organization rows must declare the complete
 * map (config-time validation makes a miss here a programming error, not a data-dependent one).
 */
export const resolveOrganizationMembershipRole = (
  sourceChannelType: string,
  invitedRole: string,
  hierarchy: EntityHierarchy = appHierarchy,
): OrganizationRole => {
  const explicit = resolveHierarchy({ hierarchy }).hierarchy.getOrganizationRole(sourceChannelType, invitedRole);
  if (explicit === undefined) {
    throw new Error(
      `insertMemberships: channel "${sourceChannelType}" declares no organizationRoles mapping for role "${invitedRole}"; ` +
        'explicit escalation is required to auto-create the organization membership row.',
    );
  }
  return explicit;
};

/** A channel's parent in `menuStructure`, whose membership one below it brings along. */
interface MenuParent<C extends string = ChannelEntityType> {
  channelType: C;
  carryRole: boolean;
}

/** The menu parent of a channel listed as a subentity in `menuStructure`; null for any other channel. */
export const findMenuParent = (channelType: string): MenuParent | null => {
  const relation = menuSections.find((section) => section.subentityType === channelType);
  if (!relation) return null;
  return { channelType: relation.entityType, carryRole: relation.carryRole === true };
};

/** A membership above a channel that a membership in it brings along. */
interface BroughtAlong<C extends string> {
  channelType: C | 'organization';
  channelId: string;
  role: EntityRole;
}

/**
 * The memberships above a channel that a membership in it at `role` brings along, inserted when the member lacks them:
 * the organization's, at the role the channel's `organizationRoles` names, and the menu parent's, at the role
 * `resolveAssociatedMembershipRole` gives it. A direct add and an accepted invitation both insert them.
 * @param hierarchy - Another hierarchy than the app's, for tests on a synthetic one.
 */
export const membershipsBroughtAlong = <C extends string = ChannelEntityType>(
  channel: { entityType: string; organizationId?: unknown } & Record<string, unknown>,
  role: string,
  menuParent: MenuParent<C> | null,
  hierarchy: EntityHierarchy = appHierarchy,
): BroughtAlong<C>[] => {
  const along: BroughtAlong<C>[] = [];
  if (channel.entityType !== 'organization' && typeof channel.organizationId === 'string') {
    const organizationRole = resolveOrganizationMembershipRole(channel.entityType, role, hierarchy);
    along.push({ channelType: 'organization', channelId: channel.organizationId, role: organizationRole });
  }
  const parentId = menuParent && channel[hierarchy.idColumnKeys[menuParent.channelType]];
  if (menuParent && typeof parentId === 'string') {
    const parentRole = resolveAssociatedMembershipRole(menuParent.channelType, role, menuParent.carryRole, hierarchy);
    along.push({ channelType: menuParent.channelType, channelId: parentId, role: parentRole });
  }
  return along;
};

/**
 * The channel id columns a membership of the entity carries: the entity's own id under its type's column, plus each one
 * the row holds, null for an ancestor level the row leaves empty.
 * @throws Error for a row below the organization without an `organizationId`: a partial row, since every channel table requires it.
 */
export const channelIdColumnsOf = (entity: MembershipEntity): { organizationId: string } & Partial<ChannelIdColumns> => {
  const columns: Partial<ChannelIdColumns> = {};
  for (const channelType of appConfig.channelEntityTypes) {
    const key = appConfig.entityIdColumnKeys[channelType];
    const value = entity.entityType === channelType ? entity.id : entity[key];
    if (typeof value === 'string' || value === null) columns[key] = value;
  }
  const { organizationId } = columns;
  if (!organizationId) throw new Error(`channelIdColumnsOf: ${entity.entityType} ${entity.id} carries no organizationId`);
  return { ...columns, organizationId };
};

/**
 * Whether an invitation to the channel waits for its publish: one to a draft channel is held, its mail unsent and its
 * invitee kept out, unless its role is one of the channel's prepare roles (`drafts.prepareRoles`), which go out at once.
 */
export const isHeldInvitation = (channelType: ChannelEntityType, channel: { publishedAt: string | null }, role: EntityRole) =>
  channel.publishedAt === null && !appHierarchy.getPrepareRoles(channelType).includes(role);
