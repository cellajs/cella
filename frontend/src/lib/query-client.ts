import { type FetchInfiniteQueryOptions, type FetchQueryOptions, onlineManager } from '@tanstack/react-query';
import i18next from 'i18next';
import { ApiError } from '~/lib/api';
import { i18n } from '~/lib/i18n';
import router, { queryClient } from '~/lib/router';
import { flushStoresAndCache } from '~/modules/auth/sign-out';
import { useAlertStore } from '~/store/alert';
import { createToast } from './toasts';

// Fallback messages for common errors
const fallbackMessages = (t: (typeof i18n)['t']) => ({
  400: t('common:error.bad_request_action'),
  401: t('common:error.unauthorized_action'),
  403: t('common:error.forbidden_action'),
  404: t('common:error.not_found'),
  429: t('common:error.too_many_requests'),
});

export const onError = (error: Error) => {
  if (error instanceof Error && error.message === 'Failed to fetch') {
    // Handle network error (e.g., connection refused)
    createToast(i18n.t('common:error.network_error'), 'error');
  }

  if (error instanceof ApiError) {
    const statusCode = Number(error.status);

    // Set down alerts
    if ([503, 502].includes(statusCode)) useAlertStore.getState().setDownAlert('maintenance');
    else if (statusCode === 504) useAlertStore.getState().setDownAlert('offline');

    // Abort if /me or /me/menu, it should fail silently
    if (error.path && ['/me', '/me/menu'].includes(error.path)) return;

    const fallback = fallbackMessages(i18n.t);

    // Translate, try most specific first
    const errorMessage =
      error.entityType && i18next.exists(`common:error.resource_${error.type}`)
        ? i18n.t(`error.resource_${error.type}`, { resource: i18n.t(error.entityType) })
        : error.type && i18next.exists(`common:error.${error.type}`)
          ? i18n.t(`common:error.${error.type}`)
          : fallback[statusCode as keyof typeof fallback];

    // Show toast
    if (error.severity === 'info') createToast(errorMessage || error.message, 'info');
    else createToast(errorMessage || error.message, 'error');

    // Redirect to sign-in page if the user is not authenticated (unless already on /auth/*)
    if (statusCode === 401 && !location.pathname.startsWith('/auth/')) {
      // Redirect to sign-in page if the user is not authenticated (except for /me)
      const redirectOptions: { to: string; replace: boolean; search?: { redirect: string } } = {
        to: '/auth/sign-in',
        replace: true,
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

// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export const offlineFetch = async (options: FetchQueryOptions<any, any, any, any>) => {
  const cachedData = queryClient.getQueryData(options.queryKey);

  // If offline, return cached data or undefined if no cache exists
  if (!onlineManager.isOnline()) return cachedData ?? undefined;

  try {
    // If online, fetch data (background revalidation)
    return queryClient.fetchQuery(options);
  } catch (error) {
    // Fallback to cached data if available
    return cachedData ?? undefined;
  }
};

// biome-ignore lint/suspicious/noExplicitAny: any is used to infer the type of the options
export const offlineFetchInfinite = async (options: FetchInfiniteQueryOptions<any, any, any, any, any>) => {
  const cachedData = queryClient.getQueryData(options.queryKey);

  // If offline, return cached data or undefined if no cache exists
  if (!onlineManager.isOnline()) return cachedData ?? undefined;

  try {
    // If online, fetch data (background revalidation)
    return queryClient.fetchInfiniteQuery(options);
  } catch (error) {
    // Fallback to cached data if available
    return cachedData ?? undefined;
  }
};

export const queryClientConfig = { onError, onSuccess };
