import { appConfig } from 'shared';
import { appNotificationTypes } from '#/schemas/app-schemas';

/**
 * Template-owned types. `mention` is addressed to you personally, so it survives a muted channel
 * and mails instantly by default; `comment` and `reply` are thread activity an app's
 * `resolveRecipients` classifies, delivered in-app and by digest, and mailed instantly only when
 * the app sets `has.commentEmail` and the recipient turns comment emails on.
 */
const templateNotificationTypes = ['mention', 'comment', 'reply'] as const;

/**
 * Notification vocabulary: the template types plus the app's `appNotificationTypes` (pinned
 * `app-schemas.ts`). Feeds the column enum, the wire schema and the frontend label keys
 * (`c:notification.<type>`). App types behave like `comment` without its email: inbox, digest and
 * push, silenced by a muted membership, never mailed instantly.
 */
export const notificationTypes = [...templateNotificationTypes, ...appNotificationTypes] as const;

export type NotificationType = (typeof notificationTypes)[number];

/** Types the instant email pass mails: mentions, plus comments and replies when the app sets `has.commentEmail`. */
export const instantEmailTypes = (): NotificationType[] => (appConfig.has.commentEmail ? ['mention', 'comment', 'reply'] : ['mention']);
