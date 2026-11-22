import {
  buildSubjectFromEntity,
  type ChannelEntityType,
  checkAccess,
  type EntityHierarchy,
  type EntityType,
  getEntityPolicies,
  getPolicyPermissions,
  hierarchy,
  isStrategyEnabled,
  type OrganizationRole,
  type PolicyMatrix,
  policyMatrix,
  type RestrictionCap,
  resolveHierarchy,
} from 'shared';
import type { DbContext } from '#/core/context';
import type { ActorId, UserId } from '#/db/utils/ids';
import type { MembershipEntity } from '#/lib/module';
import { type LtiRoleFacts, ltiContextRole } from '#/modules/auth/flows/lti/lti-context-channel';
import { type LtiAdmission, recordLtiContextMemberships } from '#/modules/auth/flows/lti/lti-contexts-queries';
import { createLtiAccount, type LtiPerson, ltiKeptEmail, nameLtiAccount } from '#/modules/auth/flows/lti/operations/create-lti-account';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { resolveOrganizationMembershipRole } from '#/modules/memberships/helpers/membership-helpers';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import { findMembershipsByUserIdsAndChannel, updateMembershipRole } from '#/modules/memberships/memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { hasFreeSeats } from '#/modules/memberships/operations/organization-seats';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import { findIdentityBySubject, lockIdentityKey, updateIdentity } from '#/modules/user/identities-queries';
import { accessFrom, membershipActorVars } from '#/permissions/access';
import { log } from '#/utils/logger';

/**
 * Refuses at load an organization role that a membership of a channel below the organization brings along, when it is
 * elevated or grants anything at the organization on `user` or on a channel type below it: a launch there opens that
 * channel and nothing else of the organization. A product homed at the organization itself is not judged: that stays
 * the app's choice.
 * @throws Error naming the channel type, its role, the organization role and each cell that grants.
 */
export const assertBroughtAlongRolesOpenNothing = (entityHierarchy: EntityHierarchy = hierarchy, policies: PolicyMatrix = policyMatrix) => {
  const { hierarchy: resolved, channelEntityTypes } = resolveHierarchy({ hierarchy: entityHierarchy });
  const below = channelEntityTypes.filter((type) => type !== 'organization');
  const judged: EntityType[] = ['user', ...below];
  for (const channelType of below) {
    for (const role of resolved.getRoles(channelType)) {
      const organizationRole = resolved.getOrganizationRole(channelType, role);
      if (organizationRole === undefined) continue;
      const refusal = (opens: string) =>
        new Error(
          `LTI tool: channel "${channelType}" maps role "${role}" to organization role "${organizationRole}", which ${opens}. ` +
            'Map every role below the organization to an organization role that is not elevated and grants nothing on user or on the channels below it.',
        );
      if (resolved.elevatedGrants.has(`organization:${organizationRole}`)) throw refusal('is elevated');
      const grants = judged.flatMap((type) =>
        Object.entries(getPolicyPermissions(getEntityPolicies(policies, type), 'organization', organizationRole) ?? {})
          .filter(([, cell]) => cell !== 0)
          .map(([action, cell]) => `${type}.${action} = ${cell}`),
      );
      if (grants.length) throw refusal(`grants ${grants.join(', ')} at the organization`);
    }
  }
};

if (isStrategyEnabled('lti')) assertBroughtAlongRolesOpenNothing();

/** A person's organization membership, when they hold a seat. */
type Seat = Pick<MembershipModel, 'id' | 'role'>;

/** Who a platform names, as the connection's tenant knows them: its `lti` identity and its organization seat. */
interface LtiPersonOpts {
  connection: LtiConnection;
  organization: OrganizationModel;
  person: LtiPerson;
}

/**
 * The `lti` identity of a person a platform names (the connection's tenant, the platform's issuer and `sub`), under the
 * lock that a launch and an import of them both take, and their seat in the organization.
 */
