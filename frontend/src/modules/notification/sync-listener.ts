import { hierarchy } from 'shared';
import { onChangeEvent } from '~/query/realtime/sync-signals';
import { invalidateNotifications } from './query';

/**
 * Debounce before refetching the inbox after related rows sync. Absorbs bursts, and covers the
 * post-commit fan-out writing the notification a moment after the row itself reaches the client.
 */
const REFRESH_DEBOUNCE_MS = 2000;

let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleInboxRefresh() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    invalidateNotifications();
  }, REFRESH_DEBOUNCE_MS);
}

/**
 * Refetches the inbox on announced product activity; whether a row notified this user is a server
 * decision, so the event is only a trigger. Announcements and not fetched rows, because the sync
 * prioritizer defers muted and archived scopes to open-time while a mention still notifies. The
 * frontend cannot know which product types declare a backend notification source, so every
 * product type triggers the debounced refetch; with no sources the inbox stays empty and the
 * refetch is a cheap no-op.
 */
export function registerNotificationSyncListener(): () => void {
  return onChangeEvent(({ entityType, action }) => {
    if (!hierarchy.isProduct(entityType)) return;
    if (action === 'delete' || action === 'moveOut') return;
    scheduleInboxRefresh();
  });
}
