import { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { baseDb } from '#/db/db';
import type { ServiceAccountId, UserId } from '#/db/utils/ids';
import type { BackendQueue, MembershipEntity } from '#/lib/module';
import { getPgBoss } from '#/lib/pg-boss';
import { getRateLimiterInstance, reserveAttempt } from '#/middlewares/rate-limiter/helpers';
import { type LtiMember, maxMembers, type ReadLtiMembersOptions, readLtiMembers } from '#/modules/auth/flows/lti/helpers/platform-memberships';
import type { LtiContextModel, LtiImportIssue } from '#/modules/auth/flows/lti/lti-contexts-db';
import { findLtiContextById, recordLtiImport, recordLtiImportWaiting } from '#/modules/auth/flows/lti/lti-contexts-queries';
import { admitLtiPerson, applyLtiRole, ltiRoleIn } from '#/modules/auth/flows/lti/operations/admit-lti-person';
import { connectionServiceAccountId } from '#/modules/auth/flows/lti/operations/connection-service-account';
import { isLtiConnection, type LtiConnection } from '#/modules/connections/connections-db';
import { findConnectionById, holdConnection } from '#/modules/connections/connections-queries';
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

/** How often the job tries a failed import again, from a minute up to an hour apart. */
const importRetryLimit = 5;

/** The longest one import runs: the job store then fails it and aborts its signal. */
const importBudgetSeconds = 120;

/**
 * The most courses of one connection imported within an hour, however many its platform names. A class whose 60 teams
 * each switch on a tab of their own imports 61 contexts with its course: two such classes fit in an hour.
 */
export const maxCoursesPerHour = 150;

/**
 * The most people the imports of one connection read within an hour: five imports of the longest list one import
 * reads, or some thirty courses of 300. A platform's reach stays near what 30 usual courses an hour read, however it
 * spreads its people over courses.
 */
export const maxPeoplePerHour = 5 * maxMembers;

/**
 * A connection's hourly budgets, buckets of the rate limit store keyed by the connection: a course for each import a
 * launch starts, and the people each page of every attempt reads, a retry's included. Nothing gives a point back: a
 * course read again with fewer people, or a failed attempt, frees none.
 */
const importBudgets = {
  courses: { keyPrefix: 'lti_import_courses', points: maxCoursesPerHour },
  people: { keyPrefix: 'lti_import_people', points: maxPeoplePerHour },
} as const;

const budgetHour = 60 * 60;

const budgetStore = (budget: keyof typeof importBudgets) => getRateLimiterInstance({ ...importBudgets[budget], duration: budgetHour });

/** Takes `cost` from one of the connection's hourly budgets while it holds it; false, with nothing taken, when it does not. */
export const takeFromImportBudget = async (budget: keyof typeof importBudgets, connectionId: string, cost: number) => {
  const { points } = importBudgets[budget];
  return (await reserveAttempt(budgetStore(budget), connectionId, { points, duration: budgetHour }, cost)).granted;
};

/** Whether either hourly budget of the connection is spent (`importBudgets`). */
const connectionImportsSpent = async (connectionId: string) => {
  for (const [budget, { points }] of Object.entries(importBudgets)) {
    const state = await budgetStore(budget as keyof typeof importBudgets).get(connectionId);
    if (state && state.consumedPoints >= points) return true;
  }
  return false;
};

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
 * Writes one listed person under the lock a launch of them takes: their account (`admitLtiPerson`), and their role. It
 * holds the connection's row (`holdConnection`): a delete of the connection waits for it.
 * @returns `member_limit` when the person needs a seat and the tenant's member limit leaves none, `no_role` when the
 *   app's `ltiContextRole` maps them to none, and `connection_gone` once the connection was deleted; nothing is written
 *   for any of them.
 */
const importPerson = async (ctx: DbContext, { connection, channel, organization, memberQuota, by }: ImportTarget, person: LtiMember) => {
  if (!(await holdConnection(ctx, { id: connection.id }))) return 'connection_gone';
  const role = ltiRoleIn(channel.entityType, { ltiRoles: person.roles, connection });
  if (!role) return 'no_role';
  const { user_id: sub, name, given_name: givenName, family_name: familyName, email } = person;
  const admitted = await admitLtiPerson(ctx, { connection, organization, memberQuota, person: { sub, name, givenName, familyName, email }, by });
  if (!admitted) return 'member_limit';
  await applyLtiRole(ctx, { organization, channel, userId: admitted.userId, seat: admitted.seat, role, by });
  return 'imported';
};

interface ImportLtiMembersOpts extends Omit<ReadLtiMembersOptions, 'countRead'> {
  /** False while the job tries a failed import again: the context records that it will. True by default. */
  lastAttempt?: boolean;
  /** True while the job tries a failed import again: its course counted when it first ran, its pages count again. */
  retry?: boolean;
}

/** The refusals after which the platform names the member list again before an import reads it: a withdrawn grant. */
const forgetsAddress = new Set<LtiImportIssue>(['scope_not_granted', 'members_refused']);

/**
 * Imports the people a platform lists for an LTI context into the context's channel, as the connection's service
 * account, and records how it ran on the context. It adds and updates, never removes, and touches no one the platform
 * did not list as active. Run twice, or beside a launch of a listed person, it makes one account per
 * person. A person who needs a seat while the member limit leaves none is left out. An inactive connection or tenant,
 * or a channel that is archived or gone, ends it at once. A deleted connection ends it before the next person, without
 * an error and unrecorded. An aborted `signal` ends it before the next page or person. A first attempt while the
 * connection's hourly budget is spent reads nothing and records that it waits, and a page past the people the hour
 * allows ends the read: the people before it are imported and the import records that it waits. A refusal of the scope or the member
 * list forgets the membership address, which the next launch that names it stores again.
 * @throws What fails after the connection's service account is known, such as a failed read or an abort: recorded as
 *   `retrying` or, on the last attempt, `failed`.
 */
export async function importLtiMembersOp(contextId: string, { lastAttempt = true, retry = false, ...options }: ImportLtiMembersOpts = {}) {
  const context = await findLtiContextById(dbCtx, { id: contextId });
  const connection = context?.connectionId && (await findConnectionById(dbCtx, { id: context.connectionId }));
  if (!context?.membershipsUrl || !connection || !isLtiConnection(connection)) return;

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
    if (!retry && ((await connectionImportsSpent(connection.id)) || !(await takeFromImportBudget('courses', connection.id, 1))))
      return recordLtiImportWaiting(dbCtx, { id: context.id, by });

    const countRead = (members: number) => takeFromImportBudget('people', connection.id, members);
    const read = await readLtiMembers(connection, context.membershipsUrl, { ...options, countRead });
    if ('refusal' in read) {
      return recordLtiImport(dbCtx, { id: context.id, readCount: 0, issue: read.refusal, forgetAddress: forgetsAddress.has(read.refusal), by });
    }

    const target: ImportTarget = { connection, channel, organization, memberQuota: tenant.restrictions.quotas.user, by };
    let issue: LtiImportIssue | null = read.issue;
    for (const person of read.people) {
      options.signal?.throwIfAborted();
      const outcome = await baseDb.transaction((tx) => importPerson({ var: { db: tx } }, target, person));
      if (outcome === 'connection_gone') return;
      if (outcome === 'member_limit') issue = 'member_limit';
    }
    await record(read.people.length, issue);
    log.info('LTI members imported', { contextId: context.id, connectionId: connection.id, read: read.people.length, issue });
  } catch (error) {
    await record(0, lastAttempt ? 'failed' : 'retrying');
    throw error;
  }
}