const lockLtiPerson = async (ctx: DbContext, { connection, organization, person }: LtiPersonOpts) => {
  const key = { kind: 'lti', tenantId: connection.tenantId, provider: connection.issuer, subject: person.sub } as const;
  await lockIdentityKey(ctx, key);
  const identity = await findIdentityBySubject(ctx, key);
  const [seat] = identity ? await findMembershipsByUserIdsAndChannel(ctx, { userIds: [identity.userId], channelId: organization.id }) : [];
  return { identity, seat };
};

type LtiIdentity = NonNullable<Awaited<ReturnType<typeof lockLtiPerson>>['identity']>;

/**
 * Keeps the email the platform released on the identity while the app asks for one (`ltiKeptEmail`), else clears it,
 * records a launch's sign-in there, the proof that verifies it, and names the account.
 */
const updateLtiPerson = async (
  ctx: DbContext,
  identity: LtiIdentity,
  { connection, person, signedInAt, by }: { connection: LtiConnection; person: LtiPerson; signedInAt?: string; by: ActorId },
) => {
  const email = ltiKeptEmail(person);
  const signIn = signedInAt ? { lastSignInAt: signedInAt, verifiedAt: identity.verifiedAt ?? signedInAt, connectionId: connection.id } : undefined;
  if (signIn || identity.email !== email) await updateIdentity(ctx, { id: identity.id, values: { ...signIn, email } });
  await nameLtiAccount(ctx, { userId: identity.userId, person, by });
};

interface AdmitLtiPersonOpts extends LtiPersonOpts {
  /** The tenant's member limit (`restrictions.quotas.user`). */
  memberQuota: RestrictionCap;
  /** When a launch signed the person in; absent for an import. */
  signedInAt?: string;
  /** Who names an account (`nameLtiAccount`): the connection's service account for an import, the person for a launch. */
  by?: ActorId;
}

/**
 * The account of a person a platform names, found by their `lti` identity (`lockLtiPerson`) or made
 * (`createLtiAccount`). A person who holds no seat needs a free one under the tenant's member limit (`hasFreeSeats`).
 * @returns The account and its seat; undefined when the person needs a seat and none is left, with nothing written.
 */
export const admitLtiPerson = async (
  ctx: DbContext,
  { connection, organization, memberQuota, person, signedInAt, by }: AdmitLtiPersonOpts,
): Promise<{ userId: UserId; seat?: Seat } | undefined> => {
  const { identity, seat } = await lockLtiPerson(ctx, { connection, organization, person });
  if (!seat && !(await hasFreeSeats(ctx, { tenantId: organization.tenantId, organizationId: organization.id, quota: memberQuota }))) return;
  if (!identity) return { userId: await createLtiAccount(ctx, { connection, person, signedInAt }) };
  await updateLtiPerson(ctx, identity, { connection, person, signedInAt, by: by ?? identity.userId });
  return { userId: identity.userId, seat };
};

/**
 * The account of a person the tenant's tie to the platform knows as a member of the organization: an `lti` identity of
 * the tenant and issuer, from an earlier launch in a context or an import, whose account holds a seat. A launch without
 * a context signs only them in: it records the sign-in and writes no membership, role or seat.
 * @returns The account; undefined for anyone else, with nothing written.
 */
export const signInKnownLtiMember = async (ctx: DbContext, opts: LtiPersonOpts & { signedInAt: string }) => {
  const { identity, seat } = await lockLtiPerson(ctx, opts);
  if (!identity || !seat) return;
  await updateLtiPerson(ctx, identity, { ...opts, by: identity.userId });
  return identity.userId;
};

/**
 * The role the app-owned `ltiContextRole` maps a person to in a channel of `channelType`, null for none. An answer that
 * is no role of that type, such as a course role's name for the organization, gives its least privileged role and a
 * warning.
 */
