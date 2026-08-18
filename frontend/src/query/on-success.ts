import { useAlertStore } from '~/modules/common/alerter/alert-store';

/** Clears any active down alert once the query cache is restored. */
export const onSuccess = () => {
  useAlertStore.getState().setDownAlert(null);
};
