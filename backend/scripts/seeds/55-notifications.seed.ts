import type { SeedScript } from '../types';
import { faker } from '@faker-js/faker';
import { and, desc, eq, inArray, isNull, like, ne } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';
import { hierarchy } from 'shared';
import { noteSpinnerWarning, startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';
import { getSeedDb } from '#/db/db';
import { homeChannelIdSql } from '#/db/utils/home-channel';
import { publishedRowsPredicate } from '#/db/utils/published-predicate';
import type { NotificationSubjectRow } from '#/lib/module';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { type InsertNotificationModel, notificationsTable } from '#/modules/notification/notification-db';
import { mockSeedNotification } from '#/modules/notification/notification-mocks';
import { seedMentionEntityTypes } from '#/modules/notification/notification-seed-subjects';
import { getNotificationSource } from '#/modules/notification/notification-sources';
import { usersTable } from '#/modules/user/user-db';
import { getEntityTable } from '#/tables';
import { defaultAdminUser } from '../fixtures';
import { appendMention } from './description-document';

// Seed scripts use the admin connection for privileged operations.
const db = getSeedDb();

/** Mentions of the admin per product type, dealt round-robin over the admin's home channels. */
const MENTIONS_PER_TYPE = 20;

const mentionBodies = [
  'could you have a look at this?',
  'can you take this one over?',
  'what do you think, good to go?',
  'this needs your review before we continue.',
];

type SubjectTable = AnyPgTable & Record<'id' | 'organizationId' | 'createdAt' | 'deletedAt' | 'description' | 'updatedAt' | 'updatedBy', PgColumn>;
type SubjectRow = NotificationSubjectRow & { tenantId: string; createdAt: string };

const isNotificationsSeeded = async () => {
  const rows = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(like(notificationsTable.activityId, 'seed:%'))
    .limit(1);
  return rows.length > 0;
};

/**
 * Gives the admin an inbox: for each type in `seedMentionEntityTypes`, another member of a channel the admin belongs
 * to mentions the admin in a closing paragraph of a row homed there (`updatedBy` records the editor, `createdBy` is
 * immutable), and the matching `mention` row is written as the fan-out would write it. Homing every mention in one of
 * the admin's own channels keeps each link resolvable from the menu, which a system admin's read access alone does not.
 */
export const notificationsSeed = async () => {
  startSpinner('Seeding notifications...');

  if (await isNotificationsSeeded()) {
    warnSpinner('Seeded notifications found → skip seeding');
    return;
  }

  const [admin] = await db
    .select({ id: usersTable.id, name: usersTable.name, slug: usersTable.slug })
    .from(usersTable)
    .where(eq(usersTable.id, defaultAdminUser.id))
    .limit(1);
  if (!admin) {
    warnSpinner('Admin user not found → run init seed first');
    return;
  }

  const adminChannels = await db
    .select({ channelType: membershipsTable.channelType, channelId: membershipsTable.channelId, organizationId: membershipsTable.organizationId })
    .from(membershipsTable)
    .where(eq(membershipsTable.userId, admin.id))
    .orderBy(membershipsTable.channelId);

  const otherMembers = await db
    .select({ channelId: membershipsTable.channelId, userId: membershipsTable.userId })
    .from(membershipsTable)
    .where(
      and(
        inArray(
          membershipsTable.channelId,
          adminChannels.map(({ channelId }) => channelId),
        ),
        ne(membershipsTable.userId, admin.id),
      ),
    );
  const membersByChannel = Map.groupBy(otherMembers, ({ channelId }) => channelId);

  const rows: InsertNotificationModel[] = [];
  const edits: { table: SubjectTable; id: string; description: string; updatedBy: string; updatedAt: InsertNotificationModel['createdAt'] }[] = [];

  for (const entityType of seedMentionEntityTypes) {
    const source = getNotificationSource(entityType);
    if (!source || source.declaration.mentionable === false) {
      noteSpinnerWarning(`The ${entityType} module declares no mention fan-out → no ${entityType} mentions seeded`);
      continue;
    }

    const table = getEntityTable(entityType) as SubjectTable;
    const homeChannelId = homeChannelIdSql(entityType, table);
    const homeTypes = new Set<string>(hierarchy.getOrderedAncestors(entityType));
    const homes = adminChannels.filter(({ channelType, channelId }) => homeTypes.has(channelType) && membersByChannel.has(channelId));

    let mentioned = 0;
    // Pass n takes each home's nth newest row, so the mentions spread over channels before any channel gets a second.
    for (let pass = 0; mentioned < MENTIONS_PER_TYPE; pass++) {
      const before = mentioned;
      for (const { channelId, organizationId } of homes) {
        if (mentioned === MENTIONS_PER_TYPE) break;

        const [subject] = (await db
          .select()
          .from(table)
          .where(and(eq(table.organizationId, organizationId), eq(homeChannelId, channelId), isNull(table.deletedAt), publishedRowsPredicate(table)))
          .orderBy(desc(table.createdAt))
          .offset(pass)
          .limit(1)) as SubjectRow[];
        if (!subject) continue;

        const members = membersByChannel.get(channelId) ?? [];
        const author = members.find(({ userId }) => userId === subject.createdBy);
        const actorId = (author ?? faker.helpers.arrayElement(members)).userId;

        const notification = mockSeedNotification(entityType, subject, 'mention', admin.id, actorId);
        if (source.declaration.resolveContextId) notification.contextId = source.declaration.resolveContextId(subject);
        rows.push(notification);
        edits.push({
          table,
          id: subject.id,
          description: appendMention(subject.description, admin, faker.helpers.arrayElement(mentionBodies)),
          updatedBy: actorId,
          updatedAt: notification.createdAt,
        });
        mentioned++;
      }
      if (mentioned === before) break;
    }
  }

  if (!rows.length) {
    warnSpinner(`No ${seedMentionEntityTypes.join(' or ')} rows in channels the admin shares with a member → seed those first`);
    return;
  }

  // Inbox rows first: a CDC worker that replicates the edits below finds the admin already told and adds no second row.
  await db.insert(notificationsTable).values(rows);
  for (const { table, id, ...edit } of edits) await db.update(table).set(edit).where(eq(table.id, id));

  const unread = rows.filter((row) => !row.readAt).length;
  succeedSpinner(`Created ${rows.length} mention notifications for the admin (${unread} unread)`);
};

export const seedConfig: SeedScript = { name: 'notifications', run: notificationsSeed };
