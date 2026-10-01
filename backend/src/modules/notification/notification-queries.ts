import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { emailsTable } from '#/modules/user/emails-db';
import { toUserMinimalBase, type UserMinimalBase } from '#/modules/user/helpers/audit-user';
import { usersTable } from '#/modules/user/user-db';
import {
  type DigestFrequency,
  defaultDigestFrequency,
  notificationPreferencesTable,
  notificationsTable,
} from './notification-db';
import { instantEmailTypes, type NotificationType } from './notification-types';

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

// ── Inbox reads ──────────────────────────────────────────────────────────────

export interface FindNotificationsOpts {
  userId: string;
  unreadOnly: boolean;
  limit: number;
  /** `createdAt` of the last row of the previous page; keyset paging avoids OFFSET scans. */
  before?: string;
}

/**
 * One page of a user's inbox, newest first.
 *
 * `DISTINCT ON` is defensive: the table is partitioned and therefore cannot carry a unique
 * constraint, so a redelivery that raced the insert guard would otherwise surface twice.
 */
export async function findNotificationsByUser(ctx: DbContext, opts: FindNotificationsOpts) {
  const { userId, unreadOnly, limit, before } = opts;

  const filters = [eq(notificationsTable.userId, userId), recipientStillBelongs];
  if (unreadOnly) filters.push(isNull(notificationsTable.readAt));
  if (before) filters.push(lt(notificationsTable.createdAt, before));

  const rows = await ctx.var.db
    .selectDistinctOn([notificationsTable.userId, notificationsTable.activityId, notificationsTable.type])
    .from(notificationsTable)
    .where(and(...filters))
    .orderBy(
      notificationsTable.userId,
      notificationsTable.activityId,
      notificationsTable.type,
      desc(notificationsTable.createdAt),
    )
    .limit(limit);

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function countUnreadByUser(ctx: DbContext, userId: string): Promise<number> {
  const [row] = await ctx.var.db
    .select({ count: sql<number>`count(distinct (${notificationsTable.activityId}, ${notificationsTable.type}))::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt), recipientStillBelongs));

  return row?.count ?? 0;
}

/** Marks the given rows read, or every unread row when `ids` is omitted. Idempotent. */
export async function markNotificationsRead(ctx: DbContext, userId: string, ids?: string[]): Promise<number> {
  const filters = [eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)];
  if (ids?.length) filters.push(inArray(notificationsTable.id, ids));

  const updated = await ctx.var.db
    .update(notificationsTable)
    .set({ readAt: new Date().toISOString() })
    .where(and(...filters))
    .returning({ id: notificationsTable.id });

  return updated.length;
}

/** Marks everything sharing one context read: the "opening the thread clears its badge" path. */
export async function markContextNotificationsRead(ctx: DbContext, userId: string, contextId: string): Promise<number> {
  const updated = await ctx.var.db
    .update(notificationsTable)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.contextId, contextId),
        isNull(notificationsTable.readAt),
      ),
    )
    .returning({ id: notificationsTable.id });

  return updated.length;
}

// ── Preferences ──────────────────────────────────────────────────────────────

/** Preferences row, created on first read so callers never handle a missing row. */
export async function findOrCreatePreferences(ctx: DbContext, userId: string) {
  const { db } = ctx.var;

  const [existing] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db.insert(notificationPreferencesTable).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;

  const [raced] = await db
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId))
    .limit(1);
  return raced;
}

export async function updatePreferences(
  ctx: DbContext,
  userId: string,
  values: { mentionEmail?: boolean; commentEmail?: boolean; digest?: DigestFrequency },
) {
  const [updated] = await ctx.var.db
    .update(notificationPreferencesTable)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(notificationPreferencesTable.userId, userId))
    .returning();

  return updated;
}

// ── Fan-out ──────────────────────────────────────────────────────────────────

/** Users already holding a notification for this subject, so an edit cannot notify them twice. */
export async function findNotifiedUserIds(subjectId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const existing = await baseDb
    .select({ userId: notificationsTable.userId })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.subjectId, subjectId), inArray(notificationsTable.userId, userIds)));

  return new Set(existing.map((row) => row.userId));
}

export interface NotificationInsert {
  userId: string;
  type: NotificationType;
  entityType: string;
  subjectId: string;
  contextId: string | null;
  channelId: string;
  channelType: string;
  organizationId: string;
  tenantId: string;
  activityId: string;
  actorId: string | null;
}

/**
 * Insert notifications, skipping any the recipient already has for this activity.
 *
 * The table is partitioned, so it cannot carry the unique constraint `ON CONFLICT` would need as
 * an arbiter; the `NOT EXISTS` guard absorbs at-least-once redelivery. Safe as the only writer: the
 * CDC worker holds one backend connection, so the fan-out runs once per event.
 */
export async function insertNotificationsIgnoringDuplicates(rows: NotificationInsert[]): Promise<void> {
  if (rows.length === 0) return;

  const values = sql.join(
    rows.map(
      (row) =>
        sql`(${generateId()}::uuid, now(), ${row.userId}::uuid, ${row.actorId}::uuid, ${row.type}, ${row.entityType}, ${row.subjectId}::uuid, ${row.contextId}::uuid, ${row.channelId}::uuid, ${row.channelType}, ${row.organizationId}::uuid, ${row.tenantId}, ${row.activityId})`,
    ),
    sql`, `,
  );

  await baseDb.execute(sql`
    WITH candidate (id, created_at, user_id, actor_id, type, entity_type, subject_id, context_id, channel_id, channel_type, organization_id, tenant_id, activity_id) AS (
      VALUES ${values}
    )
    INSERT INTO notifications (id, created_at, user_id, actor_id, type, entity_type, subject_id, context_id, channel_id, channel_type, organization_id, tenant_id, activity_id)
    SELECT c.id, c.created_at, c.user_id, c.actor_id, c.type, c.entity_type, c.subject_id, c.context_id, c.channel_id, c.channel_type, c.organization_id, c.tenant_id, c.activity_id
    FROM candidate c
    WHERE NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = c.user_id AND n.activity_id = c.activity_id AND n.type = c.type
    )
  `);
}

// ── Instant email ────────────────────────────────────────────────────────────

/**
 * Unmailed rows the instant pass mails, oldest first so a backlog drains in order. A mention goes
 * to recipients who keep mention email on; the preferences row is created on first read of the
 * settings, so a missing row means the default (on), hence the left join. A comment or reply, when
 * the app offers them (`instantEmailTypes`), goes only to recipients who turned comment email on.
 */
export async function findPendingInstantEmails(organizationId: string, limit: number) {
  const wantsMail = or(
    and(
      eq(notificationsTable.type, 'mention'),
      or(isNull(notificationPreferencesTable.userId), eq(notificationPreferencesTable.mentionEmail, true)),
    ),
    and(ne(notificationsTable.type, 'mention'), eq(notificationPreferencesTable.commentEmail, true)),
  );

  return baseDb
    .select({
      id: notificationsTable.id,
      type: notificationsTable.type,
      userId: notificationsTable.userId,
      subjectId: notificationsTable.subjectId,
      entityType: notificationsTable.entityType,
      contextId: notificationsTable.contextId,
      tenantId: notificationsTable.tenantId,
      organizationId: notificationsTable.organizationId,
      actorId: notificationsTable.actorId,
      channelId: notificationsTable.channelId,
      channelType: notificationsTable.channelType,
    })
    .from(notificationsTable)
    .leftJoin(notificationPreferencesTable, eq(notificationPreferencesTable.userId, notificationsTable.userId))
    .where(
      and(
        eq(notificationsTable.organizationId, organizationId),
        inArray(notificationsTable.type, instantEmailTypes()),
        wantsMail,
        isNull(notificationsTable.emailedAt),
        isNull(notificationsTable.readAt),
        recipientStillBelongs,
      ),
    )
    .orderBy(asc(notificationsTable.createdAt))
    .limit(limit);
}

/** Recipients with a verified address; anyone else keeps the in-app notification only. */
export async function findVerifiedRecipients(userIds: string[]) {
  if (userIds.length === 0) return [];

  return baseDb
    .selectDistinctOn([usersTable.id], {
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      language: usersTable.language,
    })
    .from(usersTable)
    .innerJoin(emailsTable, and(eq(emailsTable.userId, usersTable.id), eq(emailsTable.verified, true)))
    .where(inArray(usersTable.id, userIds))
    .orderBy(usersTable.id);
}

/** Minimal user objects for actors, keyed by id; a deleted actor is simply absent. */
export async function findUsersMinimal(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, UserMinimalBase>();

  const rows = await baseDb
    .select({ id: usersTable.id, name: usersTable.name, slug: usersTable.slug, thumbnailUrl: usersTable.thumbnailUrl })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  return new Map(rows.map((row) => [row.id, toUserMinimalBase(row)]));
}

export async function findUserNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();

  const rows = await baseDb
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Settles rows the instant-mail pass took, mailed or skipped for good: neither it nor the digest reads them again. */
export async function stampEmailed(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  await baseDb
    .update(notificationsTable)
    .set({ emailedAt: new Date().toISOString() })
    .where(inArray(notificationsTable.id, notificationIds));
}

// ── Digest ───────────────────────────────────────────────────────────────────

/**
 * Recipients whose digest is due: verified address, cadence on (the default without a preferences row), not yet
 * run today, and at least one row `findUndigestedNotifications` would return for the runner's window
 * (`lastDigestAt`, no further back than `earliest` for the cadence; see run-digest.ts). A run walks only users
 * with something to send.
 */
export async function findDueDigestRecipients(
  dayStart: string,
  includeWeekly: boolean,
  earliest: Record<'daily' | 'weekly', string>,
  limit: number,
) {
  const digest = sql<DigestFrequency>`coalesce(${notificationPreferencesTable.digest}, ${defaultDigestFrequency})`;
  const cadences: DigestFrequency[] = includeWeekly ? ['daily', 'weekly'] : ['daily'];
  const earliestForCadence = sql`case when ${digest} = 'weekly'
    then ${earliest.weekly}::timestamp else ${earliest.daily}::timestamp end`;
  // greatest() skips nulls: without a stamp the window starts at the earliest start.
  const windowStart = sql`greatest(${notificationPreferencesTable.lastDigestAt}, ${earliestForCadence})`;
  const hasUndigested = sql`exists (
    select 1 from ${notificationsTable}
    where ${notificationsTable.userId} = ${usersTable.id}
      and ${notificationsTable.readAt} is null
      and ${notificationsTable.emailedAt} is null
      and ${notificationsTable.digestedAt} is null
      and ${notificationsTable.createdAt} >= ${windowStart}
      and ${recipientStillBelongs}
  )`;

  return (
    baseDb
      .selectDistinctOn([usersTable.id], {
        userId: usersTable.id,
        digest,
        lastDigestAt: notificationPreferencesTable.lastDigestAt,
        email: usersTable.email,
        language: usersTable.language,
      })
      .from(usersTable)
      // Verified addresses only; mailing dormant and never-activated accounts helps no one.
      .innerJoin(emailsTable, and(eq(emailsTable.userId, usersTable.id), eq(emailsTable.verified, true)))
      .leftJoin(notificationPreferencesTable, eq(notificationPreferencesTable.userId, usersTable.id))
      .where(
        and(
          inArray(digest, cadences),
          or(
            isNull(notificationPreferencesTable.lastDigestAt),
            lt(notificationPreferencesTable.lastDigestAt, dayStart),
          ),
          hasUndigested,
        ),
      )
      .orderBy(usersTable.id)
      .limit(limit)
  );
}

/** Unread, un-emailed, un-digested rows since `since`; the digest's whole content source. */
export async function findUndigestedNotifications(userId: string, since: string, limit: number) {
  const filters = [
    eq(notificationsTable.userId, userId),
    isNull(notificationsTable.readAt),
    isNull(notificationsTable.emailedAt),
    isNull(notificationsTable.digestedAt),
    gte(notificationsTable.createdAt, since),
    recipientStillBelongs,
  ];

  return baseDb
    .selectDistinctOn([notificationsTable.activityId, notificationsTable.type], {
      id: notificationsTable.id,
      type: notificationsTable.type,
      entityType: notificationsTable.entityType,
      activityId: notificationsTable.activityId,
      subjectId: notificationsTable.subjectId,
      channelId: notificationsTable.channelId,
      contextId: notificationsTable.contextId,
      tenantId: notificationsTable.tenantId,
    })
    .from(notificationsTable)
    .where(and(...filters))
    .orderBy(notificationsTable.activityId, notificationsTable.type, asc(notificationsTable.createdAt))
    .limit(limit);
}

export async function stampDigested(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  await baseDb
    .update(notificationsTable)
    .set({ digestedAt: new Date().toISOString() })
    .where(inArray(notificationsTable.id, notificationIds));
}

/** Upserts, so a user who never saved preferences gets a row with the defaults and the stamp. */
export async function stampDigestRun(userIds: string[], ranAt: string): Promise<void> {
  if (userIds.length === 0) return;
  await baseDb
    .insert(notificationPreferencesTable)
    .values(userIds.map((userId) => ({ userId, lastDigestAt: ranAt })))
    .onConflictDoUpdate({ target: notificationPreferencesTable.userId, set: { lastDigestAt: ranAt } });
}
