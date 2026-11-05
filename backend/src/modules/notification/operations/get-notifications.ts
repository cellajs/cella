import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import {
  countUnreadByUser,
  type FindNotificationsOpts,
  findChannelLabels,
  findNotificationsByUser,
  findUsersMinimal,
} from '#/modules/notification/notification-queries';
import type { notificationSchema } from '#/modules/notification/notification-schema';
import { findContextNames } from '#/modules/notification/notification-sources';
import { findReadableSubjectIds } from '#/modules/notification/operations/readable-subjects';
import { accessFrom } from '#/permissions/access';

type NotificationResponse = z.infer<typeof notificationSchema>;

type GetNotificationsInput = Omit<FindNotificationsOpts, 'userId'>;

/**
 * The inbox page plus the unread count, with the actor, channel and subject names the card's
 * sentence needs, and the organization and channel images that place it.
 *
 * Both travel together so the badge can never disagree with the list the user is looking at; the
 * client treats this response as the source of truth and any realtime signal only as a hint to
 * refetch it. Rows of an organization the user left are gone from both, and a subject the user
 * may no longer read keeps its row with empty names.
 */
export async function getNotificationsOp(ctx: UserContext, input: GetNotificationsInput) {
  const userId = ctx.var.user.id;

  const [rows, unreadCount] = await Promise.all([findNotificationsByUser(ctx, { userId, ...input }), countUnreadByUser(ctx, { userId })]);

  const readable = await findReadableSubjectIds(accessFrom(ctx), rows);
  const readableRows = rows.filter((row) => readable.has(row.subjectId));

  const [actors, channels, contextNames] = await Promise.all([
    findUsersMinimal(ctx, { userIds: rows.map((row) => row.actorId).filter((id): id is string => id !== null) }),
    findChannelLabels(ctx, { channelIds: [...readableRows.map((row) => row.channelId), ...rows.map((row) => row.organizationId)] }),
    findContextNames(readableRows.map((row) => ({ ...row, id: row.contextId ?? row.subjectId }))),
  ]);

  const items: NotificationResponse[] = rows.map((row) => {
    const channel = readable.has(row.subjectId) ? channels.get(row.channelId) : undefined;
    const organization = channels.get(row.organizationId);
    return {
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
      channelName: channel?.name ?? '',
      channelThumbnailUrl: channel?.thumbnailUrl ?? null,
      organizationName: organization?.name ?? '',
      organizationThumbnailUrl: organization?.thumbnailUrl ?? null,
      subjectTitle: contextNames.get(row.contextId ?? row.subjectId) ?? '',
      readAt: row.readAt,
    };
  });

  return { items, unreadCount };
}
