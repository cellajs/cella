import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import { countUnreadByUser, findNotificationsByUser } from '../notification-queries';
import type { notificationSchema } from '../notification-schema';

type NotificationResponse = z.infer<typeof notificationSchema>;

export interface GetNotificationsInput {
  unreadOnly: boolean;
  limit: number;
  before?: string;
}

/**
 * The inbox page plus the unread count.
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
    readAt: row.readAt,
  }));

  return { items, unreadCount };
}
