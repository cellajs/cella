import { appConfig } from 'shared';
import { appNotificationKinds } from '#/schemas/app-schemas';

/**
 * Template-owned kinds. `mention` is addressed to you personally, so it survives a muted channel
 * and mails instantly by default; `comment` and `reply` are thread activity an app's
 * `resolveRecipients` classifies, delivered in-app and by digest, and mailed instantly only when
 * the app sets `has.commentEmails` and the recipient turns comment emails on.
 */
const templateNotificationKinds = ['mention', 'comment', 'reply'] as const;

/**
 * Notification vocabulary: the template kinds plus the app's `appNotificationKinds` (pinned
 * `app-schemas.ts`). Feeds the column enum, the wire schema and the frontend label keys
 * (`c:notification.<kind>`). App kinds behave like `comment` without its email: inbox, digest and
 * push, silenced by a muted membership, never mailed instantly.
 */
export const notificationKinds = [...templateNotificationKinds, ...appNotificationKinds] as const;

export type NotificationKind = (typeof notificationKinds)[number];

/** Kinds the fan-out mails at once: mentions, plus comments and replies when the app sets `has.commentEmails`. */
export const instantEmailKinds = (): NotificationKind[] => (appConfig.has.commentEmails ? ['mention', 'comment', 'reply'] : ['mention']);
