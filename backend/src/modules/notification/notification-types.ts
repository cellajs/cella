import { appNotificationTypes } from '#/schemas/app-schemas';

/** Delivery policy for one notification type. In-app delivery is never opt-out. */
export interface NotificationTypePolicy {
  /** Default of the recipient's `<type>Email` preference: one instant email per notification while it stays on. */
  email: boolean;
  /** A muted membership on the row's channel drops the notification; false for types addressed to one person. */
  muted: boolean;
}

/**
 * Template-owned types. `mention` is addressed to you personally, so it ignores mute and mails by
 * default; the others are activity on rows you created or follow and default to the digest.
 */
export const templateNotificationTypes = {
  mention: { email: true, muted: false },
  comment: { email: false, muted: true },
  reply: { email: false, muted: true },
  /** A row you created was changed by someone else (the attachment module's rename notification). */
  edit: { email: false, muted: true },
} as const satisfies Record<string, NotificationTypePolicy>;

/**
 * Notification vocabulary with its delivery policies: the template types plus the app's
 * `appNotificationTypes` (pinned `app-schemas.ts`). Feeds the column enum, the fan-out mute rule,
 * the `<type>Email` preference columns, the unsubscribe categories and the instant email path.
 * `mention` stays template-owned because the mute exception and mention derivation key on it.
 */
export const notificationTypePolicies = {
  ...templateNotificationTypes,
  ...appNotificationTypes,
  mention: templateNotificationTypes.mention,
} satisfies Record<string, NotificationTypePolicy>;

export type NotificationType = keyof typeof notificationTypePolicies & string;

// Object.keys widens to string[]; the policies object is the one place the key set is declared.
const [firstType, ...restTypes] = Object.keys(notificationTypePolicies) as NotificationType[];

/** Non-empty tuple, as the column enum and the zod enum require. */
export const notificationTypes: readonly [NotificationType, ...NotificationType[]] = [firstType, ...restTypes];

export type EmailPreferenceKey = `${NotificationType}Email`;

export const emailPreferenceKey = <T extends NotificationType>(type: T): `${T}Email` => `${type}Email`;

/** One entry per `<type>Email` key, for the column map, wire schema and response shape that mirror the vocabulary. */
export function emailPreferenceRecord<V>(value: (type: NotificationType) => V): Record<EmailPreferenceKey, V> {
  // Filled key by key below; a literal cannot spell keys the app declares.
  const record = {} as Record<EmailPreferenceKey, V>;
  for (const type of notificationTypes) record[emailPreferenceKey(type)] = value(type);
  return record;
}

/** Types a muted membership silences, from the policies. */
export const mutedNotificationTypes: ReadonlySet<NotificationType> = new Set(
  notificationTypes.filter((type) => notificationTypePolicies[type].muted),
);
