import * as Sentry from '@sentry/react';
import { appConfig } from 'shared';

export const initSentry = () => {
  if (!appConfig.sentryDsn) return;

  // Send errors to Sentry
  Sentry.init({
    dsn: appConfig.sentryDsn,
    debug: appConfig.debug,
    environment: appConfig.mode,
    transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport),
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    tracesSampleRate: 1.0,
    // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
    tracePropagationTargets: ['localhost', appConfig.backendUrl, appConfig.frontendUrl],
    // Capture Replay for 10% of all sessions, plus for 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
};
