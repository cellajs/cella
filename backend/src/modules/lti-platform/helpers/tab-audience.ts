import { buildSubjectFromEntity, type ChannelEntityType, checkAccess } from 'shared';
import type { ActorBinding } from '#/core/context';
import type { LtiAudience } from '#/modules/lti-platform/lti-resource-links-db';
import { accessFrom } from '#/permissions/access';
import type { EntityModel } from '#/tables';

/** A person as a tab's audience judges them: their own memberships, no system admin power and no token mask. */
export interface TabOpener {
  personId: string;
  memberships: ActorBinding[];
}

/**
 * Whether a tab of `audience` in a channel opens for a person: `members` takes a membership row in that channel itself,
 * which power over it from elsewhere never replaces; `editors` takes update on it, as the permission engine decides,
 * whatever its archived state. The one check the tab list, the start of a launch and the launch itself make.
 */
export const opensFor = (
  audience: LtiAudience,
  { personId, memberships }: TabOpener,
  channelType: ChannelEntityType,
  channel: EntityModel<ChannelEntityType>,
) => {
  if (audience === 'members') return memberships.some((membership) => membership.channelId === channel.id);
  const access = accessFrom({ var: { actor: { id: personId, bindings: memberships, scopes: null }, isSystemAdmin: false } });
  return checkAccess(access, 'update', buildSubjectFromEntity(channelType, channel)).allowed;
};
