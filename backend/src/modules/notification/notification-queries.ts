import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { emailsTable } from '#/modules/user/emails-db';
import { toUserMinimalBase, type UserMinimalBase } from '#/modules/user/helpers/audit-user';
import { usersTable } from '#/modules/user/user-db';
import { type DigestFrequency, notificationPreferencesTable, notificationsTable } from './notification-db';
import type { NotificationType } from './notification-types';

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

  const filters = [eq(notificationsTable.userId, userId)];
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
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)));

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
 * Unmailed mention notifications for recipients who still want the email. The preferences row is
 * created on first read of the settings, so a missing row means the default (on), hence the
 * left join.
 */
export async function findPendingMentionEmails(organizationId: string, limit: number) {
  return baseDb
    .select({
      id: notificationsTable.id,
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
        eq(notificationsTable.type, 'mention'),
        isNull(notificationsTable.emailedAt),
        isNull(notificationsTable.readAt),
        or(isNull(notificationPreferencesTable.userId), eq(notificationPreferencesTable.mentionEmail, true)),
      ),
    )
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

export async function stampEmailed(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  await baseDb
    .update(notificationsTable)
    .set({ emailedAt: new Date().toISOString() })
    .where(inArray(notificationsTable.id, notificationIds));
}

// ── Digest ───────────────────────────────────────────────────────────────────

/** Recipients whose digest is due: cadence on, verified address, not yet run for this window. */
export async function findDueDigestRecipients(dayStart: string, includeWeekly: boolean, limit: number) {
  const notRunThisWindow = or(
    isNull(notificationPreferencesTable.lastDigestAt),
    lt(notificationPreferencesTable.lastDigestAt, dayStart),
  );

  const cadences = [and(eq(notificationPreferencesTable.digest, 'daily'), notRunThisWindow)];
  if (includeWeekly) cadences.push(and(eq(notificationPreferencesTable.digest, 'weekly'), notRunThisWindow));

  return (
    baseDb
      .selectDistinctOn([notificationPreferencesTable.userId], {
        userId: notificationPreferencesTable.userId,
        digest: notificationPreferencesTable.digest,
        lastDigestAt: notificationPreferencesTable.lastDigestAt,
        email: usersTable.email,
        language: usersTable.language,
      })
      .from(notificationPreferencesTable)
      .innerJoin(usersTable, eq(usersTable.id, notificationPreferencesTable.userId))
      // Verified addresses only; mailing dormant and never-activated accounts helps no one.
      .innerJoin(emailsTable, and(eq(emailsTable.userId, usersTable.id), eq(emailsTable.verified, true)))
      .where(and(ne(notificationPreferencesTable.digest, 'off'), or(...cadences)))
      .orderBy(notificationPreferencesTable.userId)
      .limit(limit)
  );
}

/** Unread, un-emailed, un-digested rows in the window; the digest's whole content source. */
export async function findUndigestedNotifications(userId: string, since: string | null, limit: number) {
  const filters = [
    eq(notificationsTable.userId, userId),
    isNull(notificationsTable.readAt),
    isNull(notificationsTable.emailedAt),
    isNull(notificationsTable.digestedAt),
  ];
  if (since) filters.push(gte(notificationsTable.createdAt, since));

  return baseDb
    .selectDistinctOn([notificationsTable.activityId, notificationsTable.type], {
      id: notificationsTable.id,
      type: notificationsTable.type,
      entityType: notificationsTable.entityType,
      activityId: notificationsTable.activityId,
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

export async function stampDigestRun(userIds: string[], ranAt: string): Promise<void> {
  if (userIds.length === 0) return;
  await baseDb
    .update(notificationPreferencesTable)
    .set({ lastDigestAt: ranAt })
    .where(inArray(notificationPreferencesTable.userId, userIds));
}
