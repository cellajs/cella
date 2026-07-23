import { t } from 'i18next';
import { toaster } from '~/modules/common/toaster/toaster';

/**
 * Show a localized error toast for a failed CRUD operation on a resource.
 *
 * The mutation must opt out of the global error toast via
 * `meta: { suppressGlobalErrorToast: true }` so the user only sees this toast.
 */
export const createResourceError = (resource: string) => (type: 'create' | 'update' | 'delete') => {
  toaster.error(t(`error:${type}_resource`, { resource: t(`c:${resource}`) }));
};
