import { afterEach, beforeEach } from 'vitest';
import { hierarchy } from '../../config/config.default.ts';
import { policyMatrix } from '../../config/permissions-config.ts';
import type { ChannelEntityType, EntityType } from '../../types.ts';
import { getEntityPolicies, getPolicyPermissions } from '../permissions/policy-matrix.ts';
import type { EntityActionPermissions } from '../permissions/types.ts';

/**
 * The role a suite's plain member holds in a channel below the organization: the least privileged of its type that reads
 * the channel and, where `entityType` may home, creates it there. Undefined when no role of the type does both.
 */
export const memberRoleIn = (channelType: ChannelEntityType, entityType: EntityType = 'attachment') => {
  const isHome = hierarchy.possibleHomeChannels(entityType).includes(channelType);
  const grants = (type: EntityType, action: 'read' | 'create', role: string) =>
    getPolicyPermissions(getEntityPolicies(policyMatrix, type), channelType, role)?.[action] === 1;
  return [...hierarchy.getRoles(channelType)]
    .reverse()
    .find((role) => grants(channelType, 'read', role) && (!isHome || grants(entityType, 'create', role)));
};

/**
 * A suite calls this at its top to declare the member's attachment policy its assertions assume: the organization
 * member's, and in each channel below the organization that homes attachments, that of the role `memberRoleIn` names,
 * which `joinAttachmentHome` gives a member when the organization role is not elevated.
 */
export function assumeMemberAttachmentPolicy(permissions: Partial<EntityActionPermissions>) {
  const memberRole = hierarchy.getDefaultRole('organization');
  const policies = getEntityPolicies(policyMatrix, 'attachment');
  const homes = hierarchy.possibleHomeChannels('attachment').filter((channelType) => channelType !== 'organization');
  const assumed = [
    getPolicyPermissions(policies, 'organization', memberRole),
    ...homes.map((channelType) => {
      const role = memberRoleIn(channelType);
      return role && getPolicyPermissions(policies, channelType, role);
    }),
  ].filter((policy) => policy !== undefined);
  let configured: EntityActionPermissions[] = [];
  beforeEach(() => {
    configured = assumed.map((policy) => ({ ...policy }));
    for (const policy of assumed) Object.assign(policy, permissions);
  });
  afterEach(() => {
    assumed.forEach((policy, index) => {
      const original = configured[index];
      if (original) Object.assign(policy, original);
    });
    configured = [];
  });
}