export const ltiRoleIn = (channelType: ChannelEntityType, facts: Omit<LtiRoleFacts, 'channelType'>): MembershipModel['role'] | null => {
  const role = ltiContextRole({ ...facts, channelType });
  if (role === null) return null;
  const roles: readonly string[] = hierarchy.getRoles(channelType);
  if (roles.includes(role)) return role;
  log.warn('LTI role mapping answered no role of the channel type', { channelType, role, connectionId: facts.connection.id });
  return hierarchy.getLeastPrivilegedRole(channelType);
};

/** Whether an organization membership at `role` may update the organization, as the permission engine judges the role alone. */
export const mayUpdateOrganization = (organization: OrganizationModel, userId: string, role: OrganizationRole) =>
  checkAccess(
    accessFrom({
      var: membershipActorVars(userId, [{ channelType: 'organization', channelId: organization.id, organizationId: organization.id, role }]),
    }),
    'update',
    buildSubjectFromEntity('organization', organization),
  ).allowed;

/** The organization role a person gets for `role`: the highest at or below it that may not update the organization. */
const belowOrganizationUpdate = (organization: OrganizationModel, userId: UserId, role: string): OrganizationRole => {
  const roles = hierarchy.getRoles('organization');
  const names: readonly string[] = roles;
  const from = names.indexOf(role);
  return (
    (from < 0 ? undefined : roles.slice(from).find((candidate) => !mayUpdateOrganization(organization, userId, candidate))) ??
    hierarchy.getLeastPrivilegedRole('organization')
  );
};

interface ApplyLtiRoleOpts {
  organization: OrganizationModel;
  /** The context's row: it records the memberships it gives (`recordLtiContextMemberships`). */
  contextId: string;
  /** True for an import, whose list holds the person; false for a launch. */
  listed: boolean;
  /** The context's channel: the organization, or a channel below it. */
  channel: MembershipEntity;
  userId: UserId;
  seat: Seat | undefined;
  /** The role `ltiRoleIn` maps the person to in the channel. */
  role: MembershipModel['role'];
  by: ActorId;
}

/**
 * Gives a person the role a launch or an import maps them to in the context's channel, and records the seat and the
 * channel's membership as the context's where it made them or a context recorded them. A parent membership the
 * channel's brings along gets no record. A role in a channel below the organization follows the platform up and down.
 * An organization role only goes up, and never to one that may update the organization (`belowOrganizationUpdate`): a
 * platform's administrator administers the platform, not this organization. A person without a seat is seated first
 * at such a role: the channel's membership then brings along no organization membership above it.
 */
export const applyLtiRole = async (ctx: DbContext, { organization, contextId, listed, channel, userId, seat, role, by }: ApplyLtiRoleOpts) => {
  const organizationRole = belowOrganizationUpdate(
    organization,
    userId,
    channel.entityType === 'organization' ? role : resolveOrganizationMembershipRole(channel.entityType, role),
  );
  const admissions: LtiAdmission[] = [];
  if (!seat) {
    const [made] = await insertMemberships(ctx, { items: [{ userId, role: organizationRole, entity: organization, createdBy: by }] });
    admissions.push({ id: made.id, created: true });
  } else {
    if (channel.entityType === 'organization' && hierarchy.outranks('organization', organizationRole, seat.role))
      await updateMembershipRole(ctx, { id: seat.id, role: organizationRole, by });
    admissions.push({ id: seat.id, created: false });
  }

  if (channel.entityType !== 'organization') {
    const [membership] = await findMembershipsByUserIdsAndChannel(ctx, { userIds: [userId], channelId: channel.id });
    if (!membership) {
      const [made] = await insertMemberships(ctx, { items: [{ userId, role, entity: channel, createdBy: by }] });
      admissions.push({ id: made.id, created: true });
    } else {
      if (membership.role !== role) await updateMembershipRole(ctx, { id: membership.id, role, by });
      admissions.push({ id: membership.id, created: false });
    }
  }
  await recordLtiContextMemberships(ctx, { contextId, userId, admissions, listed, by });
};
