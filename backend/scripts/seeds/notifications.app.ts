import type { InsertNotificationModel } from '#/modules/notification/notification-db';
import type { NotificationsSeeded } from './55-notifications.seed';

/** The app's own notifications, inserted after the template's admin mentions; returns the rows it inserted. The template has none. */
export const seedAppNotifications = async (_seeded: NotificationsSeeded): Promise<InsertNotificationModel[]> => [];
