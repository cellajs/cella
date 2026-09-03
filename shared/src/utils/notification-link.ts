import { z } from 'zod';
import { appConfig } from '../config-builder/app-config.ts';

/** Frontend route that resolves a notification link to its subject's channel route. */
export const notificationLinkPath = '/n';

/**
 * Search params of the notification link: the subject's location as the backend snapshots it on
 * the notification row (emails and push carry it), plus the inbox row to mark read on open. With
 * `subjectId`, the channel's `notificationSearch` opens the subject itself (a sheet, a scroll target).
 */
export const notificationLinkSearchSchema = z.object({
  tenantId: z.string(),
  organizationId: z.string(),
  channelId: z.string(),
  channelType: z.enum(appConfig.channelEntityTypes),
  entityType: z.enum(appConfig.productEntityTypes).optional(),
  subjectId: z.string().optional(),
  nid: z.string().optional(),
});

export type NotificationLinkSearch = z.infer<typeof notificationLinkSearchSchema>;

/** Absolute, self-describing link; it outlives the inbox row's retention because nothing is looked up. */
export function buildNotificationLink(frontendUrl: string, search: NotificationLinkSearch): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(notificationLinkSearchSchema.shape) as (keyof NotificationLinkSearch)[]) {
    const value = search[key];
    if (value !== undefined) params.set(key, value);
  }
  return `${frontendUrl}${notificationLinkPath}?${params.toString()}`;
}
