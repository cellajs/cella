import { appConfig, buildSubjectFromEntity, type ChannelEntityType, checkAccess, type EntityActionType, hierarchy } from 'shared';
import type { ActorBinding } from '#/core/context';
import { isLisRole } from '#/lib/lti-vocabulary';
import { linkContext } from '#/modules/lti-platform/helpers/context-channel';
import { ltiContextTypes, ltiInstitutionRolesFor, ltiRolesFor } from '#/modules/lti-platform/launch-context';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';
import { accessFrom, membershipActorVars } from '#/permissions/access';

/** Every `can` an app-owned role answer may get: one per subset of the entity actions. */
const everyCan = Array.from(
  { length: 2 ** appConfig.entityActions.length },
  (_, allowed) => (action: EntityActionType) => (allowed & (1 << appConfig.entityActions.indexOf(action))) !== 0,
);

/**
 * Refuses at load an app-owned answer that would send roles without a LIS role, which a list that is not empty must
 * hold (LTI Core 1.3, section 5.3.7). Each answer can go out alone: the context roles in a member row, the institution
 * roles in a launch without a context. Both functions are asked every input they can get: an app meets a wrong answer
 * when the backend starts, before any launch.
 * @throws Error naming the function and the input it answered wrongly.
 */
const assertSendsLisRoles = () => {
  const check = (roles: string[], answer: string, can: (action: EntityActionType) => boolean) => {
    if (!roles.length || roles.some(isLisRole)) return;
    const allowed = appConfig.entityActions.filter(can).join(', ') || 'nothing';
    throw new Error(`${answer} with ${allowed} allowed sends ${roles.join(', ')}: a list of LTI roles holds a LIS role (LTI Core 1.3, 5.3.7)`);
  };
  for (const channelType of appConfig.channelEntityTypes.filter((type) => ltiContextTypes(type))) {
    for (const role of [...hierarchy.getRoles(channelType), null])
      for (const can of everyCan) check(ltiRolesFor(channelType, can, role), `ltiRolesFor(${channelType}, ${role})`, can);
  }
  for (const role of [...hierarchy.getRoles('organization'), null])
    for (const can of everyCan) check(ltiInstitutionRolesFor(can, role), `ltiInstitutionRolesFor(${role})`, can);
};

assertSendsLisRoles();

/** A channel as the permission engine reads it: its id and the id columns above it. */
type ChannelRow = Parameters<typeof buildSubjectFromEntity>[1];

/** What the permission engine lets a person do in a channel, judged by `memberships` alone. */
const canIn = (personId: string, memberships: ActorBinding[], channelType: ChannelEntityType, channel: ChannelRow) => {
  const access = accessFrom({ var: membershipActorVars(personId, memberships) });
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
