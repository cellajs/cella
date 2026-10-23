import { alertStore } from '~/modules/common/alerter/alert-store';

/** A successful request clears the down alert: the server answers. */
export const onSuccess = () => {
  alertStore.getState().setDownAlert(null);
};