/** The member import's job: a payload names the context row, and the handler reads everything else again. */
const importJobSchema = z.object({ contextId: z.uuid() });

/**
 * The member import's queue (`cella/docs/JOBS.md`): it reads a platform's member list, outside the database. One job per
 * context waits and one runs at a time. Imports of one connection, its group, run one after the other, and those of
 * different connections beside each other: one platform holds up its own imports alone. Each runs within
 * `importBudgetSeconds`. A job that waited behind another finds that import within `importPeriod` and ends, or the
 * connection's hour spent and records that it waits, while a retry goes on. A failed import is retried with growing
 * delays, and never ends the grant.
 */
export const ltiMemberImportQueue = {
  name: 'lti.import-members',
  policy: 'stately',
  retryLimit: importRetryLimit,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 60 * 60,
  expireInSeconds: importBudgetSeconds,
  work: { localConcurrency: 4, groupConcurrency: 1 },
  handler: async (jobs) => {
    for (const job of jobs) {
      const data = importJobSchema.safeParse(job.data).data;
      const context = data && (await findLtiContextById(dbCtx, { id: data.contextId }));
      if (!context?.connectionId || (job.retryCount === 0 && importedLately(context))) continue;
      await importLtiMembersOp(context.id, { lastAttempt: job.retryCount >= importRetryLimit, retry: job.retryCount > 0, signal: job.signal });
    }
  },
} satisfies BackendQueue;

/**
 * Queues a member import of a context after a launch by its Instructor or Administrator `by`, when the context holds
 * a membership address and no import ran for it within `importPeriod`. While its connection's hour is spent
 * (`maxCoursesPerHour`, `maxPeoplePerHour`) it queues nothing and records that the import waits. The launch never waits for it: a job
 * store that refuses the job, or a failed write, is logged.
 */
export const requestLtiMemberImport = async (context: LtiContextModel, by: UserId) => {
  const { connectionId } = context;
  if (!context.membershipsUrl || !connectionId || importedLately(context)) return;
  try {
    if (await connectionImportsSpent(connectionId)) return await recordLtiImportWaiting(dbCtx, { id: context.id, by });
    const boss = await getPgBoss('producer');
    await boss.send(ltiMemberImportQueue.name, { contextId: context.id }, { singletonKey: context.id, group: { id: connectionId } });
  } catch (err) {
    log.warn('LTI member import not queued', { contextId: context.id, err });
  }
};
