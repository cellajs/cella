import { and, asc, desc, eq, inArray, isNull, lt, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { type Access, appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { type MembershipBaseModel, toMembershipBase } from '#/modules/memberships/helpers/select';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { findMembershipsByUserIds } from '#/modules/memberships/memberships-queries';
import {
  type DigestFrequency,
  defaultPreferences,
  type InsertNotificationModel,
  type NotificationPreferencesModel,
  notificationPreferencesTable,
  notificationsTable,
} from '#/modules/notification/notification-db';
import { findSystemRoleHolders } from '#/modules/system/system-queries';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { emailsTable } from '#/modules/user/emails-db';
import { toUserMinimalBase, type UserMinimalBase } from '#/modules/user/helpers/user-minimal';
import { usersTable } from '#/modules/user/user-db';
import { findExistingUserIds } from '#/modules/user/user-queries';
import { getEntityTable } from '#/tables';
import { getIsoDate } from '#/utils/iso-date';

/**
 * The recipient still belongs to the notification's organization, or is a system admin. A member who left keeps no
 * inbox row, digest line or mail from it; what a member may read inside it is checked per row by the callers.
 */
const recipientStillBelongs = sql`(
  exists (
    select 1 from ${membershipsTable}
    where ${membershipsTable.userId} = ${notificationsTable.userId}
      and ${membershipsTable.organizationId} = ${notificationsTable.organizationId}
  )
  or exists (
    select 1 from ${systemRolesTable}
    where ${systemRolesTable.userId} = ${notificationsTable.userId} and ${systemRolesTable.role} = 'admin'
  )
)`;

export interface FindNotificationsOpts {
  userId: string;
  unreadOnly: boolean;
  limit: number;
  /** `createdAt` of the last row of the previous page; keyset paging avoids OFFSET scans. */
  before?: string;
}

/** One page of a user's inbox, newest first. */
export async function findNotificationsByUser(ctx: DbContext, opts: FindNotificationsOpts) {
  const { userId, unreadOnly, limit, before } = opts;

  const filters = [eq(notificationsTable.userId, userId), recipientStillBelongs];
  if (unreadOnly) filters.push(isNull(notificationsTable.readAt));
  if (before) filters.push(lt(notificationsTable.createdAt, before));

  return ctx.var.db
    .select()
    .from(notificationsTable)
    .where(and(...filters))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);
}

interface CountUnreadByUserOpts {
  userId: string;
}

/** Counts the user's unread rows the inbox lists. */
export async function countUnreadByUser(ctx: DbContext, { userId }: CountUnreadByUserOpts): Promise<number> {
  const [row] = await ctx.var.db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt), recipientStillBelongs));

  return row?.count ?? 0;
}

interface MarkNotificationsReadOpts {
  userId: string;
  /** The rows to mark; every unread row of the user when omitted or empty. */
  ids?: string[];
  /** Marks everything sharing one context, whatever `ids` holds: the "opening the thread clears its badge" path. */
  contextId?: string;
}

/** Marks the user's unread rows of one context, the given rows, or all of them read. Idempotent. */
export async function markNotificationsRead(ctx: DbContext, { userId, ids, contextId }: MarkNotificationsReadOpts): Promise<number> {
  const filters = [eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)];
  if (contextId) filters.push(eq(notificationsTable.contextId, contextId));
  else if (ids?.length) filters.push(inArray(notificationsTable.id, ids));

  const updated = await ctx.var.db
    .update(notificationsTable)
    .set({ readAt: getIsoDate() })
    .where(and(...filters))
    .returning({ id: notificationsTable.id });

  return updated.length;
}

interface FindPreferencesOpts {
  userId: string;
}

/** The user's preferences row; undefined for a user who never saved one, whose preferences are `defaultPreferences`. */
export async function findPreferences(ctx: DbContext, { userId }: FindPreferencesOpts) {
  const [row] = await ctx.var.db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, userId)).limit(1);
  return row;
}

interface UpdatePreferencesOpts {
  userId: string;
  values: Partial<Pick<NotificationPreferencesModel, 'mentionEmail' | 'commentEmail' | 'digest'>>;
}

/** Writes the given preferences; a user without a row gets one with the defaults for the rest. */
export async function updatePreferences(ctx: DbContext, { userId, values }: UpdatePreferencesOpts) {
  const updatedAt = getIsoDate();
  const [updated] = await ctx.var.db
    .insert(notificationPreferencesTable)
    .values({ userId, ...values, updatedAt })
    .onConflictDoUpdate({ target: notificationPreferencesTable.userId, set: { ...values, updatedAt } })
    .returning();

  return updated;
}

