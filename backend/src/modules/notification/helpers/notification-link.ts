import { appConfig } from 'shared';

/** Location of a notification's subject: the fields the frontend `/n` route needs to resolve a channel route. */
export interface NotificationLinkTarget {
  tenantId: string;
  organizationId: string;
  channelId: string;
  channelType: string;
  entityType: string;
  subjectId: string;
  /** The inbox row to mark read on open; absent for push, which precedes the row ids. */
  notificationId?: string;
}

/**
 * Self-describing deep link for emails and push: the notification row snapshots the subject's
 * location, so the link carries it and resolves in the frontend (`notification-link.ts`) without
 * a lookup. It therefore outlives the inbox row's retention and needs no frontend route knowledge
 * here.
 */
export function buildNotificationLink(target: NotificationLinkTarget): string {
  const search = new URLSearchParams({
    tenantId: target.tenantId,
    organizationId: target.organizationId,
    channelId: target.channelId,
    channelType: target.channelType,
    entityType: target.entityType,
    subjectId: target.subjectId,
  });
  if (target.notificationId) search.set('nid', target.notificationId);
  return `${appConfig.frontendUrl}/n?${search.toString()}`;
}
