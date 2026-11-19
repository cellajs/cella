import { buildSubjectFromEntity, type ChannelEntityType, checkAccess, type EntityActionType } from 'shared';
import type { ActorBinding } from '#/core/context';
import { linkContext } from '#/modules/lti-platform/helpers/context-channel';
import { ltiInstitutionRolesFor, ltiRolesFor } from '#/modules/lti-platform/launch-context';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';
import { accessFrom, ownActor } from '#/permissions/access';

/** A channel as the permission engine reads it: its id and the id columns above it. */
type ChannelRow = Parameters<typeof buildSubjectFromEntity>[1];

/** What the permission engine lets a person do in a channel, judged by `memberships` alone. */
const canIn = (personId: string, memberships: ActorBinding[], channelType: ChannelEntityType, channel: ChannelRow) => {
  const access = accessFrom({ var: ownActor(personId, memberships) });
  const subject = buildSubjectFromEntity(channelType, channel);
  return (action: EntityActionType) => checkAccess(access, action, subject).allowed;
};

/**
 * A member's LTI context roles in a channel, as the app-owned `ltiRolesFor` maps what their membership there lets them
 * do, judged alone: power that reaches them from above changes nothing. A member row and a launch of a tab for its
 * members send the same roles.
 * @returns No role without a membership in the channel.
 */
export const ltiRolesIn = (personId: string, membership: ActorBinding | undefined, channelType: ChannelEntityType, channel: ChannelRow) =>
  membership ? ltiRolesFor(channelType, canIn(personId, [membership], channelType, channel), membership.role) : [];

interface LtiLaunchRolesOpts {
  personId: string;
  /** The person's memberships, read at the launch. */
  memberships: ActorBinding[];
  link: Pick<LtiResourceLinkModel, 'channelType' | 'channelId' | 'organizationId' | 'audience'>;
  channel: ChannelRow;
}

/**
 * The LTI roles a launch of a resource link sends, judged as its audience admitted the person. In a channel that is an
 * LTI context: on a tab for its members, the context roles their one membership there gives (`ltiRolesIn`); on a tab
 * for its editors, those all they hold gives them there, with or without a membership. On every launch: the
 * institution roles their organization membership gives (`ltiInstitutionRolesFor`).
 */
export const ltiLaunchRoles = ({ personId, memberships, link, channel }: LtiLaunchRolesOpts) => {
  const membershipIn = (channelId: string) => memberships.find((membership) => membership.channelId === channelId);
  const membership = membershipIn(link.channelId);
  const contextRoles = !linkContext(link)
    ? []
    : link.audience === 'members'
      ? ltiRolesIn(personId, membership, link.channelType, channel)
      : ltiRolesFor(link.channelType, canIn(personId, memberships, link.channelType, channel), membership?.role ?? null);
  const organizationMembership = membershipIn(link.organizationId);
  const can = organizationMembership && canIn(personId, [organizationMembership], 'organization', { id: link.organizationId });
  return [...contextRoles, ...ltiInstitutionRolesFor(can ?? (() => false), organizationMembership?.role ?? null)];
};
