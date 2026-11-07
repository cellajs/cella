/**
 * Wire payload for one push, `{ t: 'notif', ... }`. Ids only, never content: the service worker
 * recounts through the API (always current, and nothing sensitive rides the push service).
 */
export interface NotificationPushPayload {
  t: 'notif';
  activityId: string;
  channelId: string;
  /** The notification's kind, which picks the toast's title. */
  kind: string;
  /** Self-describing `/n` link to the subject (ids only); the click handler opens it. */
  url?: string;
}
