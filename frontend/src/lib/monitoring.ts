import {
  type Breadcrumb,
  browserSessionIntegration,
  browserTracingCoreIntegration,
  captureException,
  type ErrorEvent,
  fetchTracingIntegration,
  getIsolationScope,
  init,
  setUser,
} from '@sentry/browser';
import { isNotFound, isRedirect } from '@tanstack/react-router';
import { client } from 'sdk/client.gen';
import { appConfig } from 'shared';
import type { CleanSpanAttributes } from 'shared/tracing';
import { escapeRegExp } from 'shared/utils/escape-regexp';
import { scrubUrl } from 'shared/utils/scrub-url';
import { env } from '~/env';
import { ApiError } from '~/lib/api';
import { useUserStore } from '~/modules/user/user-store';

/**
 * The DSN this page reports its errors and sessions to, in the Sentry envelope protocol. Development and tunnel read
 * `VITE_MONITORING_DSN` from this machine; every other mode reads `monitoring.dsn` from its config. Empty, nothing is sent.
 * A test that mocks `shared` with a partial appConfig gets none.
 */
const dsn = appConfig.mode === 'development' || appConfig.mode === 'tunnel' ? (env.VITE_MONITORING_DSN ?? '') : (appConfig.monitoring?.dsn ?? '');

/** Whether the browser reports its errors and sessions. */
export const monitoringEnabled = !!dsn;

/** Names the signed-in user by their opaque id and nothing else, or nobody; a session keeps the user it started with. */
const identify = (userId: string | null) => setUser(userId ? { id: userId } : null);

/** The id of this page load's session, which every API request names in its `baggage`. */
const pageSessionId = (): string | undefined => getIsolationScope().getSession()?.sid;

/**
 * The URLs the SDK collected, through the redaction the backend's logs and spans use. The SDK's own filter covers a few
 * query keys and no fragment, where a launch's handoff code travels.
 */
const scrubRequestUrls = (event: ErrorEvent): ErrorEvent => {
  const request = event.request;
  if (request?.url) request.url = scrubUrl(request.url);
  if (request?.headers?.Referer) request.headers.Referer = scrubUrl(request.headers.Referer);
  return event;
};

/**
 * The attributes the SDK quotes when it names a clicked or typed-in element. A page labels an element with what it
 * shows, such as a member's name on an avatar or an address in an invite list.
 */
const labelAttributes = /\[(?:aria-label|title|alt)="[\s\S]*?"\](?=\[| > |$)/g;

/** A request's `url` and a navigation's `from` and `to` through the same redaction, and an element without its labels. */
const scrubBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => {
  for (const key of ['url', 'from', 'to']) {
    const value = breadcrumb.data?.[key];
    if (breadcrumb.data && typeof value === 'string') breadcrumb.data[key] = scrubUrl(value);
  }
  if (breadcrumb.category?.startsWith('ui.') && breadcrumb.message) breadcrumb.message = breadcrumb.message.replace(labelAttributes, '');
  return breadcrumb;
};

if (monitoringEnabled) {
  // Set before the session starts: a page loaded signed in names its user in the session's first update.
  let userId = useUserStore.getState().user?.id ?? null;
  identify(userId);
  useUserStore.subscribe(({ user }) => {
    if ((user?.id ?? null) === userId) return;
    userId = user?.id ?? null;
    identify(userId);
  });

  init({
    dsn,
    release: __APP_VERSION__,
    environment: appConfig.mode,
    integrations: [
      // One session per page load, the default since version 11, named so a later default cannot change it.
      browserSessionIntegration({ lifecycle: 'page' }),
      // A trace per page load and per navigation, and its headers on every API request. No span is sent: no sample rate.
      browserTracingCoreIntegration(),
      fetchTracingIntegration(),
    ],
    tracePropagationTargets: [new RegExp(`^${escapeRegExp(appConfig.backendUrl)}(/|$)`)],
    propagateTraceparent: true,
    // No address is inferred and no cookie read; the user is the id `identify` sets.
    dataCollection: { userInfo: false, cookies: false },
    // A failed API response is the server's error, which the server reports; the trace ties this page to it.
    beforeSend: (event, hint) => (hint.originalException instanceof ApiError ? null : scrubRequestUrls(event)),
    // The app's own console output stays in the page, but for its warnings and errors, which precede a failure.
    beforeBreadcrumb: (breadcrumb) =>
      breadcrumb.category === 'console' && breadcrumb.level !== 'warning' && breadcrumb.level !== 'error' ? null : scrubBreadcrumb(breadcrumb),
  });

  // The backend's request span records the page's session, and the SDK adds its own entries after it.
  client.interceptors.request.use((request) => {
    const sessionId = pageSessionId();
    if (sessionId) request.headers.set('baggage', `session.id=${sessionId}`);
    return request;
  });
}

/**
 * Reports an ok API response the SDK refused because it does not match the spec: a handler bug, or an older client
 * meeting a newer server. This is its one trace: the global query error handler shows only network errors and ApiErrors.
 */
export const reportRejectedResponse = (error: unknown, path: string, status: number) => {
  console.error('[api] response does not match the spec', { path, status }, error);
  if (monitoringEnabled) captureException(error, { contexts: { api: { path, status } } });
};

/** The root hook each scope of `main.tsx` comes from, as the event names it. */
const reactHooks = { boundary: 'onCaughtError', uncaught: 'onUncaughtError' } as const;

/**
 * Reports an error a root hook received: a boundary caught it (`boundary`) or none did (`uncaught`). Either is
 * unhandled, and this is the one place that marks it: the page's session then ends unstable. The router's not-found and
 * redirect errors are control flow, which its own components render, and report nothing.
 */
export const reportReactError = (scope: keyof typeof reactHooks, error: unknown, componentStack?: string | null) => {
  if (isNotFound(error) || isRedirect(error)) return;
  const hook = reactHooks[scope];
  console.error(`[react:${hook}]`, error, componentStack ? `\n${componentStack}` : '');
  if (!monitoringEnabled) return;
  captureException(error, {
    mechanism: { type: 'auto.function.react.error_handler', handled: false, data: { hook } },
    captureContext: { contexts: { react: { componentStack } } },
  });
};

/** Reports a failure the app caught and continued from, named by `name`: handled, so the session stays stable. */
export const reportHandledError = (name: string, error: unknown, attributes: CleanSpanAttributes) => {
  if (monitoringEnabled) captureException(error, { tags: { failure: name }, contexts: { failure: attributes } });
};
