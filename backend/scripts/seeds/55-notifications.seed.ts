import type { SeedScript } from '../types';
import { and, eq, like, ne } from 'drizzle-orm';
import { generateId } from 'shared/utils/entity-id';
import { startSpinner, succeedSpinner, warnSpinner } from '#/utils/console';
import { getSeedDb } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { type InsertNotificationModel, notificationsTable } from '#/modules/notification/notification-db';
import { mockSeedNotification } from '#/modules/notification/notification-mocks';
import { usersTable } from '#/modules/user/user-db';
import { defaultAdminUser } from '../fixtures';

// Seed scripts use the admin connection for privileged operations.
const db = getSeedDb();

/** Attachments per organization that mention the admin in their description. */
const MENTIONS_PER_ORGANIZATION = 2;

/** A block document with one paragraph mentioning `user`, as the composer stores it. */
const mentionDocument = (user: { id: string; name: string; slug: string }, text: string) =>
  JSON.stringify([
    {
      id: generateId(),
      type: 'paragraph',
      props: {},
      content: [
        { type: 'mention', props: { id: user.id, name: user.name, slug: user.slug } },
        { type: 'text', text: ` ${text}`, styles: {} },
      ],
      children: [],
    },
  ]);

const isNotificationsSeeded = async () => {
  const rows = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(like(notificationsTable.activityId, 'seed:%'))
    .limit(1);
  return rows.length > 0;
};

/**
 * Gives the admin an inbox: per organization, a member edits a few seeded attachments and mentions
 * the admin in their description (`createdBy` is immutable, `updatedBy` records the editor as the
 * fan-out would), and the matching `mention` rows are inserted as the fan-out would write them.
 * Attachment rows and inbox rows therefore agree, so the bell, the description caption and the
 * `/n` link all work on seeded data.
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

  // Organizations the admin belongs to, each with one seeded member to act as the editor.
  const adminMemberships = await db
    .select({ organizationId: membershipsTable.organizationId })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, admin.id), eq(membershipsTable.channelType, 'organization')));

  const rows: InsertNotificationModel[] = [];
  for (const { organizationId } of adminMemberships) {
    const [member] = await db
      .select({ userId: membershipsTable.userId })
      .from(membershipsTable)
      .where(
        and(
          eq(membershipsTable.organizationId, organizationId),
          eq(membershipsTable.channelType, 'organization'),
          ne(membershipsTable.userId, admin.id),
        ),
      )
      .limit(1);
    if (!member) continue;

    const attachments = await db
      .select()
      .from(attachmentsTable)
      .where(and(eq(attachmentsTable.organizationId, organizationId), eq(attachmentsTable.createdBy, admin.id)))
      .limit(MENTIONS_PER_ORGANIZATION);
    if (!attachments.length) continue;

    for (const attachment of attachments) {
      await db
        .update(attachmentsTable)
        .set({
          updatedBy: member.userId,
          mentions: [admin.id],
          description: mentionDocument(admin, `could you have a look at ${attachment.name}?`),
        })
        .where(eq(attachmentsTable.id, attachment.id));
      rows.push(mockSeedNotification('attachment', attachment, 'mention', admin.id, member.userId));
    }
  }

  if (!rows.length) {
    warnSpinner('No seeded attachments in the admin organizations → run attachments seed first');
    return;
  }

  await db.insert(notificationsTable).values(rows);

  const unread = rows.filter((row) => !row.readAt).length;
  succeedSpinner(`Created ${rows.length} mention notifications for the admin (${unread} unread)`);
};

export const seedConfig: SeedScript = { name: 'notifications', run: notificationsSeed };
