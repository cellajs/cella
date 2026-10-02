import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { type Access, appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { DbContext } from '#/core/context';
import { type MembershipBaseModel, toMembershipBase } from '#/modules/memberships/helpers/select';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { emailsTable } from '#/modules/user/emails-db';
import { toUserMinimalBase, type UserMinimalBase } from '#/modules/user/helpers/audit-user';
import { usersTable } from '#/modules/user/user-db';
import { getEntityTable } from '#/tables';
import { type DigestFrequency, defaultDigestFrequency, notificationPreferencesTable, notificationsTable } from './notification-db';
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
    .orderBy(notificationsTable.userId, notificationsTable.activityId, notificationsTable.type, desc(notificationsTable.createdAt))
    .limit(limit);

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

interface CountUnreadByUserOpts {
  userId: string;
}

export async function countUnreadByUser(ctx: DbContext, { userId }: CountUnreadByUserOpts): Promise<number> {
  const [row] = await ctx.var.db
    .select({ count: sql<number>`count(distinct (${notificationsTable.activityId}, ${notificationsTable.type}))::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt), recipientStillBelongs));

  return row?.count ?? 0;
}

interface MarkNotificationsReadOpts {
  userId: string;
  /** Every unread row of the user when omitted. */
  ids?: string[];
}

/** Marks the given rows read, or every unread row when `ids` is omitted. Idempotent. */
export async function markNotificationsRead(ctx: DbContext, { userId, ids }: MarkNotificationsReadOpts): Promise<number> {
  const filters = [eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)];
  if (ids?.length) filters.push(inArray(notificationsTable.id, ids));

  const updated = await ctx.var.db
    .update(notificationsTable)
    .set({ readAt: new Date().toISOString() })
    .where(and(...filters))
    .returning({ id: notificationsTable.id });

  return updated.length;
}

interface MarkContextNotificationsReadOpts {
  userId: string;
  contextId: string;
}

/** Marks everything sharing one context read: the "opening the thread clears its badge" path. */
export async function markContextNotificationsRead(ctx: DbContext, { userId, contextId }: MarkContextNotificationsReadOpts): Promise<number> {
  const updated = await ctx.var.db
    .update(notificationsTable)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.contextId, contextId), isNull(notificationsTable.readAt)))
    .returning({ id: notificationsTable.id });

  return updated.length;
}

// ── Preferences ──────────────────────────────────────────────────────────────

interface FindOrCreatePreferencesOpts {
  userId: string;
}

/** Preferences row, created on first read so callers never handle a missing row. */
export async function findOrCreatePreferences(ctx: DbContext, { userId }: FindOrCreatePreferencesOpts) {
  const { db } = ctx.var;

  const [existing] = await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(notificationPreferencesTable).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;

  const [raced] = await db.select().from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId, userId)).limit(1);
  return raced;
}

interface UpdatePreferencesOpts {
  userId: string;
  values: { mentionEmail?: boolean; commentEmail?: boolean; digest?: DigestFrequency };
}

export async function updatePreferences(ctx: DbContext, { userId, values }: UpdatePreferencesOpts) {
  const [updated] = await ctx.var.db
    .update(notificationPreferencesTable)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(notificationPreferencesTable.userId, userId))
    .returning();

  return updated;
}

// ── Fan-out ──────────────────────────────────────────────────────────────────

interface FindNotifiedUserIdsOpts {
  subjectId: string;
  userIds: string[];
}

/** Users already holding a notification for this subject, so an edit cannot notify them twice. */
export async function findNotifiedUserIds(ctx: DbContext, { subjectId, userIds }: FindNotifiedUserIdsOpts): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const existing = await ctx.var.db
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

interface InsertNotificationsIgnoringDuplicatesOpts {
  rows: NotificationInsert[];
}

/**
 * Insert notifications, skipping any the recipient already has for this activity.
 *
 * The table is partitioned, so it cannot carry the unique constraint `ON CONFLICT` would need as
 * an arbiter; the `NOT EXISTS` guard absorbs at-least-once redelivery. Safe as the only writer: the
 * CDC worker holds one backend connection, so the fan-out runs once per event.
 */
export async function insertNotificationsIgnoringDuplicates(ctx: DbContext, { rows }: InsertNotificationsIgnoringDuplicatesOpts): Promise<void> {
  if (rows.length === 0) return;

  const values = sql.join(
    rows.map(
      (row) =>
        sql`(${generateId()}::uuid, now(), ${row.userId}::uuid, ${row.actorId}::uuid, ${row.type}, ${row.entityType}, ${row.subjectId}::uuid, ${row.contextId}::uuid, ${row.channelId}::uuid, ${row.channelType}, ${row.organizationId}::uuid, ${row.tenantId}, ${row.activityId})`,
    ),
    sql`, `,
  );

  await ctx.var.db.execute(sql`
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

/** Always the identified variant: these are known users, never the anonymous actor. */
export type UserAccess = Extract<Access<MembershipBaseModel>, { actorId: string }>;

interface GetUserAccessOpts {
  userIds: string[];
}

/**
 * Build permission `Access` objects for arbitrary users, connected or not.
 *
 * `actorFrom`/`accessFrom` read the request context, so they only ever describe the caller, and
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

  const [memberships, systemAdmins] = await Promise.all([
    ctx.var.db.select().from(membershipsTable).where(inArray(membershipsTable.userId, unique)),
    ctx.var.db.select({ userId: systemRolesTable.userId }).from(systemRolesTable).where(eq(systemRolesTable.role, 'admin')),
  ]);

  const adminIds = new Set(systemAdmins.map((row) => row.userId));

  const byUser = new Map<string, MembershipBaseModel[]>();
  for (const membership of memberships) {
    const list = byUser.get(membership.userId) ?? [];
    list.push(toMembershipBase(membership as Record<string, unknown>));
    byUser.set(membership.userId, list);
  }

  for (const userId of unique) {
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
 * Driven by `appConfig.channelEntityTypes`, so a hierarchy change is picked up automatically. Channel tables sit outside RLS (application-layer guards cover them),
 * and the ids only ever come from rows the recipient was already cleared to read.
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

// ── Instant email ────────────────────────────────────────────────────────────

interface FindPendingInstantEmailsOpts {
  organizationId: string;
  limit: number;
}

/**
 * Unmailed rows the instant pass mails, oldest first so a backlog drains in order. A mention goes
 * to recipients who keep mention email on; the preferences row is created on first read of the
 * settings, so a missing row means the default (on), hence the left join. A comment or reply, when
 * the app offers them (`instantEmailTypes`), goes only to recipients who turned comment email on.
 */
export async function findPendingInstantEmails(ctx: DbContext, { organizationId, limit }: FindPendingInstantEmailsOpts) {
  const mentionEmailOn = or(isNull(notificationPreferencesTable.userId), eq(notificationPreferencesTable.mentionEmail, true));
  const wantsMail = or(
    and(eq(notificationsTable.type, 'mention'), mentionEmailOn),
    and(ne(notificationsTable.type, 'mention'), eq(notificationPreferencesTable.commentEmail, true)),
  );

  return ctx.var.db
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

interface UserIdsOpts {
  userIds: string[];
}

/** Recipients with a verified address; anyone else keeps the in-app notification only. */
export async function findVerifiedRecipients(ctx: DbContext, { userIds }: UserIdsOpts) {
  if (userIds.length === 0) return [];

  return ctx.var.db
    .selectDistinctOn([usersTable.id], { id: usersTable.id, email: usersTable.email, name: usersTable.name, language: usersTable.language })
    .from(usersTable)
    .innerJoin(emailsTable, and(eq(emailsTable.userId, usersTable.id), eq(emailsTable.verified, true)))
    .where(inArray(usersTable.id, userIds))
    .orderBy(usersTable.id);
}

/** Minimal user objects for actors, keyed by id; a deleted actor is simply absent. */
export async function findUsersMinimal(ctx: DbContext, { userIds }: UserIdsOpts) {
  if (userIds.length === 0) return new Map<string, UserMinimalBase>();

  const rows = await ctx.var.db
    .select({ id: usersTable.id, name: usersTable.name, slug: usersTable.slug, thumbnailUrl: usersTable.thumbnailUrl })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  return new Map(rows.map((row) => [row.id, toUserMinimalBase(row)]));
}

export async function findUserNames(ctx: DbContext, { userIds }: UserIdsOpts): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();

  const rows = await ctx.var.db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds));

  return new Map(rows.map((row) => [row.id, row.name]));
}

interface NotificationIdsOpts {
  ids: string[];
}

/** Settles rows the instant-mail pass took, mailed or skipped for good: neither it nor the digest reads them again. */
export async function stampEmailed(ctx: DbContext, { ids }: NotificationIdsOpts): Promise<void> {
  if (ids.length === 0) return;
  await ctx.var.db.update(notificationsTable).set({ emailedAt: new Date().toISOString() }).where(inArray(notificationsTable.id, ids));
}

// ── Digest ───────────────────────────────────────────────────────────────────

interface FindDueDigestRecipientsOpts {
  /** Start of today: a recipient already run since then is not due. */
  dayStart: string;
  includeWeekly: boolean;
  /** How far back each cadence's window reaches at most. */
  earliest: Record<'daily' | 'weekly', string>;
  limit: number;
}

/**
 * Recipients whose digest is due: verified address, cadence on (the default without a preferences row), not yet
 * run today, and at least one row `findUndigestedNotifications` would return for the runner's window
 * (`lastDigestAt`, no further back than `earliest` for the cadence; see run-digest.ts). A run walks only users
 * with something to send.
 */
export async function findDueDigestRecipients(ctx: DbContext, { dayStart, includeWeekly, earliest, limit }: FindDueDigestRecipientsOpts) {
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
    ctx.var.db
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
          or(isNull(notificationPreferencesTable.lastDigestAt), lt(notificationPreferencesTable.lastDigestAt, dayStart)),
          hasUndigested,
        ),
      )
      .orderBy(usersTable.id)
      .limit(limit)
  );
}

