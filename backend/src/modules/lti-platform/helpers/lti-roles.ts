import { buildSubjectFromEntity, type ChannelEntityType, checkAccess, type EntityActionType } from 'shared';
import type { ActorBinding } from '#/core/context';
import { lisContextRoles } from '#/lib/lti-vocabulary';
import { linkContext } from '#/modules/lti-platform/helpers/context-channel';
import { ltiInstitutionRolesFor, ltiRolesFor } from '#/modules/lti-platform/launch-context';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';
import { accessFrom } from '#/permissions/access';

/** A channel as the permission engine reads it: its id and the id columns above it. */
type ChannelRow = Parameters<typeof buildSubjectFromEntity>[1];

/** What the permission engine lets a person do in a channel through one membership row alone. */
const canThrough = (personId: string, membership: ActorBinding, channelType: ChannelEntityType, channel: ChannelRow) => {
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
export const ltiRolesIn = (personId: string, membership: ActorBinding | undefined, channelType: ChannelEntityType, channel: ChannelRow) =>
  membership ? ltiRolesFor(channelType, canThrough(personId, membership, channelType, channel)) : [];

interface LtiLaunchRolesOpts {
  personId: string;
  /** The person's memberships, read at the launch. */
  memberships: ActorBinding[];
  link: Pick<LtiResourceLinkModel, 'channelType' | 'channelId' | 'organizationId'>;
  channel: ChannelRow;
}

/**
 * The LTI roles a launch of a resource link sends. In a channel that is an LTI context: the person's context roles from
 * their membership there (`ltiRolesIn`), or, without one, the LIS context role Administrator, someone who manages the
 * context without being part of it, as only a tab for its editors lets in. On every launch: institution roles from the
 * person's organization membership, as the app-owned `ltiInstitutionRolesFor` maps what it lets them do.
 */
export const ltiLaunchRoles = ({ personId, memberships, link, channel }: LtiLaunchRolesOpts) => {
  const membershipIn = (channelId: string) => memberships.find((membership) => membership.channelId === channelId);
  const membership = membershipIn(link.channelId);
  const contextRoles = !linkContext(link)
    ? []
    : membership
      ? ltiRolesIn(personId, membership, link.channelType, channel)
      : [lisContextRoles.administrator];
  const organizationMembership = membershipIn(link.organizationId);
  const can = organizationMembership && canThrough(personId, organizationMembership, 'organization', { id: link.organizationId });
  return [...contextRoles, ...ltiInstitutionRolesFor(can ?? (() => false))];
};
