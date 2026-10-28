import { createElement, Fragment, type ReactNode } from 'react';
import { appConfig } from 'shared';
import { sessionLostTypes } from 'shared/utils/session-lost';
import { ApiError } from '~/lib/api';
import { alertStore } from '~/modules/common/alerter/alert-store';
import { ApiErrorDescription } from '~/modules/common/toaster/api-error-description';
import { RetryWait } from '~/modules/common/toaster/retry-wait';
import { toaster } from '~/modules/common/toaster/toaster';
import { isNetworkError } from '~/query/offline/network-retry';
import type { QueryMeta } from '~/query/react-query';
import { getErrorInfo, getErrorMessage } from '~/utils/get-error-info';
import { teardownUserState } from '~/utils/teardown-user-state';

/** The toast an API error's severity shows as. */
export const toastTypeBySeverity: Record<NonNullable<ApiError['severity']>, 'error' | 'warning' | 'info'> = {
  fatal: 'error',
  error: 'error',
  warn: 'warning',
  info: 'info',
  debug: 'info',
  trace: 'info',
};

/**
 * What an error toast says under its title: the wait of a rate-limited request, after the sentence of a refusal type
 * of its own, else what happened in a sentence, the cause as a development server names it, and for severity `error`
 * the request id to quote to support.
 */
const getToastDescription = (error: ApiError, message: string): ReactNode => {
  if (error.status === 429 && error.meta?.retryAfter) {
    const wait = createElement(RetryWait, { until: Date.now() + Number(error.meta.retryAfter) * 1000 });
    if (error.type === 'too_many_requests' || !message) return wait;
    return createElement(Fragment, null, `${message} `, wait);
  }

  // A server answers a 5xx with its own message in development only; elsewhere that message is a fixed text.
  const errorMessage = error.status >= 500 && appConfig.mode === 'development' ? getErrorMessage(error) : '';
  const cause = errorMessage && errorMessage !== message ? errorMessage : undefined;
  const report = error.severity === 'error' && error.requestId ? error : undefined;

  if (!message && !cause && !report) return undefined;
  return createElement(ApiErrorDescription, { message, cause, report });
};

const isSessionLost = (error: ApiError) => !error.type || sessionLostTypes.has(error.type);

/** Global handler for API request errors: network errors, ApiErrors, and a lost session's 401 -> sign-in redirect. */
export const onError = (error: Error | ApiError, meta?: QueryMeta) => {
  // The API client reports a request without a response; an ApiError means the server answered, so it falls through.
  if (isNetworkError(error)) return;

  if (error instanceof ApiError) {
    const isCasualSessionAttempt = error.path && ['/me', '/me/menu'].includes(error.path);

    // Maintenance mode: its banner says the service is down and lies over the toast stack, so no toast follows
    const isDown = [503, 502].includes(error.status);
    if (isDown) alertStore.getState().setDownAlert('maintenance');
    else if (error.status === 500 && isCasualSessionAttempt) return alertStore.getState().setDownAlert('auth_unavailable');

    // A /me or /me/menu probe without a valid session shows no error.
    if (isCasualSessionAttempt && error.status === 401) return;

    // The console line with requestId is for developers; Maple's fetch span already records the status and joins the backend trace.
    if (error.status >= 500) {
      console.error('[api]', error.type ?? 'server_error', { requestId: error.requestId, path: error.path, status: error.status });
    }

    // A query or mutation with a local toast opts out through `meta`.
    const suppress = meta?.suppressGlobalErrorToast;
    const skipToast = isDown || (typeof suppress === 'function' ? suppress(error) : suppress === true);

    if (!skipToast) {
      const { title, message } = getErrorInfo({ error });

      const toastType = toastTypeBySeverity[error.severity ?? 'info'];
      toaster[toastType](title, { description: getToastDescription(error, message) });
    }

    if (error.status === 401 && isSessionLost(error) && !location.pathname.startsWith('/auth/')) {
      const redirect = location.pathname + location.search;
      // `false` keeps the localUserDb and its unsynced offline work on disk: a 401 is involuntary and the same user usually re-auths and recovers it.
      teardownUserState(false);
      // Dynamic import: the route tree imports this module, so a static router import would be a cycle.
      import('~/routes/router').then(({ router }) => router.navigate({ to: '/auth/authenticate', search: { redirect } }));
    }
  }
};
