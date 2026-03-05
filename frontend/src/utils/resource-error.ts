import { t } from 'i18next';
import { toaster } from '~/modules/common/toaster/service';

/** Show a localized error toast for a failed CRUD operation on a resource. */
export const createResourceError = (resource: string) => (type: 'create' | 'update' | 'delete') => {
  toaster(t(`error:${type}_resource`, { resource: t(`common:${resource}`) }), 'error');
};