/** The columns the fan-out writes; the rest take their defaults. */
export type NotificationInsert = Required<
  Pick<
    InsertNotificationModel,
    | 'userId'
    | 'type'
    | 'entityType'
    | 'subjectId'
    | 'contextId'
    | 'channelId'
    | 'channelType'
    | 'organizationId'
    | 'tenantId'
    | 'activityId'
    | 'actorId'
  >
>;

/** A row the fan-out wrote, with its id. */
export type WrittenNotification = NotificationInsert & { id: string };

interface InsertNotificationsIgnoringDuplicatesOpts {
  rows: NotificationInsert[];
}

/**
 * Inserts notifications, skipping any recipient who already holds one for the subject: a CDC redelivery, an edit and
 * a republish tell nobody twice. The table is partitioned, so it cannot carry the unique constraint `ON CONFLICT`
 * would need as an arbiter; a transaction-scoped lock on each subject makes two overlapping deliveries of one change
 * wait for each other, so the second one sees the first one's rows.
 * @returns The rows written, none for a recipient told before.
 */
export async function insertNotificationsIgnoringDuplicates(
  ctx: DbContext,
  { rows }: InsertNotificationsIgnoringDuplicatesOpts,
): Promise<WrittenNotification[]> {
  if (rows.length === 0) return [];
  const { db } = ctx.var;

  const candidates = rows.map((row) => ({ ...row, id: generateId() }));
  const values = sql.join(
    candidates.map(
      (row) =>
        sql`(${row.id}::uuid, now(), ${row.userId}::uuid, ${row.actorId}::uuid, ${row.type}, ${row.entityType}, ${row.subjectId}::uuid, ${row.contextId}::uuid, ${row.channelId}::uuid, ${row.channelType}, ${row.organizationId}::uuid, ${row.tenantId}, ${row.activityId})`,
    ),
    sql`, `,
  );

  return db.transaction(async (tx) => {
    // Sorted, so inserts that share subjects lock in one order; each lock is its own statement, so the insert's snapshot follows it.
    for (const subjectId of [...new Set(rows.map((row) => row.subjectId))].toSorted()) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`notifications:${subjectId}`}, 0))`);
    }

    const result = await tx.execute<{ id: string }>(sql`
    WITH candidate (id, created_at, user_id, actor_id, type, entity_type, subject_id, context_id, channel_id, channel_type, organization_id, tenant_id, activity_id) AS (
      VALUES ${values}
    )
    INSERT INTO notifications (id, created_at, user_id, actor_id, type, entity_type, subject_id, context_id, channel_id, channel_type, organization_id, tenant_id, activity_id)
    SELECT c.id, c.created_at, c.user_id, c.actor_id, c.type, c.entity_type, c.subject_id, c.context_id, c.channel_id, c.channel_type, c.organization_id, c.tenant_id, c.activity_id
    FROM candidate c
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = c.user_id AND n.subject_id = c.subject_id
    )
    RETURNING id
  `);

    const written = new Set(result.rows.map((row) => row.id));
    return candidates.filter((row) => written.has(row.id));
  });
}

/** Always the identified variant: these are known users, never the anonymous actor. */
type UserAccess = Extract<Access<MembershipBaseModel>, { actorId: string }>;

interface GetUserAccessOpts {
  userIds: string[];
}

/**
 * Build permission `Access` objects for arbitrary users, connected or not. An id that names no user gets none: a
 * mention is written by a client, and an author can be a service account, which has no inbox.
 *
 * `accessFrom` reads the request context, so it only ever describes the caller, and
 * stream fan-out only sees users with an open SSE connection. Notifications must decide what an
 * offline user may read, which needs memberships and system-admin status loaded by user id.
 *
 * Both halves are loaded and paired here on purpose: `accessFrom` warns that hand-assembling an
 * Access risks pairing one user's memberships with another's identity, and that warning applies
 * with more force to a loop over many users.
 */
export async function getUserAccess(ctx: DbContext, { userIds }: GetUserAccessOpts): Promise<Map<string, UserAccess>> {
  const result = new Map<string, UserAccess>();
  if (userIds.length === 0) return result;

  const unique = [...new Set(userIds)];

  const [users, memberships, systemAdmins] = await Promise.all([
    findExistingUserIds(ctx, { ids: unique }),
    findMembershipsByUserIds(ctx, { userIds: unique }),
    findSystemRoleHolders(ctx, { userIds: unique, role: 'admin' }),
  ]);

  const adminIds = new Set(systemAdmins.map((row) => row.userId));
  const byUser = Map.groupBy(
    memberships.map((row) => toMembershipBase(row)),
    (membership) => membership.userId,
  );

  for (const { id: userId } of users) {
    result.set(userId, {
      // An offline user is read as a session would be: unmasked.
      scopes: null,
      actorId: userId,
      isSystemAdmin: adminIds.has(userId),
      memberships: byUser.get(userId) ?? [],
    });
  }

  return result;
}

/** The two columns every channel table has; the table union needs narrowing to select them. */
type NamedTable = AnyPgTable & { id: PgColumn; name: PgColumn };

interface FindChannelNamesOpts {
  channelIds: string[];
}

/**
 * Display names for a set of channel ids, so a digest can group by channel without the caller
 * knowing which table each id lives in.
 *
 * Driven by `appConfig.channelEntityTypes`, so a hierarchy change is picked up automatically. Channel tables sit
 * outside RLS (application-layer guards cover them), and the ids only ever come from rows the recipient was already
 * cleared to read.
 */
export async function findChannelNames(ctx: DbContext, { channelIds }: FindChannelNamesOpts): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (channelIds.length === 0) return names;

  const unique = [...new Set(channelIds)];

  await Promise.all(
    appConfig.channelEntityTypes.map(async (channelType) => {
      const table = getEntityTable(channelType) as NamedTable;
      const rows = await ctx.var.db.select({ id: table.id, name: table.name }).from(table).where(inArray(table.id, unique));
      for (const row of rows) names.set(String(row.id), String(row.name));
    }),
  );

  return names;
}

interface UserIdsOpts {
  userIds: string[];
}

/**
 * Recipients with a verified address, each with the instant mail categories they keep on; anyone else keeps the in-app
 * notification only. A user without a preferences row keeps the defaults.
 */
export async function findVerifiedRecipients(ctx: DbContext, { userIds }: UserIdsOpts) {
  if (userIds.length === 0) return [];

  return ctx.var.db
    .selectDistinctOn([usersTable.id], {
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      language: usersTable.language,
      mentionEmail: sql<boolean>`coalesce(${notificationPreferencesTable.mentionEmail}, ${defaultPreferences.mentionEmail})`,
      commentEmail: sql<boolean>`coalesce(${notificationPreferencesTable.commentEmail}, ${defaultPreferences.commentEmail})`,
    })
    .from(usersTable)
    .innerJoin(emailsTable, eq(emailsTable.userId, usersTable.id))
    .leftJoin(notificationPreferencesTable, eq(notificationPreferencesTable.userId, usersTable.id))
    .where(inArray(usersTable.id, userIds))
    .orderBy(usersTable.id);
}

/** Minimal user objects for actors, keyed by id; an actor that is no user, or a deleted one, is absent. */
export async function findUsersMinimal(ctx: DbContext, { userIds }: UserIdsOpts) {
  if (userIds.length === 0) return new Map<string, UserMinimalBase>();

  const rows = await ctx.var.db
    .select({ id: usersTable.id, name: usersTable.name, slug: usersTable.slug, thumbnailUrl: usersTable.thumbnailUrl })
    .from(usersTable)
    .where(inArray(usersTable.id, [...new Set(userIds)]));

  return new Map(rows.map((row) => [row.id, toUserMinimalBase(row)]));
}

interface NotificationIdsOpts {
  ids: string[];
}

/** Stamps the rows whose instant mail went out, so the digest does not repeat them. */
export async function stampEmailed(ctx: DbContext, { ids }: NotificationIdsOpts): Promise<void> {
  if (ids.length === 0) return;
  await ctx.var.db.update(notificationsTable).set({ emailedAt: getIsoDate() }).where(inArray(notificationsTable.id, ids));
}

/**
 * Rows a digest may still carry: unread, never mailed, of an organization the recipient still belongs to, created in
 * `[since, before)`. `before` is the run's start and `createdAt` the start of the insert's transaction, so a row whose
 * insert began during a run falls in the recipient's next window, and one that began before the run and committed after
 * this read falls in neither.
 */
const undigestedRows = (since: SQL | string, before: string) => sql`${notificationsTable.readAt} is null
  and ${notificationsTable.emailedAt} is null
  and ${notificationsTable.createdAt} >= ${since}
  and ${notificationsTable.createdAt} < ${before}
  and ${recipientStillBelongs}`;

interface FindDueDigestRecipientsOpts {
  /** The run's start: every window ends there. */
  runAt: string;
  /** Start of the run's day: a recipient already run since then is not due. */
  dayStart: string;
  includeWeekly: boolean;
  limit: number;
}

/**
 * Recipients whose digest is due, each with where their window starts: verified address, cadence on (the default without
 * a preferences row), not yet run today, and at least one row `findUndigestedNotifications` returns for the window. It
 * starts at `lastDigestAt`, so a late or skipped run resumes where the previous one stopped, but reaches back no further
 * than the cadence plus a day: a first digest, and the first after the digest was off, cover recent rows only.
 * @returns `windowStart` as the driver's text, for `findUndigestedNotifications` to take as it is: no JavaScript `Date` reads it.
 */
export async function findDueDigestRecipients(ctx: DbContext, { runAt, dayStart, includeWeekly, limit }: FindDueDigestRecipientsOpts) {
  const digest = sql<DigestFrequency>`coalesce(${notificationPreferencesTable.digest}, ${defaultPreferences.digest})`;
  const cadences: DigestFrequency[] = includeWeekly ? ['daily', 'weekly'] : ['daily'];
  const reach = sql`case when ${digest} = 'weekly' then interval '8 days' else interval '2 days' end`;
  // greatest() skips nulls: without a stamp the window starts at the furthest reach.
  const windowStart = sql<string>`greatest(${notificationPreferencesTable.lastDigestAt}, ${runAt}::timestamptz - ${reach})`;
  const hasUndigested = sql`exists (
    select 1 from ${notificationsTable}
    where ${notificationsTable.userId} = ${usersTable.id} and ${undigestedRows(windowStart, runAt)}
  )`;

  return (
    ctx.var.db
      .selectDistinctOn([usersTable.id], {
        userId: usersTable.id,
        digest,
        windowStart,
        email: usersTable.email,
        name: usersTable.name,
        language: usersTable.language,
      })
      .from(usersTable)
      // Verified addresses only; mailing dormant and never-activated accounts helps no one.
      .innerJoin(emailsTable, eq(emailsTable.userId, usersTable.id))
      .leftJoin(notificationPreferencesTable, eq(notificationPreferencesTable.userId, usersTable.id))
      .where(
        and(
          inArray(digest, cadences),
          or(isNull(notificationPreferencesTable.lastDigestAt), lt(notificationPreferencesTable.lastDigestAt, dayStart)),
          hasUndigested,
        ),
      )
      .orderBy(usersTable.id)
      .limit(limit)
  );
}

/** One recipient's digest window `[since, before)`; `buildDigestForUser` takes it without `limit`. */
export interface FindUndigestedNotificationsOpts {
  userId: string;
  /** The window's start, as `findDueDigestRecipients` gave it. */
  since: string;
  /** The run's start, where the window ends. */
  before: string;
  limit: number;
}

/** The rows of a user's digest window, oldest first; the digest's whole content source. */
export async function findUndigestedNotifications(ctx: DbContext, { userId, since, before, limit }: FindUndigestedNotificationsOpts) {
  return ctx.var.db
    .select({
      type: notificationsTable.type,
      entityType: notificationsTable.entityType,
      subjectId: notificationsTable.subjectId,
      channelId: notificationsTable.channelId,
      contextId: notificationsTable.contextId,
      tenantId: notificationsTable.tenantId,
    })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), undigestedRows(since, before)))
    .orderBy(asc(notificationsTable.createdAt))
    .limit(limit);
}

interface StampDigestRunOpts {
  userId: string;
  /** The run's start, where the user's next window starts. */
  ranAt: string;
}

/** Settles a recipient's window once their digest went out or had nothing to say. Upserts, so a user without a row gets one with the defaults. */
export async function stampDigestRun(ctx: DbContext, { userId, ranAt }: StampDigestRunOpts): Promise<void> {
  await ctx.var.db
    .insert(notificationPreferencesTable)
    .values({ userId, lastDigestAt: ranAt })
    .onConflictDoUpdate({ target: notificationPreferencesTable.userId, set: { lastDigestAt: ranAt } });
}
