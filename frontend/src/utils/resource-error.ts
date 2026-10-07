import { t } from 'i18next';
import { ApiError } from '~/lib/api';
import type { TKey } from '~/lib/i18n-locales';
import { toaster } from '~/modules/common/toaster/toaster';
import { getErrorInfo } from '~/utils/get-error-info';

/**
 * Localized error toast for a failed CRUD operation on a resource. A request the server refused (4xx) shows the
 * reason it gave under the title. The mutation must opt out of the global error toast via
 * `meta: { suppressGlobalErrorToast: true }`.
 */
export const createResourceError = (resource: string) => (type: 'create' | 'update' | 'delete', error: unknown) => {
  const reason = error instanceof ApiError && error.status < 500 ? getErrorInfo({ error }).message : '';
  toaster.error(t(`error:${type}_resource`, { resource: t(`c:${resource}` as TKey) }), { description: reason || undefined });
};
