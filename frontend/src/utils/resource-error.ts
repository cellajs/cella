import { t } from 'i18next';
import { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/toaster';

/** Show a localized error toast for a failed CRUD operation on a resource and mark it as handled. */
export const createResourceError = (resource: string) => (type: 'create' | 'update' | 'delete', err?: Error) => {
  if (err instanceof ApiError) err.toastHandled = true;
  toaster(t(`error:${type}_resource`, { resource: t(`common:${resource}`) }), 'error');
};
