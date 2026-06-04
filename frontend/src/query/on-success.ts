import { useAlertStore } from '~/alerter/alert-store';

/**
 * onSuccess handler for the queryClient \u2014 clears any active "down" alerts when the query
 * cache is successfully restored.
 */
export const onSuccess = () => {
  useAlertStore.getState().setDownAlert(null);
};
