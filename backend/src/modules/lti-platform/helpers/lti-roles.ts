import { buildSubjectFromEntity, type ChannelEntityType, checkAccess, type EntityActionType } from 'shared';
import type { ActorBinding } from '#/core/context';
import { ltiInstitutionRolesFor, ltiRolesFor } from '#/modules/lti-platform/launch-context';
import { accessFrom } from '#/permissions/access';
import type { EntityModel } from '#/tables';

/** What the permission engine lets a person do in a channel through one membership row alone. */
const canThrough = (personId: string, membership: ActorBinding, channelType: ChannelEntityType, channel: { id: string }) => {
  const access = accessFrom({ var: { actor: { id: personId, bindings: [membership], scopes: null }, isSystemAdmin: false } });
  const subject = buildSubjectFromEntity(channelType, channel);
  return (action: EntityActionType) => checkAccess(access, action, subject).allowed;
};

/**
 * A person's LTI context roles in a channel, as the app-owned `ltiRolesFor` maps what their membership there lets them
 * do: an organization admin who is a course's student goes there as its student. A launch and a member row send the
 * same roles.
 * @returns No role without a membership in the channel.
 */
export const ltiRolesIn = (
  personId: string,
  membership: ActorBinding | undefined,
  channelType: ChannelEntityType,
  channel: EntityModel<ChannelEntityType>,
) => (membership ? ltiRolesFor(channelType, canThrough(personId, membership, channelType, channel)) : []);

/** A person's LIS institution roles, as the app-owned `ltiInstitutionRolesFor` maps what their organization membership lets them do. */
export const ltiInstitutionRolesIn = (personId: string, membership: ActorBinding | undefined, organizationId: string) =>
  ltiInstitutionRolesFor(membership ? canThrough(personId, membership, 'organization', { id: organizationId }) : () => false);
