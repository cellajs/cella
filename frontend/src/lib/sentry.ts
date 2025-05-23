import * as Sentry from '@sentry/react';
import { config } from 'config';

// Initialize Sentry
window.ononline = () => {
  initSentry();
};

// Close Sentry when offline to avoid sending errors
window.onoffline = () => {
  console.info('You went offline. Closing Sentry.');
  Sentry.close();
};

export const initSentry = () => {
  // Send errors to Sentry
  Sentry.init({
    enabled: !!config.sentryDsn,
    dsn: config.sentryDsn,
    environment: config.mode,
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    tracesSampleRate: 1.0,
    // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
    tracePropagationTargets: ['localhost', config.backendUrl, config.frontendUrl],
    // Capture Replay for 10% of all sessions, plus for 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
};
