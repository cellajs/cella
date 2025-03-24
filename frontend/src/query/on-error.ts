import i18next from 'i18next';
import { ApiError } from '~/lib/api';
import { i18n } from '~/lib/i18n';
import router from '~/lib/router';
import { flushStoresAndCache } from '~/modules/auth/sign-out';
import { toaster } from '~/modules/common/toaster';
import { useAlertStore } from '~/store/alert';

/**
 * Fallback messages for common 400 errors
 */
const fallbackMessages = (t: (typeof i18n)['t']) => ({
  400: t('error:bad_request_action'),
  401: t('error:unauthorized_action'),
  403: t('error:forbidden_action'),
  404: t('error:not_found'),
  429: t('error:too_many_requests'),
});

const getErrorMessage = (error: ApiError) => {
  const statusCode = Number(error.status);
  const fallback = fallbackMessages(i18n.t);

  if (error.entityType && i18next.exists(`error:resource_${error.type}`)) {
    return i18n.t(`error:resource_${error.type}`, { resource: i18n.t(error.entityType) });
  }
  if (error.type && i18next.exists(`error:${error.type}`)) return i18n.t(`error:${error.type}`);
  if (error.message) return error.message;

  return fallback[statusCode as keyof typeof fallback] || 'Unknown error occurred';
};

/**
 * Global error handler for API requests.
 * Handles network errors, API errors, and redirects to the sign-in page if the user is not authenticated.
 * @param error - The error object.
 */
export const onError = (error: Error | ApiError) => {
  if (error instanceof ApiError) {
    const statusCode = Number(error.status);
    const isSilentSessionAttempt = error.path && ['/me', '/me/menu'].includes(error.path);

    // Maintenance mode
    if ([503, 502].includes(statusCode)) useAlertStore.getState().setDownAlert('maintenance');
    // Authentication service is unavailable
    else if (statusCode === 500 && isSilentSessionAttempt) return useAlertStore.getState().setDownAlert('auth_unavailable');
    // Offline mode
    else if (statusCode === 504) return useAlertStore.getState().setDownAlert('offline');

    // Hide error if casually trying /me or /me/menu. It should fail silently if no valid session.
    if (isSilentSessionAttempt && statusCode === 401) return;

    // Translate, try most specific first
    const errorMessage = getErrorMessage(error);

    // Show toast
    const toastType = error.severity === 'error' ? 'error' : error.severity === 'warn' ? 'warning' : 'info';
    toaster(errorMessage || error.message, toastType);

    // Redirect to sign-in page if the user is not authenticated (unless already on /auth/*)
    if (statusCode === 401 && !location.pathname.startsWith('/auth/')) {
      const redirectOptions: { to: string; search?: { redirect: string } } = {
        to: '/auth/authenticate',
      };

      // Save the current path as a redirect
      if (location.pathname?.length > 2) {
        redirectOptions.search = { redirect: location.pathname };
      }

      flushStoresAndCache();
      router.navigate(redirectOptions);
    }
  }
};
