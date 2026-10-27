import { hierarchy } from 'shared';
import { invalidateNotifications } from '~/modules/notification/query';
import { onChangeEvent } from '~/query/realtime/sync-events';

/** One refetch per burst of change events, this long after the first, so the post-commit fan-out has written the notification. */
const refreshDelayMs = 2000;

let timer: ReturnType<typeof setTimeout> | null = null;

function scheduleInboxRefresh() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    invalidateNotifications();
  }, refreshDelayMs);
}

/** Refetches the inbox on every product change event, not on fetched rows: muted and archived scopes fetch late, yet a mention there notifies. */
export function registerNotificationSyncListener(): () => void {
  return onChangeEvent(({ entityType, action }) => {
    if (!hierarchy.isProduct(entityType)) return;
    if (action === 'delete' || action === 'moveOut') return;
    scheduleInboxRefresh();
  });
}
