import { config } from 'config';
import * as Sentry from '@sentry/react';

export const initSentry = () => {
  // Send errors to Sentry
  Sentry.init({
    dsn: config.sentryDsn,
    enabled: config.mode === 'production',
    environment: config.mode,
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    tracesSampleRate: 1.0,
    // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
    tracePropagationTargets: ['localhost', config.backendUrl, config.frontendUrl, config.tusUrl],
    // Capture Replay for 10% of all sessions, plus for 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
};
