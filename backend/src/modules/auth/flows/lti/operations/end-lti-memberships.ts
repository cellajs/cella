import { hierarchy, type OrganizationRole } from 'shared';
import type { DbContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import type { LtiMember } from '#/modules/auth/flows/lti/helpers/platform-memberships';
import type { LtiContextModel } from '#/modules/auth/flows/lti/lti-contexts-db';
import { findLtiContextPeopleBefore, releaseLtiContextMemberships } from '#/modules/auth/flows/lti/lti-contexts-queries';
import { mayUpdateOrganization } from '#/modules/auth/flows/lti/operations/admit-lti-person';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { holdConnection } from '#/modules/connections/connections-queries';
import { deleteLoneOrganizationMembership, deleteMembershipsByIds } from '#/modules/memberships/memberships-queries';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import { lockIdentityKey } from '#/modules/user/identities-queries';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

/** The context whose list was read, through which connection, and the organization it belongs to. */
interface ListedContext {
  connection: LtiConnection;
  context: LtiContextModel;
  organization: OrganizationModel;
}

/** A person the context gave memberships, by their account and the subject its platform knows them by. */
type Person = { userId: string; subject: string };

const organizationRoles: readonly string[] = hierarchy.getRoles('organization');
const isOrganizationRole = (role: string): role is OrganizationRole => organizationRoles.includes(role);

/**
 * Ends what only the context gave one person after a list of it held them, under the lock a launch and an import of
 * them take. The seat goes too when the person holds nothing else in the organization and its role may not update the
 * organization: only the app gives such a role. A seat that stays keeps its record, and a later import tries again.
 * @returns Whether a membership ended; `connection_gone` once the connection was deleted, with nothing written.
 */
const endPersonLtiMemberships = async (ctx: DbContext, { connection, context, organization }: ListedContext, person: Person, before: string) => {
  if (!(await holdConnection(ctx, { id: connection.id }))) return 'connection_gone';
  await lockIdentityKey(ctx, { kind: 'lti', tenantId: connection.tenantId, provider: connection.issuer, subject: person.subject });
  const ending = await releaseLtiContextMemberships(ctx, { contextId: context.id, userId: person.userId, before });

  const below = ending.filter(({ channelType }) => channelType !== 'organization').map(({ id }) => id);
  if (below.length) await deleteMembershipsByIds({ var: { db: ctx.var.db, organizationId: organization.id } }, { ids: below });
  const seat = ending.find(({ channelType }) => channelType === 'organization');
  const seatEnds =
    seat && isOrganizationRole(seat.role) && !mayUpdateOrganization(organization, person.userId, seat.role)
      ? await deleteLoneOrganizationMembership(ctx, { id: seat.id, role: seat.role })
      : false;
  if (!below.length && !seatEnds) return false;
  log.info('LTI memberships ended', { contextId: context.id, userId: person.userId, count: below.length + (seatEnds ? 1 : 0) });
  return true;
};

interface EndUnlistedOpts {
  /** Every person a complete read of the context's members listed as active. */
  listed: LtiMember[];
  /** When the read began: a launch or an import that admitted someone since keeps what it gave. */
  before: string;
  signal?: AbortSignal;
}

/**
 * Ends the memberships an LTI context gave the people an earlier list held and a complete read of its members no
 * longer lists as active: a list takes away only what a list held. A person who holds a membership another way, by
 * another context or by a launch alone keeps it. Each person goes in a transaction of their own, and the next launch
 * or import admits them again by the ordinary rules.
 * @returns `connection_gone` once the connection was deleted, before the next person; `done` otherwise.
 * @throws An abort of `signal` before the next person.
 */
export const endUnlistedLtiMemberships = async (target: ListedContext, { listed, before, signal }: EndUnlistedOpts) => {
  const subjects = new Set(listed.map(({ user_id }) => user_id));
  const people = (await findLtiContextPeopleBefore(dbCtx, { context: target.context, before })).filter(({ subject }) => !subjects.has(subject));
  for (const person of people) {
    signal?.throwIfAborted();
    const ended = await baseDb.transaction((tx) => endPersonLtiMemberships({ var: { db: tx } }, target, person, before));
    if (ended === 'connection_gone') return ended;
    if (ended) invalidateCache.user(person.userId);
  }
  return 'done';
};
