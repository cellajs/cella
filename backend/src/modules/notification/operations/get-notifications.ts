import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import { findChannelNames } from '../helpers/channel-names';
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
 * refetch it.
 */
export async function getNotificationsOp(ctx: AuthContext, input: GetNotificationsInput) {
  const userId = ctx.var.user.id;

  const [rows, unreadCount] = await Promise.all([
    findNotificationsByUser(ctx, { userId, ...input }),
    countUnreadByUser(ctx, userId),
  ]);

  const [actors, channelNames, subjectTitles] = await Promise.all([
    findUsersMinimal(rows.map((row) => row.actorId).filter((id): id is string => id !== null)),
    findChannelNames(rows.map((row) => row.channelId)),
    findSubjectNames(rows.map((row) => ({ ...row, id: row.subjectId }))),
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
    channelName: channelNames.get(row.channelId) ?? '',
    subjectTitle: subjectTitles.get(row.subjectId) ?? '',
    readAt: row.readAt,
  }));

  return { items, unreadCount };
}
