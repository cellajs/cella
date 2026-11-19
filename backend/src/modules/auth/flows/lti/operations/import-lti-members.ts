import { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { hierarchy, type OrganizationRole } from 'shared';
import type { DbContext } from '#/core/context';
import { baseDb } from '#/db/db';
import type { ServiceAccountId } from '#/db/utils/ids';
import type { BackendQueue, MembershipEntity } from '#/lib/module';
import { getPgBoss } from '#/lib/pg-boss';
import { type LtiMemberRow, type PlatformFetchOptions, readLtiMembers, trustedPlatformApi } from '#/modules/auth/flows/lti/helpers/platform-api';
import { ltiContextRole } from '#/modules/auth/flows/lti/lti-context-channel';
import type { LtiContextModel, LtiImportIssue } from '#/modules/auth/flows/lti/lti-contexts-db';
import { findLtiContextById, recordLtiImport } from '#/modules/auth/flows/lti/lti-contexts-queries';
import { createLtiAccount } from '#/modules/auth/flows/lti/operations/create-lti-account';
import { provisionConnectionActor } from '#/modules/auth/flows/lti/operations/provision-connection-actor';
import { isLtiConnection, type LtiConnection } from '#/modules/connections/connections-db';
import { findConnectionById } from '#/modules/connections/connections-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { resolveOrganizationMembershipRole } from '#/modules/memberships/helpers/membership-helpers';
import { countInvitationSeats } from '#/modules/memberships/invitations-queries';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import { countMembershipsByChannel, findMembershipsByUserIdsAndChannel, updateMembershipRole } from '#/modules/memberships/memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenant } from '#/modules/tenants/tenants-queries';
import { findIdentityBySubject, lockIdentityKey } from '#/modules/user/identities-queries';
import { isoDateAgo } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

const dbCtx = { var: { db: baseDb } };

/** How long after an import of a context a teacher's launch asks for no other. */
const importPeriod = new TimeSpan(10, 'm');

/** What the import writes into, and as whom. */
interface ImportTarget {
  connection: LtiConnection;
  channel: MembershipEntity;
  organization: OrganizationModel;
  by: ServiceAccountId;
  /** The new organization members the tenant's member limit still admits; null without a limit. */
  seats: { left: number } | null;
}

const isElevated = (role: string) => hierarchy.elevatedGrants.has(`organization:${role}`);

/** The organization role an import gives for `role`: the highest at or below it that is not elevated. */
const withoutElevation = (role: string): OrganizationRole => {
  const roles = hierarchy.getRoles('organization');
  const names: readonly string[] = roles;
  const from = names.indexOf(role);
  const allowed = from < 0 ? undefined : roles.slice(from).find((declared) => !isElevated(declared));
  return allowed ?? hierarchy.getLeastPrivilegedRole('organization');
};

interface ApplyImportedRoleOpts {
  userId: string;
  role: MembershipModel['role'];
  /** The person's organization membership; undefined for one the import seats. */
  seated: Pick<MembershipModel, 'id' | 'role'> | undefined;
}

/**
 * Gives a listed person the role `ltiContextRole` answers in the context's channel. A role in a channel below the
 * organization follows the platform up and down. An organization role only goes up, and never to an elevated one
 * (`elevatedGrants`), which no platform grants a person who is not there.
 */
const applyImportedRole = async (ctx: DbContext, { channel, organization, by }: ImportTarget, { userId, role, seated }: ApplyImportedRoleOpts) => {
  if (channel.entityType === 'organization') {
    const target = withoutElevation(role);
    if (!seated) await insertMemberships(ctx, { items: [{ userId, role: target, entity: organization, createdBy: by }] });
    else if (hierarchy.outranks('organization', target, seated.role)) await updateMembershipRole(ctx, { id: seated.id, role: target, by });
    return;
  }

  // Seated first, below any elevated role: the channel's membership then brings no organization membership along.
  if (!seated) {
    const along = withoutElevation(resolveOrganizationMembershipRole(channel.entityType, role));
    await insertMemberships(ctx, { items: [{ userId, role: along, entity: organization, createdBy: by }] });
  }
  const [membership] = await findMembershipsByUserIdsAndChannel(ctx, { userIds: [userId], channelId: channel.id });
  if (!membership) await insertMemberships(ctx, { items: [{ userId, role, entity: channel, createdBy: by }] });
  else if (membership.role !== role) await updateMembershipRole(ctx, { id: membership.id, role, by });
};

/**
 * Writes one listed person under the lock a launch of them takes: their account, found by the identity a launch finds
 * or made as a launch makes it, and their role. A person who would take a seat while none is left is not written.
 * @returns False when the tenant's member limit refused the person.
 */
const importPerson = async (ctx: DbContext, target: ImportTarget, person: LtiMemberRow) => {
  const { connection, organization, seats } = target;
  const key = { kind: 'lti', provider: connection.issuer, subject: person.id } as const;
  await lockIdentityKey(ctx, key);
  const identity = await findIdentityBySubject(ctx, key);
  const [seated] = identity ? await findMembershipsByUserIdsAndChannel(ctx, { userIds: [identity.userId], channelId: organization.id }) : [];
  if (!seated && seats) {
    if (seats.left <= 0) return false;
    seats.left -= 1;
  }

  const userId =
    identity?.userId ?? (await createLtiAccount(ctx, { connection, person: { sub: person.id, name: person.name, email: person.email } }));
  await applyImportedRole(ctx, target, { userId, role: ltiContextRole({ ltiRoles: person.roles, connection }), seated });
  return true;
};

/**
 * The new organization members the tenant's member limit admits, counted as an invitation counts them: members and
 * the seats open invitations hold. Null when the tenant has no limit.
 */
const seatsLeft = async (organization: OrganizationModel, quota: number) => {
  if (quota === 0) return null;
  const [members, pending] = await Promise.all([
    countMembershipsByChannel(dbCtx, { channelType: 'organization', channelId: organization.id }),
    countInvitationSeats(dbCtx, { organizationId: organization.id }),
  ]);
  return { left: Math.max(quota - members - pending, 0) };
};

/**
 * Imports the people a platform built on the template lists for an LTI context into the context's channel, as the
 * connection's service account, and records how it ran on the context. It adds and updates, never removes, and
 * touches no one the platform did not list. Run twice, or beside a launch of a listed person, it makes one account per
 * person. A context without trusted API addresses, an inactive connection or tenant, or a channel gone end it at once.
 * @throws What `readLtiMembers` throws: a failed read, recorded as `read_failed`, which the job retries.
 */
export async function importLtiMembersOp(contextId: string, options: PlatformFetchOptions = {}) {
  const context = await findLtiContextById(dbCtx, { id: contextId });
  const connection = context && (await findConnectionById(dbCtx, { id: context.connectionId }));
  if (!context?.apiUrl || !context.membersUrl || !connection || !isLtiConnection(connection) || connection.status !== 'active') return;
  const api = trustedPlatformApi(connection, { apiUrl: context.apiUrl, membersUrl: context.membersUrl });
  const [tenant, organization, channel] = await Promise.all([
    findTenant(dbCtx, { where: eq(tenantsTable.id, connection.tenantId) }),
    findOrganizationByTenant(dbCtx, { tenantId: connection.tenantId }),
    resolveEntity(dbCtx, { entityType: context.channelType, identifier: context.channelId }),
  ]);
  if (!api || tenant?.status !== 'active' || !organization || !channel) return;

  const by = await provisionConnectionActor(dbCtx, connection);
  const record = (readCount: number, issue: LtiImportIssue | null) => recordLtiImport(dbCtx, { id: context.id, readCount, issue, by });

  const read = await readLtiMembers(connection, api, options).catch(async (error: unknown) => {
    await record(0, 'read_failed');
    throw error;
  });
  if ('refusal' in read) return record(0, read.refusal);

  const target: ImportTarget = { connection, channel, organization, by, seats: await seatsLeft(organization, tenant.restrictions.quotas.user) };
  let issue: LtiImportIssue | null = read.issue;
  for (const person of read.people) {
    if (await baseDb.transaction((tx) => importPerson({ var: { db: tx } }, target, person))) continue;
    issue = 'member_limit';
    break;
  }
  await record(read.people.length, issue);
  log.info('LTI members imported', { contextId: context.id, connectionId: connection.id, read: read.people.length, issue });
}

/** The member import's job: a payload names the context row, and the handler reads everything else again. */
const importJobSchema = z.object({ contextId: z.uuid() });

/**
 * The member import's queue (`cella/docs/JOBS.md`): it reads a platform's API, outside the database. One job per
 * context waits and one runs at a time. A failed read is retried with growing delays, and never ends the grant.
 */
export const ltiMemberImportQueue = {
  name: 'lti.import-members',
  policy: 'stately',
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 60 * 60,
  handler: async (jobs) => {
    for (const job of jobs) {
      const data = importJobSchema.safeParse(job.data).data;
      if (data) await importLtiMembersOp(data.contextId);
    }
  },
} satisfies BackendQueue;

/**
 * Queues a member import of a context after a launch by its Instructor or Administrator, when the context holds the
 * platform's API and no import ran for it within `importPeriod`. The launch never waits for it: a job store that
 * refuses the job is logged.
 */
export const requestLtiMemberImport = async (context: LtiContextModel) => {
  if (!context.apiUrl || (context.importRanAt && context.importRanAt > isoDateAgo(importPeriod))) return;
  try {
    const boss = await getPgBoss('producer');
    await boss.send(ltiMemberImportQueue.name, { contextId: context.id }, { singletonKey: context.id });
  } catch (err) {
    log.warn('LTI member import not queued', { contextId: context.id, err });
  }
};
