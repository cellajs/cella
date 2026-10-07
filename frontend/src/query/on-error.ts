import { createElement, type ReactNode } from 'react';
import { appConfig } from 'shared';
import { sessionLostTypes } from 'shared/utils/session-lost';
import { ApiError } from '~/lib/api';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { ApiErrorDescription } from '~/modules/common/toaster/api-error-description';
import { RetryWait } from '~/modules/common/toaster/retry-wait';
import { toaster } from '~/modules/common/toaster/toaster';
import { checkConnectivity } from '~/query/offline/connectivity';
import { isNetworkError } from '~/query/offline/network-retry';
import type { QueryMeta } from '~/query/react-query';
import { getErrorInfo, getOwnMessage } from '~/utils/get-error-info';
import { teardownUserState } from '~/utils/teardown-user-state';

/**
 * What an error toast says under its title: the wait of a rate-limited request, else what happened in a sentence,
 * the cause as a development server names it, and for severity `error` the request id to quote to support.
 */
const getToastDescription = (error: ApiError, message: string): ReactNode => {
  const statusCode = Number(error.status);

  // The wait counts down for as long as the toast stays open
  if (statusCode === 429 && error.meta?.retryAfter) {
    return createElement(RetryWait, { until: Date.now() + Number(error.meta.retryAfter) * 1000 });
  }

  // A server answers a 5xx with its own message in development only; elsewhere that message is a fixed text.
  const ownMessage = statusCode >= 500 && appConfig.mode === 'development' ? getOwnMessage(error) : '';
  const cause = ownMessage && ownMessage !== message ? ownMessage : undefined;
  const report = error.severity === 'error' && error.requestId ? error : undefined;

  if (!message && !cause && !report) return undefined;
  return createElement(ApiErrorDescription, { message, cause, report });
};

const isSessionLost = (error: ApiError) => !error.type || sessionLostTypes.has(error.type);

/** Global handler for API request errors: network errors, ApiErrors, and a lost session's 401 -> sign-in redirect. */
export const onError = (error: Error | ApiError, meta?: QueryMeta) => {
  // isNetworkError excludes ApiError, so a server that responded with any status falls through to the handling below.
  if (isNetworkError(error)) {
    checkConnectivity();
    return;
  }

  if (error instanceof ApiError) {
    const statusCode = Number(error.status);

    const isCasualSessionAttempt = error.path && ['/me', '/me/menu'].includes(error.path);

    // Maintenance mode: its banner says the service is down and lies over the toast stack, so no toast follows
    const isDown = [503, 502].includes(statusCode);
    if (isDown) useAlertStore.getState().setDownAlert('maintenance');
    // Authentication service is unavailable
    else if (statusCode === 500 && isCasualSessionAttempt) return useAlertStore.getState().setDownAlert('auth_unavailable');
    // Offline mode
    else if (statusCode === 504) return useAlertStore.getState().setDownAlert('offline');

    // A /me or /me/menu probe without a valid session shows no error.
    if (isCasualSessionAttempt && statusCode === 401) return;

    // The structured console.error is the Maple SDK's capture path, and requestId ties the session timeline to the backend request log.
    if (statusCode >= 500) {
      console.error('[api]', error.type ?? 'server_error', { requestId: error.requestId, path: error.path, status: statusCode });
    }

    // Honor opt-out from query/mutation `meta`; local handler will (or already did) show its own toast.
    const suppress = meta?.suppressGlobalErrorToast;
    const skipToast = isDown || (typeof suppress === 'function' ? suppress(error) : suppress === true);

    if (!skipToast) {
      const { title, message } = getErrorInfo({ error });

      const toastType = error.severity === 'error' ? 'error' : error.severity === 'warn' ? 'warning' : 'info';
      toaster[toastType](title, { description: getToastDescription(error, message) });
    }

    if (statusCode === 401 && isSessionLost(error) && !location.pathname.startsWith('/auth/')) {
      const redirectOptions: { to: string; search?: { redirect: string } } = { to: '/auth/authenticate' };

      if (location.pathname) {
        const url = new URL(location.href);
        const redirectPath = url.pathname + url.search;
        redirectOptions.search = { redirect: redirectPath };
      }

      // `false` keeps the localUserDb and its unsynced offline work on disk: a 401 is involuntary and the same user usually re-auths and recovers it.
      teardownUserState(false);
      // Dynamic import breaks the cycle query-client -> on-error -> router -> route tree -> query-client.
      import('~/routes/router').then(({ router: r }) => r.navigate(redirectOptions));
    }
  }
};
