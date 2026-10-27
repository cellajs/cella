import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import {
  countUnreadByUser,
  type FindNotificationsOpts,
  findChannelNames,
  findNotificationsByUser,
  findUsersMinimal,
} from '#/modules/notification/notification-queries';
import type { notificationSchema } from '#/modules/notification/notification-schema';
import { findSubjectNames } from '#/modules/notification/notification-sources';
import { findReadableSubjectIds } from '#/modules/notification/operations/readable-subjects';
import { accessFrom } from '#/permissions/access';

type NotificationResponse = z.infer<typeof notificationSchema>;

type GetNotificationsInput = Omit<FindNotificationsOpts, 'userId'>;

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

  const [rows, unreadCount] = await Promise.all([findNotificationsByUser(ctx, { userId, ...input }), countUnreadByUser(ctx, { userId })]);

  const readable = await findReadableSubjectIds(accessFrom(ctx), rows);
  const readableRows = rows.filter((row) => readable.has(row.subjectId));

  const [actors, channelNames, subjectTitles] = await Promise.all([
    findUsersMinimal(ctx, { userIds: rows.map((row) => row.actorId).filter((id): id is string => id !== null) }),
    findChannelNames(ctx, { channelIds: readableRows.map((row) => row.channelId) }),
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
