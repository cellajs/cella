import { alertStore } from '~/modules/common/alerter/alert-store';

/** Clears any active down alert once the query cache is restored. */
export const onSuccess = () => {
  alertStore.getState().setDownAlert(null);
};
