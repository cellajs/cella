import { CancelledError, type FetchInfiniteQueryOptions, type FetchQueryOptions, onlineManager } from '@tanstack/react-query';
import i18next from 'i18next';
import { ApiError } from '~/lib/api';
import { i18n } from '~/lib/i18n';
import router, { queryClient } from '~/lib/router';
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
  // Ignore cancellation error
  if (error instanceof CancelledError) {
    return console.debug('Ignoring CancelledError');
  }

  // Handle network error (e.g., connection refused)
  if (error instanceof Error && error.message === 'Failed to fetch') toaster(i18n.t('error:network_error'), 'error');

  if (error instanceof ApiError) {
    const statusCode = Number(error.status);

    // Set down alerts
    if ([503, 502].includes(statusCode)) useAlertStore.getState().setDownAlert('maintenance');
    else if (statusCode === 504) useAlertStore.getState().setDownAlert('offline');

    // Abort if /me or /me/menu, it should fail silently
    if (error.path && ['/me', '/me/menu'].includes(error.path)) return;

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

const onSuccess = () => {
  // Clear down alerts
  useAlertStore.getState().setDownAlert(null);
};

/**
 * Function to fetch data with offline support. If online, it will attempt to fetch data and perform a background revalidation.
 * If offline, it will attempt to return cached data. If there is an error during the fetch,
 * it will fall back to cached data if available.
 *
 * @param options - Fetch query options that define the query behavior, including the query key and parameters.
 * @param refetchIfOnline - Optional, flag to control refetching online (default: `true`).
 * @returns Returns query data or undefined.
 */
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export const offlineFetch = async <T>(options: FetchQueryOptions<any, any, any, any>, refetchIfOnline = true): Promise<T | undefined> => {
  const { queryKey } = options;
  const cachedData = queryClient.getQueryData<T>(queryKey);

  // If offline, return cached data if available
  if (!onlineManager.isOnline()) return cachedData ?? undefined;

  try {
    // Remove cached queries to trigger re-fetch if online
    if (refetchIfOnline) queryClient.removeQueries({ queryKey, exact: true });
    return queryClient.fetchQuery(options);
  } catch (error) {
    return cachedData ?? undefined; // Fallback to cached data if available
  }
};

/**
 * Function to fetch infinite data. If online, fetches the query even if there is cached. If offline or an error occurs, it tries to get the cached data.
 *
 * @param options - Fetch infinite query options that define the query behavior and parameters,
 * including the query key and other settings.
 * @param refetchIfOnline - Optional, flag to control refetching online (default: `true`).
 * @returns Returns query data or undefined.
 */
// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export const offlineFetchInfinite = async (options: FetchInfiniteQueryOptions<any, any, any, any, any>, refetchIfOnline = true) => {
  const { queryKey } = options;
  const cachedData = queryClient.getQueryData(queryKey);

  // If offline, return cached data if available
  if (!onlineManager.isOnline()) return cachedData ?? undefined;

  try {
    if (refetchIfOnline) queryClient.removeQueries({ queryKey, exact: true });
    return queryClient.fetchInfiniteQuery(options);
  } catch (error) {
    return cachedData ?? undefined; // Fallback to cached data if available
  }
};

export const queryClientConfig = { onError, onSuccess };
