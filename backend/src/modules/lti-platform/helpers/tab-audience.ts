import { buildSubjectFromEntity, type ChannelEntityType, checkAccess } from 'shared';
import type { ActorBinding } from '#/core/context';
import type { LtiAudience } from '#/modules/lti-platform/lti-resource-links-db';
import { accessFrom, membershipActorVars } from '#/permissions/access';

/** A person as a tab's audience judges them: their own memberships, no system admin power and no token mask. */
export interface TabOpener {
  personId: string;
  memberships: ActorBinding[];
}

/**
 * Whether a tab of `audience` in a channel opens for a person: `members` takes a membership row in that channel itself,
 * which power over it from elsewhere never replaces; `editors` takes update on it, as the permission engine decides.
 * An audience the code does not know opens for nobody. The one check the tab list, the start of a launch and the
 * launch itself make, beside whether the tab opens at all (`ltiTabClosure`).
 */
export const opensFor = (
  audience: LtiAudience,
  { personId, memberships }: TabOpener,
  channelType: ChannelEntityType,
  channel: Parameters<typeof buildSubjectFromEntity>[1],
) => {
  switch (audience) {
    case 'members':
      return memberships.some((membership) => membership.channelId === channel.id);
    case 'editors': {
      const access = accessFrom({ var: membershipActorVars(personId, memberships) });
      return checkAccess(access, 'update', buildSubjectFromEntity(channelType, channel)).allowed;
    }
    default:
      return false;
  }
};
