import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { accessFrom } from '#/permissions/access';
import { findChannelNames } from '../helpers/channel-names';
import { findReadableSubjectIds } from '../helpers/readable-subjects';
import { findSubjectNames } from '../helpers/subject-names';
import { countUnreadByUser, findNotificationsByUser, findUsersMinimal } from '../notification-queries';
import type { notificationSchema } from '../notification-schema';

type NotificationResponse = z.infer<typeof notificationSchema>;

export interface GetNotificationsInput {
  unreadOnly: boolean;
  limit: number;
  before?: string;
}

/**
 * The inbox page plus the unread count, with the actor, channel and subject names the card's
 * sentence needs.
 *
 * Both travel together so the badge can never disagree with the list the user is looking at; the
 * client treats this response as the source of truth and any realtime signal only as a hint to
 * refetch it. Rows of an organization the user left are gone from both, and a subject the user
 * may no longer read keeps its row with empty names.
 */
export async function getNotificationsOp(ctx: UserContext, input: GetNotificationsInput) {
  const userId = ctx.var.user.id;

  const [rows, unreadCount] = await Promise.all([
    findNotificationsByUser(ctx, { userId, ...input }),
    countUnreadByUser(ctx, userId),
  ]);

  const readable = await findReadableSubjectIds(accessFrom(ctx), rows);
  const readableRows = rows.filter((row) => readable.has(row.subjectId));

  const [actors, channelNames, subjectTitles] = await Promise.all([
    findUsersMinimal(rows.map((row) => row.actorId).filter((id): id is string => id !== null)),
    findChannelNames(readableRows.map((row) => row.channelId)),
    findSubjectNames(readableRows.map((row) => ({ ...row, id: row.subjectId }))),
  ]);

  const items: NotificationResponse[] = rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    type: row.type,
    entityType: row.entityType,
    subjectId: row.subjectId,
    contextId: row.contextId,
    channelId: row.channelId,
    channelType: row.channelType,
    organizationId: row.organizationId,
    tenantId: row.tenantId,
    actorId: row.actorId,
    actor: (row.actorId && actors.get(row.actorId)) || null,
    channelName: (readable.has(row.subjectId) && channelNames.get(row.channelId)) || '',
    subjectTitle: subjectTitles.get(row.subjectId) ?? '',
    readAt: row.readAt,
  }));

  return { items, unreadCount };
}
