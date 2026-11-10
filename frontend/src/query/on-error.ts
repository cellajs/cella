import { createElement, Fragment, type ReactNode } from 'react';
import { appConfig } from 'shared';
import { isDemoAddress } from 'shared/utils/demo-address';
import { isSessionLost } from 'shared/utils/session-lost';
import { ApiError } from '~/lib/api';
import { boundaryOf } from '~/lib/boundary';
import { ApiErrorDescription } from '~/modules/common/toaster/api-error-description';
import { RetryWait } from '~/modules/common/toaster/retry-wait';
import { toaster } from '~/modules/common/toaster/toaster';
import { userStore } from '~/modules/user/user-store';
import { localUserStorageReady } from '~/query/local-user-storage';
import { isNetworkError } from '~/query/offline/network-retry';
import type { QueryMeta } from '~/query/react-query';
import { getRouter } from '~/routes/-router-instance';
import { getErrorInfo, getErrorMessage } from '~/utils/get-error-info';
import { isTearingDown, teardownUserState } from '~/utils/teardown-user-state';

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
  if (error.status === 429 && error.retryAfter) {
    const wait = createElement(RetryWait, { until: Date.now() + Number(error.retryAfter) * 1000 });
    if (error.type === 'too_many_requests' || !message) return wait;
    return createElement(Fragment, null, `${message} `, wait);
  }

  // A server answers a 5xx with its own message in development only; elsewhere that message is a fixed text.
  const errorMessage = error.status >= 500 && appConfig.mode === 'development' ? getErrorMessage(error) : '';
  const cause = errorMessage && errorMessage !== message ? errorMessage : undefined;
  const report = error.severity === 'error' && error.instance ? error : undefined;

  if (!message && !cause && !report) return undefined;
  return createElement(ApiErrorDescription, { message, cause, report });
};

/** Whether the global error handler signs the tab out over this refusal: a lost session's 401, except on an auth page. */
const tearsDownSession = (error: ApiError): boolean => isSessionLost(error) && !location.pathname.startsWith('/auth/');

/** Global handler for API request errors: network errors, ApiErrors, and a lost session's 401 -> sign-in redirect. */
export const onError = (error: Error | ApiError, meta?: QueryMeta) => {
  // The API client reports a request without a response; an ApiError means the server answered, so it falls through.
  if (isNetworkError(error)) return;

  if (!(error instanceof ApiError)) return;
  const { type, instance, path, status } = error;
  const probe = path === '/me' && status === 401;
  // A demo account's session is its demo: lost, it ends the account, which nothing signs back in, so its browser forgets it and is a visitor again.
  const demo = isDemoAddress(userStore.getState().user?.email);
  // A /me probe without a valid session shows no error: a person's browser stays where it is until a guard sends it to sign in.
  if (probe && !demo) return;

  // The console line with the request id is for developers; Maple's fetch span already records the status and joins the backend trace.
  if (status >= 500) console.error('[api]', type ?? 'server_error', { instance, path, status });

  // A query or mutation with a local toast opts out through `meta`.
  const suppress = meta?.suppressGlobalErrorToast;
  const optedOut = typeof suppress === 'function' ? suppress(error) : suppress === true;
  // The API client raised the down alert for a service that is down; it lies over the toast stack, so no toast follows.
  const skipToast = type === 'service_unavailable' || optedOut || probe;

  if (!skipToast) {
    const { title, message } = getErrorInfo({ error });

    const toastType = toastTypeBySeverity[error.severity ?? 'info'];
    toaster[toastType](title, { description: getToastDescription(error, message) });
  }

  // The 401s of the requests still in flight begin no second teardown.
  if (tearsDownSession(error) && !isTearingDown()) {
    const path = location.pathname + location.search;
    // A bare `/` names nothing to return to: a sign-in without a redirect reaches the same home page.
    const redirect = path === '/' ? undefined : path;
    const leave = async () => {
      const router = getRouter();
      // `fromRoot`: this 401 already found no session, and the user still in the store would have sign-in send the tab back here
      if (!demo) return router.navigate({ to: '/auth/authenticate', search: { fromRoot: true, redirect } });
      // The visitor leaves a page that needs an account for the about page, and stays on any other
      if (boundaryOf(router.state.matches.map((match) => match.staticData)) === 'app') return router.navigate({ to: '/about', replace: true });
    };
    // A demo's localUserDb goes with it, once no restore of its cached queries can refill the cleared cache. Any other stays on disk
    // with its unsynced offline work: a 401 is involuntary and the same user usually re-auths and recovers it.
    if (demo) void localUserStorageReady().then(() => teardownUserState(true, leave));
    else void teardownUserState(false, leave);
  }
};
