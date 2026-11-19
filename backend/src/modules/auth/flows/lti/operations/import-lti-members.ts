import { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { baseDb } from '#/db/db';
import type { ServiceAccountId } from '#/db/utils/ids';
import type { BackendQueue, MembershipEntity } from '#/lib/module';
import { getPgBoss } from '#/lib/pg-boss';
import { type LtiMemberRow, type PlatformFetchOptions, readLtiMembers } from '#/modules/auth/flows/lti/helpers/platform-api';
import { ltiContextRole } from '#/modules/auth/flows/lti/lti-context-channel';
import type { LtiContextModel, LtiImportIssue } from '#/modules/auth/flows/lti/lti-contexts-db';
import { findLtiContextById, recordLtiImport } from '#/modules/auth/flows/lti/lti-contexts-queries';
import { admitLtiPerson, applyLtiRole } from '#/modules/auth/flows/lti/operations/admit-lti-person';
import { connectionServiceAccountId } from '#/modules/auth/flows/lti/operations/connection-service-account';
import { isLtiConnection, type LtiConnection } from '#/modules/connections/connections-db';
import { findConnectionById } from '#/modules/connections/connections-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenant } from '#/modules/tenants/tenants-queries';
import { isoDateAgo } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

const dbCtx = { var: { db: baseDb } };

/** How long after an import of a context neither a teacher's launch nor a queued job starts another. */
const importPeriod = new TimeSpan(10, 'm');

/** How often the job tries a failed read again, from a minute up to an hour apart. */
const importRetryLimit = 5;

/** Whether an import of the context ran within `importPeriod`. */
const importedLately = ({ importRanAt }: LtiContextModel) => !!importRanAt && importRanAt > isoDateAgo(importPeriod);

/** What the import writes into, and as whom. */
interface ImportTarget {
  connection: LtiConnection;
  channel: MembershipEntity;
  organization: OrganizationModel;
  /** The tenant's member limit; 0 for none. */
  memberQuota: number;
  by: ServiceAccountId;
}

/**
 * Writes one listed person under the lock a launch of them takes: their account (`admitLtiPerson`), and their role.
 * @returns False when the person needs a seat and the tenant's member limit leaves none; nothing is written then.
 */
const importPerson = async (ctx: DbContext, { connection, channel, organization, memberQuota, by }: ImportTarget, person: LtiMemberRow) => {
  const { id: sub, name, given_name: givenName, family_name: familyName, email } = person;
  const admitted = await admitLtiPerson(ctx, { connection, organization, memberQuota, person: { sub, name, givenName, familyName, email }, by });
  if (!admitted) return false;
  const role = ltiContextRole({ ltiRoles: person.roles, connection });
  await applyLtiRole(ctx, { organization, channel, userId: admitted.userId, seat: admitted.seat, role, by });
  return true;
};

interface ImportLtiMembersOpts extends PlatformFetchOptions {
  /** False while the job tries a failed read again: the context records that it will. True by default. */
  lastAttempt?: boolean;
}

/**
 * Imports the people a platform built on the template lists for an LTI context into the context's channel, as the
 * connection's service account, and records how it ran on the context. It adds and updates, never removes, and
 * touches no one the platform did not list. Run twice, or beside a launch of a listed person, it makes one account per
 * person. A person who needs a seat while the member limit leaves none is left out. An inactive connection or tenant,
 * or a channel that is archived or gone, ends it at once, and a deleted connection ends it unrecorded.
 * @throws What fails after the connection's service account is known, such as a failed read or a role the app's mapping
 *   does not take: recorded as `read_retrying` or, on the last attempt, `read_failed`.
 */
export async function importLtiMembersOp(contextId: string, { lastAttempt = true, ...options }: ImportLtiMembersOpts = {}) {
  const context = await findLtiContextById(dbCtx, { id: contextId });
  const connection = context && (await findConnectionById(dbCtx, { id: context.connectionId }));
  if (!context?.apiUrl || !context.membersUrl || !connection || !isLtiConnection(connection)) return;

  const by = await connectionServiceAccountId(dbCtx, connection);
  if (!by) return;
  const record = (readCount: number, issue: LtiImportIssue | null) => recordLtiImport(dbCtx, { id: context.id, readCount, issue, by });

  try {
    const [tenant, organization, channel] = await Promise.all([
      findTenant(dbCtx, { where: eq(tenantsTable.id, connection.tenantId) }),
      findOrganizationByTenant(dbCtx, { tenantId: connection.tenantId }),
      resolveEntity(dbCtx, { entityType: context.channelType, identifier: context.channelId }),
    ]);
    // Joining an archived channel is a create inside it, which an archive refuses.
    if (connection.status !== 'active' || tenant?.status !== 'active' || !organization || !channel || channel.archived) return record(0, 'inactive');

    const read = await readLtiMembers(connection, { apiUrl: context.apiUrl, membersUrl: context.membersUrl }, options);
    if ('refusal' in read) return record(0, read.refusal);

    const target: ImportTarget = { connection, channel, organization, memberQuota: tenant.restrictions.quotas.user, by };
    let issue: LtiImportIssue | null = read.issue;
    for (const person of read.people) {
      if (!(await baseDb.transaction((tx) => importPerson({ var: { db: tx } }, target, person)))) issue = 'member_limit';
    }
    await record(read.people.length, issue);
    log.info('LTI members imported', { contextId: context.id, connectionId: connection.id, read: read.people.length, issue });
  } catch (error) {
    await record(0, lastAttempt ? 'read_failed' : 'read_retrying');
    throw error;
  }
}

/** The member import's job: a payload names the context row, and the handler reads everything else again. */
const importJobSchema = z.object({ contextId: z.uuid() });

/**
 * The member import's queue (`cella/docs/JOBS.md`): it reads a platform's API, outside the database. One job per
 * context waits and one runs at a time. A job that waited behind another finds that import within `importPeriod` and
 * ends, while a retry goes on. A failed read is retried with growing delays, and never ends the grant.
 */
export const ltiMemberImportQueue = {
  name: 'lti.import-members',
  policy: 'stately',
  retryLimit: importRetryLimit,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 60 * 60,
  handler: async (jobs) => {
    for (const job of jobs) {
      const data = importJobSchema.safeParse(job.data).data;
      const context = data && (await findLtiContextById(dbCtx, { id: data.contextId }));
      if (!context || (job.retryCount === 0 && importedLately(context))) continue;
      await importLtiMembersOp(context.id, { lastAttempt: job.retryCount >= importRetryLimit });
    }
  },
} satisfies BackendQueue;

/**
 * Queues a member import of a context after a launch by its Instructor or Administrator, when the context holds the
 * platform's API and no import ran for it within `importPeriod`. The launch never waits for it: a job store that
 * refuses the job is logged.
 */
export const requestLtiMemberImport = async (context: LtiContextModel) => {
  if (!context.apiUrl || importedLately(context)) return;
  try {
    const boss = await getPgBoss('producer');
    await boss.send(ltiMemberImportQueue.name, { contextId: context.id }, { singletonKey: context.id });
  } catch (err) {
    log.warn('LTI member import not queued', { contextId: context.id, err });
  }
};
