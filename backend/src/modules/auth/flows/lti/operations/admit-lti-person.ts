import { buildSubjectFromEntity, type ChannelEntityType, checkAccess, hierarchy, type OrganizationRole } from 'shared';
import type { DbContext } from '#/core/context';
import type { ActorId, UserId } from '#/db/utils/ids';
import type { MembershipEntity } from '#/lib/module';
import { type LtiRoleFacts, ltiContextRole } from '#/modules/auth/flows/lti/lti-context-channel';
import { createLtiAccount, type LtiPerson, nameLtiAccount } from '#/modules/auth/flows/lti/operations/create-lti-account';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { resolveOrganizationMembershipRole } from '#/modules/memberships/helpers/membership-helpers';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import { findMembershipsByUserIdsAndChannel, updateMembershipRole } from '#/modules/memberships/memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { hasFreeSeats } from '#/modules/memberships/operations/organization-seats';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import { findIdentityBySubject, lockIdentityKey, updateIdentity } from '#/modules/user/identities-queries';
import { log } from '#/utils/logger';

/** A person's organization membership, when they hold a seat. */
type Seat = Pick<MembershipModel, 'id' | 'role'>;

interface AdmitLtiPersonOpts {
  connection: LtiConnection;
  organization: OrganizationModel;
  /** The tenant's member limit (`restrictions.quotas.user`); 0 for none. */
  memberQuota: number;
  person: LtiPerson;
  /** When a launch signed the person in; absent for an import. */
  signedInAt?: string;
  /** Who names an account (`nameLtiAccount`): the connection's service account for an import, the person for a launch. */
  by?: ActorId;
}

/**
 * The account of a person a platform names, under the lock of their `lti` identity (the connection's tenant, the
 * platform's issuer and `sub`) that a launch and an import of them both take. It is found by that identity, or made (`createLtiAccount`). A person
 * who holds no seat needs a free one under the tenant's member limit (`hasFreeSeats`). Both keep the email the
 * platform released on the identity, and a launch records the sign-in there, the proof that verifies it.
 * @returns The account and its seat; undefined when the person needs a seat and none is left, with nothing written.
 */
export const admitLtiPerson = async (
  ctx: DbContext,
  { connection, organization, memberQuota, person, signedInAt, by }: AdmitLtiPersonOpts,
): Promise<{ userId: UserId; seat?: Seat } | undefined> => {
  const key = { kind: 'lti', tenantId: connection.tenantId, provider: connection.issuer, subject: person.sub } as const;
  await lockIdentityKey(ctx, key);
  const identity = await findIdentityBySubject(ctx, key);
  const [seat] = identity ? await findMembershipsByUserIdsAndChannel(ctx, { userIds: [identity.userId], channelId: organization.id }) : [];
  if (!seat && !(await hasFreeSeats(ctx, { tenantId: organization.tenantId, organizationId: organization.id, quota: memberQuota }))) return;
  if (!identity) return { userId: await createLtiAccount(ctx, { connection, person, signedInAt }) };

  const email = person.email ?? null;
  const signIn = signedInAt ? { lastSignInAt: signedInAt, verifiedAt: identity.verifiedAt ?? signedInAt, connectionId: connection.id } : undefined;
  if (signIn || identity.email !== email) await updateIdentity(ctx, { id: identity.id, values: { ...signIn, email } });
  await nameLtiAccount(ctx, { userId: identity.userId, person, by: by ?? identity.userId });
  return { userId: identity.userId, seat };
};

/**
 * The role the app-owned `ltiContextRole` maps a person to in a channel of `channelType`. An answer that is no role of
 * that type, such as a course role's name for the organization, gives its least privileged role and a warning.
 */
export const ltiRoleIn = (channelType: ChannelEntityType, facts: Omit<LtiRoleFacts, 'channelType'>): MembershipModel['role'] => {
  const role = ltiContextRole({ ...facts, channelType });
  const roles: readonly string[] = hierarchy.getRoles(channelType);
  if (roles.includes(role)) return role;
  log.warn('LTI role mapping answered no role of the channel type', { channelType, role, connectionId: facts.connection.id });
  return hierarchy.getLeastPrivilegedRole(channelType);
};

/** The organization role a person gets for `role`: the highest at or below it that may not update the organization. */
const belowOrganizationUpdate = (organization: OrganizationModel, userId: UserId, role: string): OrganizationRole => {
  const roles = hierarchy.getRoles('organization');
  const names: readonly string[] = roles;
  const subject = buildSubjectFromEntity('organization', organization);
  const mayUpdate = (candidate: OrganizationRole) =>
    checkAccess(
      { actorId: userId, scopes: null, memberships: [{ channelType: 'organization', channelId: organization.id, role: candidate }] },
      'update',
      subject,
    ).allowed;
  const from = names.indexOf(role);
  return (from < 0 ? undefined : roles.slice(from).find((candidate) => !mayUpdate(candidate))) ?? hierarchy.getLeastPrivilegedRole('organization');
};

interface ApplyLtiRoleOpts {
  organization: OrganizationModel;
  /** The context's channel: the organization, or a channel below it. */
  channel: MembershipEntity;
  userId: UserId;
  seat: Seat | undefined;
  /** The role `ltiRoleIn` maps the person to in the channel. */
  role: MembershipModel['role'];
  by: ActorId;
}

/**
 * Gives a person the role a launch or an import maps them to in the context's channel. A role in a channel below the
 * organization follows the platform up and down. An organization role only goes up, and never to one that may update
 * the organization (`belowOrganizationUpdate`): a platform's administrator administers the platform, not this
 * organization. A person without a seat is seated first at such a role: the channel's membership then brings along
 * no organization membership above it.
 */
export const applyLtiRole = async (ctx: DbContext, { organization, channel, userId, seat, role, by }: ApplyLtiRoleOpts) => {
  const organizationRole = belowOrganizationUpdate(
    organization,
    userId,
    channel.entityType === 'organization' ? role : resolveOrganizationMembershipRole(channel.entityType, role),
  );
  if (!seat) await insertMemberships(ctx, { items: [{ userId, role: organizationRole, entity: organization, createdBy: by }] });
  else if (channel.entityType === 'organization' && hierarchy.outranks('organization', organizationRole, seat.role))
    await updateMembershipRole(ctx, { id: seat.id, role: organizationRole, by });
  if (channel.entityType === 'organization') return;

  const [membership] = await findMembershipsByUserIdsAndChannel(ctx, { userIds: [userId], channelId: channel.id });
  if (!membership) await insertMemberships(ctx, { items: [{ userId, role, entity: channel, createdBy: by }] });
  else if (membership.role !== role) await updateMembershipRole(ctx, { id: membership.id, role, by });
};