interface FindUndigestedNotificationsOpts {
  userId: string;
  since: string;
  limit: number;
}

/** Unread, un-emailed, un-digested rows since `since`; the digest's whole content source. */
export async function findUndigestedNotifications(ctx: DbContext, { userId, since, limit }: FindUndigestedNotificationsOpts) {
  const filters = [
    eq(notificationsTable.userId, userId),
    isNull(notificationsTable.readAt),
    isNull(notificationsTable.emailedAt),
    isNull(notificationsTable.digestedAt),
    gte(notificationsTable.createdAt, since),
    recipientStillBelongs,
  ];

  return ctx.var.db
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

export async function stampDigested(ctx: DbContext, { ids }: NotificationIdsOpts): Promise<void> {
  if (ids.length === 0) return;
  await ctx.var.db.update(notificationsTable).set({ digestedAt: new Date().toISOString() }).where(inArray(notificationsTable.id, ids));
}

interface StampDigestRunOpts {
  userIds: string[];
  ranAt: string;
}

/** Upserts, so a user who never saved preferences gets a row with the defaults and the stamp. */
export async function stampDigestRun(ctx: DbContext, { userIds, ranAt }: StampDigestRunOpts): Promise<void> {
  if (userIds.length === 0) return;
  await ctx.var.db
    .insert(notificationPreferencesTable)
    .values(userIds.map((userId) => ({ userId, lastDigestAt: ranAt })))
    .onConflictDoUpdate({ target: notificationPreferencesTable.userId, set: { lastDigestAt: ranAt } });
}
