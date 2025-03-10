import { useAlertStore } from '~/store/alert';

export const onSuccess = () => {
  // Clear down alerts
  useAlertStore.getState().setDownAlert(null);
};
