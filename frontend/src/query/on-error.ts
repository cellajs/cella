import { default as i18n, default as i18next } from 'i18next';
import { ApiError } from '~/lib/api';
import router from '~/lib/router';
import { toaster } from '~/modules/common/toaster/service';
import { useAlertStore } from '~/store/alert';
import { flushStores } from '~/utils/flush-stores';

/**
 * Fallback messages for common 400 errors
 */
const fallbackMessages = {
  400: i18n.t('error:bad_request_action'),
  401: i18n.t('error:unauthorized_action'),
  403: i18n.t('error:forbidden_action'),
  404: i18n.t('error:not_found'),
  429: i18n.t('error:too_many_requests'),
};

const getErrorMessage = ({ type, entityType, message, status }: ApiError) => {
  if (entityType && type && i18next.exists(`error:resource_${type}`)) {
    return i18n.t(`error:resource_${type}`, { resource: i18n.t(entityType) });
  }
  if (type && i18next.exists(`error:${type}`)) return i18n.t(`error:${type}`);

  return message || fallbackMessages[status as keyof typeof fallbackMessages] || 'Unknown error occurred';
};

/**
 * Global error handler for API requests.
 * Handles network errors, API errors, and redirects to the sign-in page if the user is not authenticated.
 * @param error - The error object.
 */
export const onError = (error: Error | ApiError) => {
  if (error instanceof ApiError) {
    const statusCode = Number(error.status);

    const isCasualSessionAttempt = error.path && ['/me', '/me/menu'].includes(error.path);

    // Maintenance mode
    if ([503, 502].includes(statusCode)) useAlertStore.getState().setDownAlert('maintenance');
    // Authentication service is unavailable
    else if (statusCode === 500 && isCasualSessionAttempt) return useAlertStore.getState().setDownAlert('auth_unavailable');
    // Offline mode
    else if (statusCode === 504) return useAlertStore.getState().setDownAlert('offline');

    // Hide error if casually trying /me or /me/menu. It should fail silently if no valid session.
    if (isCasualSessionAttempt && statusCode === 401) return;

    // Translate, try most specific first
    const errorMessage = getErrorMessage(error);

    // Show toast
    const toastType = error.severity === 'error' ? 'error' : error.severity === 'warn' ? 'warning' : 'info';
    toaster(errorMessage, toastType);

    // Redirect to sign-in page if the user is not authenticated (unless already on /auth/*)
    if (statusCode === 401 && !location.pathname.startsWith('/auth/')) {
      const redirectOptions: { to: string; search?: { redirect: string } } = {
        to: '/auth/authenticate',
      };

      // Save the current path as a redirect
      if (location.pathname) {
        const url = new URL(location.href);
        const redirectPath = url.pathname + url.search;
        redirectOptions.search = { redirect: redirectPath };
      }

      // Flush sensitive stores and navigate to the sign-in page
      flushStores();
      router.navigate(redirectOptions);
    }
  }
};
