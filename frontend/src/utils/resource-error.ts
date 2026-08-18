import { t } from 'i18next';
import type { TKey } from '~/lib/i18n-locales';
import { toaster } from '~/modules/common/toaster/toaster';

/**
 * Localized error toast for a failed CRUD operation on a resource. The mutation must opt out of the global error
 * toast via `meta: { suppressGlobalErrorToast: true }`.
 */
export const createResourceError = (resource: string) => (type: 'create' | 'update' | 'delete') => {
  toaster.error(t(`error:${type}_resource`, { resource: t(`c:${resource}` as TKey) }));
};
