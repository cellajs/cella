import { onlineManager } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import i18n from 'i18next';
import { toaster } from '~/modules/common/toaster/toaster';

/** Asserts an entity is present (narrowing to NonNullable) or redirects to /home, toasting an offline cache miss. */
export function redirectOnMissing<T>(entity: T): asserts entity is NonNullable<T> {
  if (entity != null) return;
  if (!onlineManager.isOnline()) {
    toaster.warning(i18n.t('c:offline_cache_miss.text'));
  }
  throw redirect({ to: '/home', replace: true });
}
