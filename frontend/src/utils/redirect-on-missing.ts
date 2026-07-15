import { onlineManager } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import i18n from 'i18next';
import { useToastStore } from '~/modules/common/toaster/toast-store';

/**
 * Asserts a required entity is present, else throws a redirect to /home (narrows to NonNullable).
 * Shows an offline cache-miss toast when offline.
 */
export function redirectOnMissing<T>(entity: T): asserts entity is NonNullable<T> {
  if (entity != null) return;
  if (!onlineManager.isOnline()) {
    useToastStore.getState().showToast(i18n.t('c:offline_cache_miss.text'), 'warning');
  }
  throw redirect({ to: '/home', replace: true });
}
