import { useAlertStore } from '~/modules/common/alerter/alert-store';

/**
 * onSuccess handler for queryClient.
 * Currently limited to clearing any down alerts when the query cache is successfully restored.
 */
export const onSuccess = () => {
  // Clear down alerts
  useAlertStore.getState().setDownAlert(null);
};
