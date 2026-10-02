import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import type { EntityModel } from '#/tables';

/**
 * Role for an auto-created associated membership (menuStructure): the invited role carries over
 * when `carryRole` is set and valid, else the target vocabulary's least-privileged (last) role.
 */
export const resolveAssociatedMembershipRole = (
  channelType: ChannelEntityType,
  invitedRole: MembershipModel['role'],
  carryRole = false,
): MembershipModel['role'] => {
  const channelRoles = hierarchy.getRoles(channelType) as readonly MembershipModel['role'][];
  if (carryRole && channelRoles.includes(invitedRole)) return invitedRole;
  return hierarchy.getLeastPrivilegedRole(channelType) as MembershipModel['role'];
};

/**
 * Role for the auto-created organization membership, from the source channel's `organizationRoles`
 * map. No implicit fallback: a channel that auto-creates organization rows must declare the complete
 * map (config-time validation makes a miss here a programming error, not a data-dependent one).
 */
export const resolveOrganizationMembershipRole = (
  sourceChannelType: ChannelEntityType,
  invitedRole: MembershipModel['role'],
): MembershipModel['role'] => {
  const explicit = hierarchy.getOrganizationRole(sourceChannelType, invitedRole) as MembershipModel['role'] | undefined;
  if (explicit === undefined) {
    throw new Error(
      `insertMemberships: channel "${sourceChannelType}" declares no organizationRoles mapping for role "${invitedRole}"; ` +
        'explicit escalation is required to auto-create the organization membership row.',
    );
  }
  return explicit;
};

/** Maps a channel entity to its ancestor channel IDs, keyed by `appConfig.entityIdColumnKeys`. */
export const getMembershipEntityIds = <T extends ChannelEntityType>(entity: EntityModel<T>) => {
  return appConfig.channelEntityTypes.reduce(
    (acc, channelEntityType) => {
      const entityFieldIdName = appConfig.entityIdColumnKeys[channelEntityType];
      if (!entityFieldIdName) return acc;

      if (entity.entityType === channelEntityType) {
        acc[entityFieldIdName] = entity.id;
      }
      if (entityFieldIdName in entity) {
        acc[entityFieldIdName] = entity[entityFieldIdName as keyof typeof entity] as string;
      }

      return acc;
    },
    {} as Record<(typeof appConfig.entityIdColumnKeys)[ChannelEntityType], string>,
  );
};
