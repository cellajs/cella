import i18n from 'i18next';
import { ApiError } from '~/lib/api';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { toaster } from '~/modules/common/toaster/toaster';
import { checkConnectivity } from '~/query/offline/connectivity';
import { isNetworkError } from '~/query/offline/network-retry';
import type { QueryMeta } from '~/query/react-query';
import { flushStores } from '~/utils/flush-stores';

/** Fallback messages for common errors, called lazily so i18next is initialized. */
const getFallbackMessage = (status: number): string | undefined => {
  const messages: Partial<Record<number, string>> = {
    400: i18n.t('error:bad_request_action'),
    401: i18n.t('error:unauthorized_action'),
    403: i18n.t('error:forbidden_action'),
    404: i18n.t('error:not_found'),
    429: i18n.t('error:too_many_requests'),
  };
  return messages[status];
};

/**
 * Resolves the best error message for display.
 * Priority: resource-specific translation -> type translation -> raw message -> status fallback
 */
const getErrorMessage = ({ type, entityType, message, status }: ApiError) => {
  // Priority 1: Resource-specific translation (e.g., resource_not_found with entity interpolation)
  if (entityType && type && i18n.exists(`error:resource_${type}`)) {
    return i18n.t(`error:resource_${type}`, { resource: i18n.t(entityType) });
  }

  // Priority 2: Direct type translation (e.g., invalid_slug, invalid_cdn_url)
  if (type && i18n.exists(`error:${type}`)) {
    return i18n.t(`error:${type}`);
  }

  // Priority 3: Use message from backend (contains Zod-translated message for form errors)
  if (message) return message;

  // Priority 4: Status-based fallback
  return getFallbackMessage(status) || 'Unknown error occurred';
};

/** Global handler for API request errors: network errors, ApiErrors, and 401 -> sign-in redirect. */
export const onError = (error: Error | ApiError, meta?: QueryMeta) => {
  // Handle network-level failures (no HTTP response received). isNetworkError excludes ApiError,
  // so a server that responded (any status) falls through to the ApiError handling below.
  if (isNetworkError(error)) {
    checkConnectivity();
    return;
  }

  if (error instanceof ApiError) {
    const statusCode = Number(error.status);

    const isCasualSessionAttempt = error.path && ['/me', '/me/menu'].includes(error.path);

    // Maintenance mode
    if ([503, 502].includes(statusCode)) useAlertStore.getState().setDownAlert('maintenance');
    // Authentication service is unavailable
    else if (statusCode === 500 && isCasualSessionAttempt)
      return useAlertStore.getState().setDownAlert('auth_unavailable');
    // Offline mode
    else if (statusCode === 504) return useAlertStore.getState().setDownAlert('offline');

    // Hide error if casually trying /me or /me/menu. It should fail silently if no valid session.
    if (isCasualSessionAttempt && statusCode === 401) return;

    // Unexpected server errors: structured console.error is the Maple SDK's capture
    // path, and logId ties the session timeline to the backend request log.
    if (statusCode >= 500) {
      console.error('[api]', error.type ?? 'server_error', {
        logId: error.logId,
        path: error.path,
        status: statusCode,
      });
    }

    // Honor opt-out from query/mutation `meta`; local handler will (or already did) show its own toast.
    const suppress = meta?.suppressGlobalErrorToast;
    const skipToast = typeof suppress === 'function' ? suppress(error) : suppress === true;

    if (!skipToast) {
      // Translate, try most specific first
      const errorMessage = getErrorMessage(error);

      // For 429 errors, show remaining wait time as description
      let description: string | undefined;
      if (statusCode === 429 && error.meta?.retryAfter) {
        const seconds = Number(error.meta.retryAfter);
        const minutes = Math.ceil(seconds / 60);
        description = i18n.t('c:retry_in_minutes', { count: minutes });
      }
      // Surface the correlation id on error toasts so users can quote it to support.
      else if (error.severity === 'error' && error.logId) {
        description = `Log ID: ${error.logId}`;
      }

      // Show toast
      const toastType = error.severity === 'error' ? 'error' : error.severity === 'warn' ? 'warning' : 'info';
      toaster(errorMessage, toastType, { description });
    }

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

      // Soft-flush sensitive stores, then go to sign-in. Pass `false` so the appdb (unsynced offline
      // work) stays on disk: a 401 is involuntary and the same user usually re-auths and recovers it.
      flushStores(false);
      // Dynamic import breaks circular dep: query-client -> on-error -> router -> route tree -> query-client
      import('~/routes/router').then(({ router: r }) => r.navigate(redirectOptions));
    }
  }
};
